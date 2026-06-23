class AIDecisionError(Exception):
    """Base exception for the aidecision SDK."""


class ValidationError(AIDecisionError):
    """Raised when input validation fails."""


class StoreError(AIDecisionError):
    """Raised when a store operation fails."""


class CaptureError(AIDecisionError):
    """Raised when a capture operation fails."""


class NotFoundError(StoreError):
    """Raised when a decision is not found in the store."""
