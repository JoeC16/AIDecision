-- ============================================================
-- AiDecision — Initial Schema
-- EU AI Act Article 12 compliant audit infrastructure
--
-- Design principles:
--   1. decision_events is APPEND-ONLY — enforced by trigger,
--      not just policy. Even service role cannot alter records.
--   2. API keys are stored hashed (SHA-256). Plaintext never
--      persists beyond the generation request.
--   3. Every row is scoped to an org_id — decisions from one
--      customer are never visible to another.
--   4. Deploy to Frankfurt region (eu-central-1) for EU data
--      residency compliance.
-- ============================================================

-- ── Extensions ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Organisations ───────────────────────────────────────────
CREATE TABLE organisations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organisations IS
    'One row per AiDecision customer. All data is scoped to org_id.';

-- ── API Keys ────────────────────────────────────────────────
-- The SDK sends `Authorization: Bearer <key>`.
-- We hash the key on arrival and look up by hash — plaintext is never stored.
CREATE TABLE api_keys (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL DEFAULT 'Default',
    key_hash    TEXT        NOT NULL UNIQUE,  -- SHA-256 hex of the raw key
    key_prefix  TEXT        NOT NULL,         -- e.g. "aid_live_a3f9" — shown in dashboard
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ                   -- NULL = active
);

CREATE INDEX idx_api_keys_org_id   ON api_keys(org_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;

COMMENT ON COLUMN api_keys.key_hash IS
    'SHA-256 of the raw API key. Never store the plaintext.';
COMMENT ON COLUMN api_keys.key_prefix IS
    'First ~16 characters of the key for user-facing display. Safe to show.';

-- ── Decision Events ─────────────────────────────────────────
-- The core audit log. Fields match the Python DecisionEvent dataclass exactly.
-- This table is append-only — see triggers below.
CREATE TABLE decision_events (
    -- Internal tracking
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID        NOT NULL REFERENCES organisations(id),
    api_key_id      UUID        REFERENCES api_keys(id),
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hash_verified   BOOLEAN     NOT NULL DEFAULT FALSE,

    -- SDK fields (mirror of aidecision.models.DecisionEvent)
    decision_id     TEXT        NOT NULL,
    system_id       TEXT        NOT NULL,
    captured_at     TIMESTAMPTZ NOT NULL,
    latency_ms      FLOAT,
    model           TEXT        NOT NULL DEFAULT '',
    provider        TEXT        NOT NULL DEFAULT '',
    input_payload   JSONB       NOT NULL,
    output_payload  JSONB       NOT NULL,
    payload_hash    TEXT        NOT NULL,
    environment     TEXT        NOT NULL DEFAULT 'production',
    sdk_version     TEXT        NOT NULL DEFAULT '',
    extra           JSONB       NOT NULL DEFAULT '{}'
);

-- Query patterns: filter by org, system, time range, provider
CREATE INDEX idx_decision_events_org_id      ON decision_events(org_id);
CREATE INDEX idx_decision_events_system_id   ON decision_events(org_id, system_id);
CREATE INDEX idx_decision_events_captured_at ON decision_events(org_id, captured_at DESC);
CREATE INDEX idx_decision_events_decision_id ON decision_events(decision_id);
CREATE INDEX idx_decision_events_provider    ON decision_events(org_id, provider);
CREATE INDEX idx_decision_events_environment ON decision_events(org_id, environment);
-- Full-text search across payload content
CREATE INDEX idx_decision_events_input_gin   ON decision_events USING GIN(input_payload);
CREATE INDEX idx_decision_events_output_gin  ON decision_events USING GIN(output_payload);

COMMENT ON TABLE decision_events IS
    'Append-only audit log of every AI decision. Never modified after insert. '
    'EU AI Act Article 12 compliant.';
COMMENT ON COLUMN decision_events.hash_verified IS
    'TRUE if the ingest function recomputed the SHA-256 and it matched payload_hash.';
COMMENT ON COLUMN decision_events.payload_hash IS
    'SHA-256 of canonical_json({input: input_payload, output: output_payload}). '
    'Recompute to verify record integrity at any time.';

-- ── Append-only enforcement ─────────────────────────────────
-- This is the technical heart of the tamper-evidence guarantee.
-- Even a compromised service role key cannot silently alter audit records.
-- Any attempt to UPDATE or DELETE raises a hard error.

CREATE OR REPLACE FUNCTION prevent_decision_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'decision_events is append-only. Modification of audit records is not '
        'permitted under AiDecision tamper-evidence policy. (decision_id: %, '
        'attempted operation: %)',
        OLD.decision_id,
        TG_OP
    USING ERRCODE = 'insufficient_privilege';
    RETURN NULL;
END;
$$;

CREATE TRIGGER decision_events_no_update
    BEFORE UPDATE ON decision_events
    FOR EACH ROW EXECUTE FUNCTION prevent_decision_modification();

CREATE TRIGGER decision_events_no_delete
    BEFORE DELETE ON decision_events
    FOR EACH ROW EXECUTE FUNCTION prevent_decision_modification();

-- ── Row Level Security ──────────────────────────────────────
-- JWT must contain app_metadata.org_id (set server-side at signup).
-- The ingest edge function uses service_role and bypasses RLS — it sets
-- org_id explicitly after validating the API key.

ALTER TABLE organisations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_events ENABLE ROW LEVEL SECURITY;

-- Helper: extract org_id from JWT claims
CREATE OR REPLACE FUNCTION auth_org_id() RETURNS UUID
LANGUAGE sql STABLE
AS $$
    SELECT (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID;
$$;

-- Organisations
CREATE POLICY "orgs_select_own"
    ON organisations FOR SELECT
    USING (id = auth_org_id());

-- API Keys
CREATE POLICY "api_keys_select_own"
    ON api_keys FOR SELECT
    USING (org_id = auth_org_id());

CREATE POLICY "api_keys_insert_own"
    ON api_keys FOR INSERT
    WITH CHECK (org_id = auth_org_id());

-- Revoke = set revoked_at, no hard deletes
CREATE POLICY "api_keys_update_own"
    ON api_keys FOR UPDATE
    USING (org_id = auth_org_id());

-- Decision Events: read-only for dashboard users
-- INSERT is via service role (edge function) only
CREATE POLICY "decision_events_select_own"
    ON decision_events FOR SELECT
    USING (org_id = auth_org_id());

-- No INSERT policy for anon/authenticated — only service role can insert.
-- No UPDATE/DELETE policy — trigger blocks those even for service role.

-- ── User → Org mapping ──────────────────────────────────────
-- On signup, a new org is created and the user's app_metadata.org_id is set.
-- This is handled by the auth.users trigger below.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_org_id UUID;
BEGIN
    -- Create an org for this user
    INSERT INTO organisations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data ->> 'organisation_name', 'My Organisation'))
    RETURNING id INTO new_org_id;

    -- Stamp org_id onto the user's app_metadata so RLS policies work
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('org_id', new_org_id)
    WHERE id = NEW.id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
