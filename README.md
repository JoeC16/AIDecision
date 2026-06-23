# AIDecision

A lightweight Python SDK for capturing, storing, and analyzing AI decision events.

## Installation

```bash
pip install aidecision
```

Or install from source:

```bash
git clone https://github.com/joec16/aidecision.git
cd aidecision
pip install -e .
```

## Quick Start

```python
from aidecision import AIDecisionWrapper, DecisionOutcome

wrapper = AIDecisionWrapper(model="claude-3")

# Option 1: wrap a function call and record automatically
result = wrapper.decide(
    input="What is the capital of France?",
    fn=lambda q: "Paris",
    outcome=DecisionOutcome.ACCEPTED,
)

# Option 2: record a pre-computed pair
decision = wrapper.record(
    input="Summarise this article",
    output="The article discusses climate change...",
    outcome=DecisionOutcome.ACCEPTED,
    metadata={"tokens": 512},
)

# Inspect history
for d in wrapper.get_history():
    print(d.to_dict())

# Get a summary
print(wrapper.summary())
# {'model': 'claude-3', 'total': 2, 'outcomes': {'accepted': 2}}
```

## Core Concepts

| Class | Purpose |
|---|---|
| `AIDecisionWrapper` | High-level entry point — combines capture + storage |
| `DecisionCapture` | Low-level capture of a single decision event |
| `DecisionStore` | In-memory store for `Decision` objects |
| `Decision` | Dataclass representing one AI decision |
| `DecisionOutcome` | Enum: `ACCEPTED`, `REJECTED`, `PENDING`, `UNKNOWN` |

## DecisionCapture

```python
from aidecision import DecisionCapture, DecisionOutcome

cap = DecisionCapture(model="my-model")

# Capture with timing
decision = cap.capture_with_timing(my_model_call, prompt)

# Use as a decorator
@cap.decorator(outcome=DecisionOutcome.ACCEPTED)
def classify(text):
    return "positive"

classify("Great product!")
print(classify._decisions)   # list of Decision objects
```

## DecisionStore

```python
from aidecision import DecisionStore, DecisionOutcome

store = DecisionStore()
store.add(decision)

store.get(decision.id)
store.list()
store.filter_by_outcome(DecisionOutcome.REJECTED)
store.delete(decision.id)
store.count()
store.clear()
```

## Exceptions

| Exception | When raised |
|---|---|
| `AIDecisionError` | Base class for all SDK errors |
| `ValidationError` | Bad input to the SDK |
| `CaptureError` | Error during capture (e.g. `None` input) |
| `StoreError` | Store operation failed |
| `NotFoundError` | Decision ID not found in the store |

## Running Tests

```bash
python tests/run_tests.py
```

## License

MIT — see [LICENSE](LICENSE).
