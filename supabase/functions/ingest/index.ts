/**
 * AiDecision — Ingest Edge Function
 * POST /functions/v1/ingest
 *
 * Receives batches of DecisionEvents from the Python SDK,
 * verifies their SHA-256 hashes, and inserts them into
 * the append-only decision_events table.
 *
 * Auth: Authorization: Bearer <api_key>
 * Body: { "events": [DecisionEvent, ...] }  (max 100 per request)
 *
 * Deployed to: Frankfurt (eu-central-1) for EU data residency.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_EVENTS_PER_REQUEST = 100;

interface DecisionEventPayload {
  decision_id: string;
  system_id: string;
  captured_at: string;
  latency_ms: number | null;
  model: string;
  provider: string;
  input_payload: unknown;
  output_payload: unknown;
  payload_hash: string;
  environment: string;
  sdk_version: string;
  extra: Record<string, unknown>;
}

// ── Canonical JSON (must match Python's json.dumps sort_keys=True) ──────────
//
// Python: json.dumps(obj, sort_keys=True, separators=(",",":"), default=str)
// We replicate this by recursively sorting object keys before JSON.stringify.
// Arrays are NOT sorted — only object keys.
//
function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

async function verifyPayloadHash(
  inputPayload: unknown,
  outputPayload: unknown,
  claimedHash: string
): Promise<boolean> {
  try {
    // Canonical structure mirrors Python's _hash_payload()
    const canonical = JSON.stringify(
      sortKeys({ input: inputPayload, output: outputPayload })
    );
    const encoded = new TextEncoder().encode(canonical);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `sha256:${hashHex}` === claimedHash;
  } catch {
    return false;
  }
}

async function hashApiKey(rawKey: string): Promise<string> {
  const encoded = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Response helpers ─────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-AiDecision-SDK",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── 1. Validate API key ────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header. Expected: Bearer <api_key>" }, 401);
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    return json({ error: "Empty API key" }, 401);
  }

  const keyHash = await hashApiKey(rawKey);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: keyRecord, error: keyError } = await supabase
    .from("api_keys")
    .select("id, org_id, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyError) {
    console.error("API key lookup error:", keyError);
    return json({ error: "Internal error during authentication" }, 500);
  }

  if (!keyRecord) {
    return json({ error: "Invalid API key" }, 401);
  }

  if (keyRecord.revoked_at) {
    return json({ error: "API key has been revoked" }, 401);
  }

  // ── 2. Parse request body ─────────────────────────────────────────────────
  let body: { events?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }

  if (!Array.isArray(body.events)) {
    return json({ error: '"events" must be a non-empty array' }, 400);
  }

  const events = body.events as DecisionEventPayload[];

  if (events.length === 0) {
    return json({ error: '"events" array must not be empty' }, 400);
  }

  if (events.length > MAX_EVENTS_PER_REQUEST) {
    return json(
      { error: `Maximum ${MAX_EVENTS_PER_REQUEST} events per request. Received: ${events.length}` },
      400
    );
  }

  // ── 3. Verify hashes and build rows ──────────────────────────────────────
  const rows = [];
  const verificationResults = [];

  for (const event of events) {
    // Validate required fields
    if (!event.decision_id || !event.system_id || !event.captured_at) {
      return json(
        { error: `Event missing required fields (decision_id, system_id, captured_at)`, event },
        400
      );
    }

    const hashVerified = await verifyPayloadHash(
      event.input_payload,
      event.output_payload,
      event.payload_hash
    );

    if (!hashVerified) {
      console.warn(
        `Hash mismatch for decision ${event.decision_id} — storing with hash_verified=false`
      );
    }

    verificationResults.push({
      decision_id: event.decision_id,
      hash_verified: hashVerified,
    });

    rows.push({
      org_id: keyRecord.org_id,
      api_key_id: keyRecord.id,
      hash_verified: hashVerified,
      decision_id: event.decision_id,
      system_id: event.system_id,
      captured_at: event.captured_at,
      latency_ms: event.latency_ms ?? null,
      model: event.model || "",
      provider: event.provider || "",
      input_payload: event.input_payload,
      output_payload: event.output_payload,
      payload_hash: event.payload_hash,
      environment: event.environment || "production",
      sdk_version: event.sdk_version || "",
      extra: event.extra || {},
    });
  }

  // ── 4. Insert (service role bypasses RLS) ─────────────────────────────────
  const { error: insertError } = await supabase
    .from("decision_events")
    .insert(rows);

  if (insertError) {
    console.error("Insert error:", insertError);
    return json(
      { error: "Failed to store events", detail: insertError.message },
      500
    );
  }

  // ── 5. Respond ────────────────────────────────────────────────────────────
  return json({
    received: rows.length,
    verification: verificationResults,
  });
});
