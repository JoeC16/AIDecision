import time
from typing import Any, Callable, Dict, List, Optional

from .capture import DecisionCapture
from .exceptions import ValidationError
from .models import Decision, DecisionOutcome
from .store import DecisionStore


class AIDecisionWrapper:
    """Main entry point combining capture and storage for AI decisions."""

    def __init__(self, model: str = "unknown", store: Optional[DecisionStore] = None):
        if not model:
            raise ValidationError("Model name cannot be empty")
        self.model = model
        self._capture = DecisionCapture(model=model)
        self._store = store or DecisionStore()

    def decide(
        self,
        input: Any,
        fn: Callable,
        outcome: DecisionOutcome = DecisionOutcome.UNKNOWN,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """Call *fn(input)*, capture the result as a Decision, store it, and return the output."""
        start = time.monotonic()
        result = fn(input)
        duration_ms = (time.monotonic() - start) * 1000
        decision = self._capture.capture(
            input=input,
            output=result,
            outcome=outcome,
            metadata=metadata or {},
            duration_ms=duration_ms,
        )
        self._store.add(decision)
        return result

    def record(
        self,
        input: Any,
        output: Any,
        outcome: DecisionOutcome = DecisionOutcome.UNKNOWN,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Decision:
        """Manually record a pre-computed input/output pair as a Decision."""
        decision = self._capture.capture(
            input=input,
            output=output,
            outcome=outcome,
            metadata=metadata or {},
        )
        return self._store.add(decision)

    def get_history(self) -> List[Decision]:
        return self._store.list()

    def clear_history(self) -> None:
        self._store.clear()

    def summary(self) -> Dict[str, Any]:
        decisions = self._store.list()
        outcome_counts: Dict[str, int] = {}
        for d in decisions:
            key = d.outcome.value
            outcome_counts[key] = outcome_counts.get(key, 0) + 1
        return {
            "model": self.model,
            "total": len(decisions),
            "outcomes": outcome_counts,
        }
