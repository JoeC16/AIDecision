"""
aidecision.capture
~~~~~~~~~~~~~~~~~~
Captures AI call payloads and produces cryptographic hashes.

The hash is the foundation of the audit trail — it's what allows us to prove
a decision record hasn't been altered since the moment of capture.
"""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from typing import Any

from .exceptions import CaptureError
from .models import DecisionEvent

SDK_VERSION = "0.1.0"


def _canonical_json(obj: Any) -> str:
    """
    Produce a deterministic JSON string for hashing.

    Standard json.dumps isn't deterministic across Python versions
    without sort_keys=True and a fixed separator. We enforce both.
    """
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _hash_payload(input_payload: Any, output_payload: Any) -> str:
    """
    Produce a SHA-256 hash of the canonical input+output payload.

    The hash covers both input and output together — this proves that
    this specific output came from this specific input. Changing either
    invalidates the hash.
    """
    canonical = _canonical_json({
        "input": input_payload,
        "output": output_payload,
    })
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _extract_openai_fields(response: Any) -> tuple[str, str, Any]:
    """Extract provider, model, and serialisable output from an OpenAI response."""
    try:
        model = getattr(response, "model", "unknown")
        # Serialise choices to a plain dict
        output = {
            "id": getattr(response, "id", None),
            "model": model,
            "choices": [
                {
                    "index": c.index,
                    "message": {
                        "role": c.message.role,
                        "content": c.message.content,
                    },
                    "finish_reason": c.finish_reason,
                }
                for c in (response.choices or [])
            ],
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens if response.usage else None,
                "completion_tokens": response.usage.completion_tokens if response.usage else None,
            } if hasattr(response, "usage") else None,
        }
        return "openai", model, output
    except Exception as e:
        raise CaptureError(f"Failed to extract OpenAI response fields: {e}") from e


def _extract_anthropic_fields(response: Any) -> tuple[str, str, Any]:
    """Extract provider, model, and serialisable output from an Anthropic response."""
    try:
        model = getattr(response, "model", "unknown")
        output = {
            "id": getattr(response, "id", None),
            "model": model,
            "content": [
                {"type": block.type, "text": getattr(block, "text", None)}
                for block in (response.content or [])
            ],
            "stop_reason": getattr(response, "stop_reason", None),
            "usage": {
                "input_tokens": response.usage.input_tokens if response.usage else None,
                "output_tokens": response.usage.output_tokens if response.usage else None,
            } if hasattr(response, "usage") else None,
        }
        return "anthropic", model, output
    except Exception as e:
        raise CaptureError(f"Failed to extract Anthropic response fields: {e}") from e


def _detect_provider(response: Any) -> str:
    """
    Detect which AI provider produced this response.
    We check the class name and module path — no hard dependency on either SDK.
    """
    cls = type(response)
    module = cls.__module__ or ""
    name = cls.__name__ or ""

    if "openai" in module:
        return "openai"
    if "anthropic" in module:
        return "anthropic"
    # Fallback: check for characteristic attributes
    if hasattr(response, "choices"):
        return "openai"
    if hasattr(response, "content") and hasattr(response, "stop_reason"):
        return "anthropic"
    return "unknown"


def capture_event(
    system_id: str,
    input_payload: Any,
    response: Any,
    start_time: float,
    environment: str = "production",
    extra: dict | None = None,
) -> DecisionEvent:
    """
    Build a DecisionEvent from a completed AI call.

    Args:
        system_id: Customer-defined identifier for the AI system (e.g. "credit-scoring-v2")
        input_payload: The messages/prompt passed to the AI
        response: The raw response object returned by the AI provider SDK
        start_time: time.perf_counter() value from before the AI call
        environment: "production", "staging", "development"
        extra: Any additional metadata the customer wants attached

    Returns:
        A fully populated DecisionEvent ready for storage
    """
    latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
    provider = _detect_provider(response)

    if provider == "openai":
        provider, model, output_payload = _extract_openai_fields(response)
    elif provider == "anthropic":
        provider, model, output_payload = _extract_anthropic_fields(response)
    else:
        # Generic fallback — store whatever we can serialise
        model = getattr(response, "model", "unknown")
        try:
            output_payload = json.loads(json.dumps(response, default=str))
        except Exception:
            output_payload = str(response)

    try:
        payload_hash = _hash_payload(input_payload, output_payload)
    except Exception as e:
        raise CaptureError(f"Failed to hash payload: {e}") from e

    return DecisionEvent(
        system_id=system_id,
        captured_at=datetime.now(timezone.utc),
        latency_ms=latency_ms,
        model=model,
        provider=provider,
        input_payload=input_payload,
        output_payload=output_payload,
        payload_hash=payload_hash,
        environment=environment,
        sdk_version=SDK_VERSION,
        extra=extra or {},
    )
