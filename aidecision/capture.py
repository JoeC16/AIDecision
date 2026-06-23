import functools
import time
from typing import Any, Callable, Dict, List, Optional

from .exceptions import CaptureError
from .models import Decision, DecisionOutcome


class DecisionCapture:
    """Captures AI decision events."""

    def __init__(self, model: str = "unknown"):
        self.model = model

    def capture(
        self,
        input: Any,
        output: Any,
        outcome: DecisionOutcome = DecisionOutcome.UNKNOWN,
        metadata: Optional[Dict[str, Any]] = None,
        duration_ms: Optional[float] = None,
    ) -> Decision:
        if input is None:
            raise CaptureError("Input cannot be None")
        return Decision(
            input=input,
            output=output,
            model=self.model,
            outcome=outcome,
            metadata=metadata or {},
            duration_ms=duration_ms,
        )

    def capture_with_timing(self, func: Callable, *args, **kwargs) -> Decision:
        start = time.monotonic()
        try:
            result = func(*args, **kwargs)
        except Exception as e:
            raise CaptureError(f"Function raised an error during capture: {e}") from e
        duration_ms = (time.monotonic() - start) * 1000
        return self.capture(
            input={"args": args, "kwargs": kwargs},
            output=result,
            duration_ms=duration_ms,
        )

    def decorator(self, outcome: DecisionOutcome = DecisionOutcome.UNKNOWN):
        """Wraps a function to automatically record each call as a Decision."""
        def wrapper(func: Callable) -> Callable:
            captured: List[Decision] = []

            @functools.wraps(func)
            def inner(*args, **kwargs):
                start = time.monotonic()
                result = func(*args, **kwargs)
                duration_ms = (time.monotonic() - start) * 1000
                decision = self.capture(
                    input={"args": args, "kwargs": kwargs},
                    output=result,
                    outcome=outcome,
                    duration_ms=duration_ms,
                )
                captured.append(decision)
                return result

            inner._decisions = captured  # type: ignore[attr-defined]
            return inner

        return wrapper
