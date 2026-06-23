"""
Tests for the aidecision SDK.

Run with: pytest tests/
"""

import hashlib
import json
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

import aidecision
from aidecision.capture import _canonical_json, _hash_payload, capture_event
from aidecision.exceptions import ConfigurationError, ProviderError
from aidecision.models import DecisionEvent
from aidecision.store import AuditStore
from aidecision.wrapper import wrap


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_openai_response(content="Approved", model="gpt-4o-2024-08-06"):
    """Build a mock OpenAI ChatCompletion response."""
    response = MagicMock()
    response.__class__.__module__ = "openai.types.chat"
    response.__class__.__name__ = "ChatCompletion"
    response.id = "chatcmpl-test123"
    response.model = model
    choice = MagicMock()
    choice.index = 0
    choice.message.role = "assistant"
    choice.message.content = content
    choice.finish_reason = "stop"
    response.choices = [choice]
    response.usage.prompt_tokens = 20
    response.usage.completion_tokens = 10
    return response


def make_anthropic_response(content="APPROVED — risk score 0.12", model="claude-sonnet-4-6"):
    """Build a mock Anthropic Message response."""
    response = MagicMock()
    response.__class__.__module__ = "anthropic.types"
    response.__class__.__name__ = "Message"
    response.id = "msg_test456"
    response.model = model
    block = MagicMock()
    block.type = "text"
    block.text = content
    response.content = [block]
    response.stop_reason = "end_turn"
    response.usage.input_tokens = 15
    response.usage.output_tokens = 8
    return response


def make_openai_client():
    client = MagicMock()
    client.__class__.__module__ = "openai"
    client.__class__.__name__ = "OpenAI"
    client.chat.completions.create.return_value = make_openai_response()
    return client


def make_anthropic_client():
    client = MagicMock()
    client.__class__.__module__ = "anthropic"
    client.__class__.__name__ = "Anthropic"
    client.messages.create.return_value = make_anthropic_response()
    return client


# ── Models ───────────────────────────────────────────────────────────────────

class TestDecisionEvent:
    def test_auto_generates_decision_id(self):
        event = DecisionEvent()
        assert event.decision_id.startswith("DEC-")
        assert len(event.decision_id) > 4

    def test_two_events_have_different_ids(self):
        a = DecisionEvent()
        b = DecisionEvent()
        assert a.decision_id != b.decision_id

    def test_to_dict_contains_required_fields(self):
        event = DecisionEvent(system_id="test-system", model="gpt-4o")
        d = event.to_dict()
        for key in ["decision_id", "system_id", "captured_at", "model", "payload_hash"]:
            assert key in d

    def test_timestamp_iso_is_string(self):
        event = DecisionEvent()
        assert isinstance(event.timestamp_iso, str)
        assert "T" in event.timestamp_iso  # ISO 8601 format


# ── Capture ───────────────────────────────────────────────────────────────────

class TestCapture:
    def test_canonical_json_is_deterministic(self):
        obj = {"b": 2, "a": 1, "c": [3, 1, 2]}
        assert _canonical_json(obj) == _canonical_json(obj)

    def test_canonical_json_sorts_keys(self):
        result = _canonical_json({"z": 1, "a": 2})
        assert result.index('"a"') < result.index('"z"')

    def test_hash_starts_with_sha256(self):
        h = _hash_payload({"messages": "hello"}, {"choices": "world"})
        assert h.startswith("sha256:")

    def test_hash_is_64_hex_chars(self):
        h = _hash_payload("input", "output")
        hex_part = h.replace("sha256:", "")
        assert len(hex_part) == 64
        assert all(c in "0123456789abcdef" for c in hex_part)

    def test_different_inputs_produce_different_hashes(self):
        h1 = _hash_payload("input A", "output")
        h2 = _hash_payload("input B", "output")
        assert h1 != h2

    def test_different_outputs_produce_different_hashes(self):
        h1 = _hash_payload("input", "output A")
        h2 = _hash_payload("input", "output B")
        assert h1 != h2

    def test_capture_event_from_openai_response(self):
        response = make_openai_response()
        start = time.perf_counter()
        event = capture_event(
            system_id="test-system",
            input_payload={"messages": [{"role": "user", "content": "test"}]},
            response=response,
            start_time=start,
        )
        assert event.system_id == "test-system"
        assert event.provider == "openai"
        assert event.model == "gpt-4o-2024-08-06"
        assert event.payload_hash.startswith("sha256:")
        assert event.latency_ms >= 0

    def test_capture_event_from_anthropic_response(self):
        response = make_anthropic_response()
        start = time.perf_counter()
        event = capture_event(
            system_id="fraud-detection",
            input_payload={"messages": [{"role": "user", "content": "test"}]},
            response=response,
            start_time=start,
        )
        assert event.provider == "anthropic"
        assert event.model == "claude-sonnet-4-6"
        assert event.payload_hash.startswith("sha256:")

    def test_hash_is_reproducible(self):
        """Same input+output always produces the same hash — critical for integrity."""
        response = make_openai_response(content="APPROVED")
        input_payload = {"messages": [{"role": "user", "content": "Assess credit risk"}]}
        start = time.perf_counter()
        e1 = capture_event("sys", input_payload, response, start)
        e2 = capture_event("sys", input_payload, response, start)
        # Hashes must be identical for the same payload
        assert e1.payload_hash == e2.payload_hash


# ── Store ─────────────────────────────────────────────────────────────────────

class TestAuditStore:
    def test_local_mode_writes_jsonl(self, tmp_path):
        log_file = tmp_path / "decisions.jsonl"
        store = AuditStore(local_mode=True, local_log_path=log_file)

        event = DecisionEvent(system_id="test", model="gpt-4o", payload_hash="sha256:abc")
        store.enqueue(event)

        # Give the background thread time to flush
        time.sleep(0.2)
        store._flush()

        assert log_file.exists()
        lines = log_file.read_text().strip().split("\n")
        assert len(lines) >= 1
        record = json.loads(lines[0])
        assert record["system_id"] == "test"
        assert record["payload_hash"] == "sha256:abc"

    def test_enqueue_does_not_raise_when_full(self):
        store = AuditStore(local_mode=True)
        # Fill the queue beyond max
        for _ in range(1100):
            store.enqueue(DecisionEvent())
        # Should not raise

    def test_local_jsonl_is_valid_json_per_line(self, tmp_path):
        log_file = tmp_path / "decisions.jsonl"
        store = AuditStore(local_mode=True, local_log_path=log_file)

        for i in range(5):
            store.enqueue(DecisionEvent(system_id=f"system-{i}"))

        store._flush()

        lines = log_file.read_text().strip().split("\n")
        for line in lines:
            record = json.loads(line)  # Must not raise
            assert "decision_id" in record


# ── Wrapper ───────────────────────────────────────────────────────────────────

class TestWrap:
    def test_wrap_requires_system_id(self):
        client = make_openai_client()
        with pytest.raises(ConfigurationError):
            wrap(client, system_id="")

    def test_wrap_rejects_system_id_with_spaces(self):
        client = make_openai_client()
        with pytest.raises(ConfigurationError):
            wrap(client, system_id="my system")

    def test_wrap_openai_returns_original_response(self):
        original_client = make_openai_client()
        store = AuditStore(local_mode=True)
        wrapped = wrap(original_client, system_id="test-system", store=store)

        response = wrapped.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "test"}]
        )
        assert response is not None
        assert response.choices[0].message.content == "Approved"

    def test_wrap_anthropic_returns_original_response(self):
        original_client = make_anthropic_client()
        store = AuditStore(local_mode=True)
        wrapped = wrap(original_client, system_id="fraud-v1", store=store)

        response = wrapped.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=100,
            messages=[{"role": "user", "content": "test"}]
        )
        assert response.content[0].text == "APPROVED — risk score 0.12"

    def test_wrap_enqueues_event_on_openai_call(self, tmp_path):
        log_file = tmp_path / "decisions.jsonl"
        store = AuditStore(local_mode=True, local_log_path=log_file)
        original_client = make_openai_client()
        wrapped = wrap(original_client, system_id="credit-scoring-v2", store=store)

        wrapped.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Assess risk for applicant 123"}]
        )

        store._flush()

        assert log_file.exists()
        record = json.loads(log_file.read_text().strip())
        assert record["system_id"] == "credit-scoring-v2"
        assert record["provider"] == "openai"
        assert record["payload_hash"].startswith("sha256:")

    def test_wrap_enqueues_event_on_anthropic_call(self, tmp_path):
        log_file = tmp_path / "decisions.jsonl"
        store = AuditStore(local_mode=True, local_log_path=log_file)
        original_client = make_anthropic_client()
        wrapped = wrap(original_client, system_id="fraud-detection-v1", store=store)

        wrapped.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=100,
            messages=[{"role": "user", "content": "Flag suspicious transaction"}]
        )

        store._flush()

        record = json.loads(log_file.read_text().strip())
        assert record["system_id"] == "fraud-detection-v1"
        assert record["provider"] == "anthropic"

    def test_wrap_passthrough_preserves_other_attributes(self):
        """Attributes not intercepted by the wrapper pass through to the original client."""
        original_client = make_openai_client()
        original_client.api_key = "sk-test-key"
        store = AuditStore(local_mode=True)
        wrapped = wrap(original_client, system_id="test", store=store)

        assert wrapped.api_key == "sk-test-key"

    def test_unknown_provider_raises(self):
        mystery_client = MagicMock()
        mystery_client.__class__.__module__ = "some_other_provider"
        mystery_client.__class__.__name__ = "SomeClient"
        # Remove structural hints
        del mystery_client.chat
        del mystery_client.messages

        with pytest.raises(ProviderError):
            wrap(mystery_client, system_id="test")

    def test_wrap_is_non_breaking_on_capture_failure(self):
        """If capture fails, the response still returns normally. Non-negotiable."""
        original_client = make_openai_client()
        store = AuditStore(local_mode=True)
        wrapped = wrap(original_client, system_id="test", store=store)

        # Corrupt the store's enqueue to raise
        original_enqueue = store.enqueue
        store.enqueue = lambda e: (_ for _ in ()).throw(RuntimeError("storage down"))

        # The call must still succeed
        response = wrapped.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "test"}]
        )
        assert response is not None

        store.enqueue = original_enqueue


# ── Integration: end-to-end audit trail ──────────────────────────────────────

class TestEndToEnd:
    def test_full_audit_trail_openai(self, tmp_path):
        """
        Full flow: wrap client → make call → verify JSONL contains
        a valid, hashable audit record.
        """
        log_file = tmp_path / "audit.jsonl"
        store = AuditStore(local_mode=True, local_log_path=log_file)

        client = make_openai_client()
        client.chat.completions.create.return_value = make_openai_response(
            content="DECLINED — insufficient credit history"
        )

        wrapped = wrap(client, system_id="credit-scoring-v2", store=store)
        wrapped.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Applicant: age 28, income £31k, 6mo history"}]
        )

        store._flush()

        record = json.loads(log_file.read_text().strip())

        # Verify the audit record is complete
        assert record["decision_id"].startswith("DEC-")
        assert record["system_id"] == "credit-scoring-v2"
        assert record["provider"] == "openai"
        assert record["model"] == "gpt-4o-2024-08-06"
        assert record["payload_hash"].startswith("sha256:")
        assert record["latency_ms"] >= 0
        assert record["environment"] == "production"

        # Verify the hash is 64 hex chars
        hex_part = record["payload_hash"].replace("sha256:", "")
        assert len(hex_part) == 64

        print(f"\n✓ Audit record captured: {record['decision_id']}")
        print(f"  System:  {record['system_id']}")
        print(f"  Model:   {record['model']}")
        print(f"  Hash:    {record['payload_hash'][:30]}...")
        print(f"  Latency: {record['latency_ms']}ms")
