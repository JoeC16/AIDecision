from typing import Dict, List

from .exceptions import NotFoundError, StoreError
from .models import Decision, DecisionOutcome


class DecisionStore:
    """In-memory store for AI decisions."""

    def __init__(self):
        self._store: Dict[str, Decision] = {}

    def add(self, decision: Decision) -> Decision:
        if not isinstance(decision, Decision):
            raise StoreError("Only Decision objects can be stored")
        self._store[decision.id] = decision
        return decision

    def get(self, decision_id: str) -> Decision:
        if decision_id not in self._store:
            raise NotFoundError(f"Decision '{decision_id}' not found")
        return self._store[decision_id]

    def list(self) -> List[Decision]:
        return list(self._store.values())

    def filter_by_outcome(self, outcome: DecisionOutcome) -> List[Decision]:
        return [d for d in self._store.values() if d.outcome == outcome]

    def delete(self, decision_id: str) -> bool:
        if decision_id not in self._store:
            raise NotFoundError(f"Decision '{decision_id}' not found")
        del self._store[decision_id]
        return True

    def clear(self) -> None:
        self._store.clear()

    def count(self) -> int:
        return len(self._store)
