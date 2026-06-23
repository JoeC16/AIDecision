# aidecision &nbsp;·&nbsp; Python SDK

**Cryptographically signed, tamper-evident audit trails for every AI decision.**  
EU AI Act Article 12 compliant. Three lines of code to integrate.

```python
import aidecision

client = aidecision.wrap(openai_client, system_id="credit-scoring-v2")
response = client.chat.completions.create(...)  # unchanged
```

Every call is now logged, hashed, and audit-ready.

---

## The problem

When a regulator asks you to prove what your AI decided, and why, and that the record hasn't been altered — most teams spend days digging through application logs, calling AI vendors for model version history, and involving lawyers because they genuinely can't prove anything.

Under the EU AI Act (Article 12), high-risk AI systems must maintain automatic, tamper-evident logs of every decision. Fines for non-compliance reach **€15 million or 3% of global turnover**.

`aidecision` is the infrastructure layer that makes compliance a function call.

---

## What it does

Every AI call intercepted by the SDK produces a **DecisionEvent** — a cryptographically hashed, immutable audit record containing:

| Field | What it captures |
|-------|-----------------|
| `decision_id` | Unique identifier for this decision (`DEC-E2465F976E08`) |
| `system_id` | Your identifier for this AI system (`credit-scoring-v2`) |
| `captured_at` | UTC timestamp at moment of execution |
| `model` | Exact model version (`gpt-4o-2024-08-06`, `claude-sonnet-4-6`) |
| `provider` | AI provider (`openai`, `anthropic`) |
| `input_payload` | Complete input — messages, system prompt, parameters |
| `output_payload` | Complete output — content, finish reason, token usage |
| `payload_hash` | SHA-256 of canonical input+output — proves nothing changed |
| `latency_ms` | Response time in milliseconds |
| `environment` | `production`, `staging`, or `development` |

Records ship asynchronously — **zero latency impact** on your AI calls.

---

## Installation

```bash
pip install aidecision
```

With your AI provider:

```bash
pip install aidecision[openai]      # OpenAI
pip install aidecision[anthropic]   # Anthropic
pip install aidecision[openai,anthropic]  # Both
```

Requires Python 3.9+. No other dependencies.

---

## Quickstart

### OpenAI

```python
import aidecision
from openai import OpenAI

# Before
client = OpenAI()

# After — one line change
client = aidecision.wrap(OpenAI(), system_id="credit-scoring-v2")

# Everything else unchanged
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": prompt}]
)
```

### Anthropic

```python
import aidecision
import anthropic

client = aidecision.wrap(
    anthropic.Anthropic(),
    system_id="fraud-detection-v1"
)

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}]
)
```

---

## Configuration

### API key

Set your AiDecision API key to ship events to the audit store:

```bash
export AIDECISION_API_KEY="your-api-key"
```

Or pass it directly:

```python
client = aidecision.wrap(
    openai_client,
    system_id="credit-scoring-v2",
    api_key="your-api-key"
)
```

**No API key?** The SDK runs in local mode automatically — events are written to `./aidecision_decisions.jsonl`. This is the default during development and for the open-source self-hosted path.

### Environment

```python
client = aidecision.wrap(
    openai_client,
    system_id="credit-scoring-v2",
    environment="staging"  # "production" | "staging" | "development"
)
```

### Custom store

For advanced configurations — custom endpoints, self-hosted infrastructure, or per-system isolation:

```python
from aidecision import AuditStore

store = AuditStore(
    api_key="your-api-key",
    endpoint="https://your-self-hosted-ingest.example.com/v1/events"
)

client = aidecision.wrap(openai_client, system_id="my-system", store=store)
```

---

## Local mode

Without an API key, every decision is appended to a local JSONL file:

```
./aidecision_decisions.jsonl
```

Each line is a complete, self-contained audit record:

```json
{
  "decision_id": "DEC-E2465F976E08",
  "system_id": "credit-scoring-v2",
  "captured_at": "2026-06-23T14:32:01.847Z",
  "latency_ms": 312.4,
  "model": "gpt-4o-2024-08-06",
  "provider": "openai",
  "input_payload": {
    "messages": [{"role": "user", "content": "..."}],
    "model": "gpt-4o"
  },
  "output_payload": {
    "id": "chatcmpl-abc123",
    "model": "gpt-4o-2024-08-06",
    "choices": [{"message": {"role": "assistant", "content": "APPROVED — risk score 0.23"}, "finish_reason": "stop"}],
    "usage": {"prompt_tokens": 142, "completion_tokens": 18}
  },
  "payload_hash": "sha256:babd37dc4d376e71cb78723a828f3d1a9c4e2b7f...",
  "environment": "production",
  "sdk_version": "0.1.0"
}
```

Override the path:

```bash
export AIDECISION_LOCAL_LOG="/var/log/ai-decisions.jsonl"
```

---

## How integrity works

Every `payload_hash` is a **SHA-256** hash of the canonical JSON encoding of the complete input and output together.

```
sha256( canonical_json({ "input": input_payload, "output": output_payload }) )
```

**Canonical** means: keys sorted alphabetically, no whitespace, consistent separators — identical inputs always produce identical hashes, regardless of Python version or environment.

To verify a record hasn't been tampered with, recompute the hash and compare:

```python
import hashlib, json

def verify(record: dict) -> bool:
    canonical = json.dumps(
        {"input": record["input_payload"], "output": record["output_payload"]},
        sort_keys=True,
        separators=(",", ":"),
        default=str
    )
    expected = "sha256:" + hashlib.sha256(canonical.encode()).hexdigest()
    return expected == record["payload_hash"]
```

A mismatch means the record was altered after capture. This is the evidentiary foundation of every export produced by the AiDecision dashboard.

---

## Failure safety

**A logging failure will never break your application.**

If capture fails — network down, storage unreachable, unexpected response format — the SDK logs a warning and returns the AI response normally. Your application continues without interruption.

```python
# This always works, even if aidecision's infrastructure is unreachable
response = wrapped_client.chat.completions.create(...)
```

This is non-negotiable by design. You integrated an AI into your product. We audit it. We never block it.

---

## System IDs

The `system_id` is how you identify which AI system made a decision. Use a stable, descriptive slug:

```python
# Good
aidecision.wrap(client, system_id="credit-scoring-v2")
aidecision.wrap(client, system_id="fraud-detection-v1")
aidecision.wrap(client, system_id="loan-eligibility-v3")

# Bad — too vague, will be meaningless in a regulator audit 18 months later
aidecision.wrap(client, system_id="model")
aidecision.wrap(client, system_id="ai")
aidecision.wrap(client, system_id="test")
```

Rules:
- No spaces (use hyphens or underscores)
- Lowercase recommended
- Include a version suffix — when you change models or prompts, bump the version
- This string appears in every audit record and in the compliance dashboard

---

## Supported providers

| Provider | Status | Import |
|----------|--------|--------|
| OpenAI | ✅ Supported | `openai>=1.0.0` |
| Anthropic | ✅ Supported | `anthropic>=0.20.0` |
| Azure OpenAI | 🔜 Coming soon | — |
| Google Gemini | 🔜 Coming soon | — |
| Cohere | 🔜 Coming soon | — |
| Custom / self-hosted | See [custom providers](#custom-providers) | — |

Need a provider not listed? [Open an issue](https://github.com/aidecision/sdk-python/issues) or see [custom providers](#custom-providers) below.

---

## Custom providers

For AI providers not yet natively supported, wrap the call manually:

```python
import time
import aidecision
from aidecision.capture import capture_event
from aidecision.store import get_default_store

store = get_default_store()

# Your AI call
input_payload = {"prompt": prompt, "model": "my-custom-model"}
start = time.perf_counter()
response = my_custom_ai_client.complete(prompt)

# Manually capture
from aidecision.models import DecisionEvent
from aidecision.capture import _hash_payload

output_payload = {"text": response.text, "tokens": response.token_count}
event = DecisionEvent(
    system_id="my-custom-system-v1",
    model="my-custom-model",
    provider="custom",
    input_payload=input_payload,
    output_payload=output_payload,
    payload_hash=_hash_payload(input_payload, output_payload),
    latency_ms=round((time.perf_counter() - start) * 1000, 2),
)
store.enqueue(event)
```

---

## EU AI Act compliance

The EU AI Act (Regulation 2024/1689) requires high-risk AI systems to maintain automatic, tamper-evident logs under **Article 12 (Record-keeping)**. Deployers of high-risk systems have additional obligations under **Article 26**.

High-risk categories (Annex III) include AI used in:
- Credit scoring and financial decisions
- Recruitment and HR decisions
- Law enforcement and border control
- Healthcare triage and diagnosis support
- Education assessment
- Critical infrastructure management

**Annex III obligations apply from December 2027** (extended under the AI Omnibus, May 2026). That's your runway to instrument every high-risk system.

`aidecision` captures and stores what Article 12 requires:
- ✅ Automatic logging at every decision point
- ✅ Tamper-evident records (cryptographic hashing)
- ✅ Model version captured at time of decision
- ✅ Input and output preserved in full
- ✅ UTC timestamps on every record
- ✅ EU-resident storage (Frankfurt, AWS) — required for EU deployers
- ✅ Minimum 6-month retention (configurable up to 10 years)

**Important:** `aidecision` is infrastructure, not a compliance programme. You still need to conduct risk assessments, register high-risk systems, and maintain technical documentation under Annex IV. We strongly recommend working with an EU AI Act specialist for your full compliance programme.

---

## Dashboard

The [AiDecision Dashboard](https://app.aidecision.io) provides:

- **Decision Explorer** — search, filter, and inspect every logged decision
- **System Inventory** — all registered AI systems, risk classifications, compliance status
- **Evidence Package Export** — one-click generation of regulator-ready audit documents
- **Anomaly Detection** — alerts when model behaviour changes between versions
- **Compliance Reports** — Article 12 compliance summaries for your legal team

---

## Running tests

```bash
# Clone the repo
git clone https://github.com/aidecision/sdk-python
cd sdk-python

# Run tests (no external dependencies required)
python tests/run_tests.py
```

Expected output:
```
── Models ──
  ✓ DecisionEvent auto-generates decision_id
  ✓ Two events have different IDs
  ✓ to_dict() contains required fields

── Capture ──
  ✓ canonical_json is deterministic
  ✓ hash starts with sha256:
  ✓ same payload always produces same hash
  ...

── End-to-End ──
  ✓ Full audit trail: wrap → call → verify JSONL

  26 passed  0 failed  (26 total)
  All tests passing. SDK is ready.
```

---

## Contributing

We welcome contributions, especially:

- **New provider support** — Azure OpenAI, Gemini, Cohere, Mistral
- **Async client support** — `AsyncOpenAI`, `AsyncAnthropic`
- **Language SDKs** — TypeScript/Node.js is next on the roadmap

Please open an issue before starting significant work so we can discuss the approach.

---

## Roadmap

- [ ] TypeScript / Node.js SDK
- [ ] `AsyncOpenAI` and `AsyncAnthropic` support
- [ ] Azure OpenAI provider
- [ ] Google Gemini provider  
- [ ] RFC 3161 cryptographic timestamping (legally recognised timestamps)
- [ ] Bitcoin OP_RETURN anchoring for public verifiability
- [ ] Streaming response capture
- [ ] Batch API support
- [ ] LangChain / LlamaIndex integrations

---

## Security

Found a vulnerability? Please report it privately to **security@aidecision.io** rather than opening a public issue. We aim to respond within 24 hours.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Get started

```bash
pip install aidecision
```

```python
import aidecision
client = aidecision.wrap(your_ai_client, system_id="your-system-name")
```

Questions? [hello@aidecision.io](mailto:hello@aidecision.io) — we respond to every email.
