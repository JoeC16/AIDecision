"""
aidecision.models
~~~~~~~~~~~~~~~~~
Core data structures for captured AI decision events.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


@dataclass
class DecisionEvent:
    """
    A single captured AI decision event.

    Every AI call intercepted by the SDK produces one DecisionEvent.
    This is the unit of audit — everything that gets hashed, stored,
    and made available for regulatory export.
    """

    # Identity
    decision_id: str = field(default_factory=lambda: f"DEC-{uuid.uuid4().hex[:12].upper()}")
    system_id: str = ""

    # Timing
    captured_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    latency_ms: Optional[float] = None

    # Model
    model: str = ""
    provider: str = ""  # "openai", "anthropic", "cohere", etc.

    # Payload
    input_payload: Any = None
    output_payload: Any = None

    # Integrity
    payload_hash: str = ""          # SHA-256 of canonical input+output
    signature: Optional[str] = None  # Future: cryptographic signature

    # Metadata
    environment: str = "production"
    sdk_version: str = ""
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Serialise to dict for transport and storage."""
        return {
            "decision_id": self.decision_id,
            "system_id": self.system_id,
            "captured_at": self.captured_at.isoformat(),
            "latency_ms": self.latency_ms,
            "model": self.model,
            "provider": self.provider,
            "input_payload": self.input_payload,
            "output_payload": self.output_payload,
            "payload_hash": self.payload_hash,
            "signature": self.signature,
            "environment": self.environment,
            "sdk_version": self.sdk_version,
            "extra": self.extra,
        }

    @property
    def timestamp_iso(self) -> str:
        return self.captured_at.isoformat()
