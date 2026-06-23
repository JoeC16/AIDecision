from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional
import uuid


class DecisionOutcome(Enum):
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    PENDING = "pending"
    UNKNOWN = "unknown"


@dataclass
class Decision:
    input: Any
    output: Any
    model: str = "unknown"
    outcome: DecisionOutcome = DecisionOutcome.UNKNOWN
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    duration_ms: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "input": self.input,
            "output": self.output,
            "model": self.model,
            "outcome": self.outcome.value,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat(),
            "duration_ms": self.duration_ms,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Decision":
        data = data.copy()
        data["outcome"] = DecisionOutcome(data.get("outcome", "unknown"))
        if "timestamp" in data and isinstance(data["timestamp"], str):
            data["timestamp"] = datetime.fromisoformat(data["timestamp"])
        return cls(**data)
