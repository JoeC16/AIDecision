"""
aidecision.exceptions
~~~~~~~~~~~~~~~~~~~~~
Clean, specific exception types so integrators know exactly what went wrong.
"""


class AiDecisionError(Exception):
    """Base exception for all aidecision errors."""
    pass


class CaptureError(AiDecisionError):
    """Raised when event capture fails (hashing, serialisation)."""
    pass


class StoreError(AiDecisionError):
    """Raised when log shipping to the audit store fails."""
    pass


class ConfigurationError(AiDecisionError):
    """Raised when the SDK is misconfigured (missing API key, bad system_id)."""
    pass


class ProviderError(AiDecisionError):
    """Raised when we can't detect or support the wrapped AI provider."""
    pass
