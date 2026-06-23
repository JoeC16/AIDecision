"""
aidecision
~~~~~~~~~~
AI decision audit infrastructure.

Cryptographically signed, tamper-evident audit trails for every AI decision.
EU AI Act Article 12 compliant. Three lines of code to integrate.

Basic usage::

    import aidecision
    from openai import OpenAI

    client = aidecision.wrap(OpenAI(), system_id="credit-scoring-v2")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}]
    )
    # Every call is now logged, hashed, and audit-ready.

Full documentation: https://docs.aidecision.io
"""

from .wrapper import wrap
from .store import AuditStore
from .models import DecisionEvent
from .exceptions import (
    AiDecisionError,
    CaptureError,
    StoreError,
    ConfigurationError,
    ProviderError,
)
from .capture import SDK_VERSION

__version__ = SDK_VERSION
__all__ = [
    "wrap",
    "AuditStore",
    "DecisionEvent",
    "AiDecisionError",
    "CaptureError",
    "StoreError",
    "ConfigurationError",
    "ProviderError",
]
