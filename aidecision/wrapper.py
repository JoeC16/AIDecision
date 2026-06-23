"""
aidecision.wrapper
~~~~~~~~~~~~~~~~~~
The wrap() function — the entire public interface of the SDK.

Usage:
    import aidecision
    client = aidecision.wrap(openai_client, system_id="credit-scoring-v2")
    response = client.chat.completions.create(...)  # unchanged

That's it. Everything else is automatic.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable, Optional

from .capture import capture_event
from .exceptions import ConfigurationError, ProviderError
from .store import AuditStore, get_default_store

logger = logging.getLogger("aidecision")


class _WrappedCompletions:
    """
    Proxies the .chat.completions.create() method on an OpenAI client,
    intercepting calls to capture audit events.
    """

    def __init__(self, original_completions: Any, system_id: str, store: AuditStore, environment: str):
        self._original = original_completions
        self._system_id = system_id
        self._store = store
        self._environment = environment

    def create(self, *args, **kwargs) -> Any:
        """Intercept .chat.completions.create() — capture the event, return normally."""
        input_payload = {
            "messages": kwargs.get("messages", args[0] if args else None),
            "model": kwargs.get("model"),
            "temperature": kwargs.get("temperature"),
            "max_tokens": kwargs.get("max_tokens"),
        }

        start = time.perf_counter()
        response = self._original.create(*args, **kwargs)

        self._capture_and_store(input_payload, response, start)
        return response

    async def acreate(self, *args, **kwargs) -> Any:
        """Async variant of create()."""
        input_payload = {
            "messages": kwargs.get("messages", args[0] if args else None),
            "model": kwargs.get("model"),
        }

        start = time.perf_counter()
        response = await self._original.acreate(*args, **kwargs)

        self._capture_and_store(input_payload, response, start)
        return response

    def _capture_and_store(self, input_payload: Any, response: Any, start: float) -> None:
        try:
            event = capture_event(
                system_id=self._system_id,
                input_payload=input_payload,
                response=response,
                start_time=start,
                environment=self._environment,
            )
            self._store.enqueue(event)
            logger.debug("AiDecision: captured event %s (%sms)", event.decision_id, event.latency_ms)
        except Exception as e:
            # CRITICAL: we never let audit capture break the caller's code
            logger.error("AiDecision: capture failed (non-fatal): %s", e)


class _WrappedChat:
    """Proxies the .chat attribute, injecting our completions wrapper."""

    def __init__(self, original_chat: Any, system_id: str, store: AuditStore, environment: str):
        self._original = original_chat
        self.completions = _WrappedCompletions(
            original_chat.completions, system_id, store, environment
        )

    def __getattr__(self, name: str) -> Any:
        return getattr(self._original, name)


class _WrappedOpenAIClient:
    """
    Wraps an OpenAI client instance.
    Proxies all attribute access to the original client,
    but replaces .chat with our intercepting wrapper.
    """

    def __init__(self, client: Any, system_id: str, store: AuditStore, environment: str):
        self._client = client
        self.chat = _WrappedChat(client.chat, system_id, store, environment)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)


class _WrappedAnthropicMessages:
    """Proxies the .messages.create() method on an Anthropic client."""

    def __init__(self, original_messages: Any, system_id: str, store: AuditStore, environment: str):
        self._original = original_messages
        self._system_id = system_id
        self._store = store
        self._environment = environment

    def create(self, *args, **kwargs) -> Any:
        input_payload = {
            "messages": kwargs.get("messages"),
            "model": kwargs.get("model"),
            "system": kwargs.get("system"),
            "max_tokens": kwargs.get("max_tokens"),
        }

        start = time.perf_counter()
        response = self._original.create(*args, **kwargs)

        try:
            event = capture_event(
                system_id=self._system_id,
                input_payload=input_payload,
                response=response,
                start_time=start,
                environment=self._environment,
            )
            self._store.enqueue(event)
            logger.debug("AiDecision: captured event %s (%sms)", event.decision_id, event.latency_ms)
        except Exception as e:
            logger.error("AiDecision: capture failed (non-fatal): %s", e)

        return response

    def __getattr__(self, name: str) -> Any:
        return getattr(self._original, name)


class _WrappedAnthropicClient:
    """Wraps an Anthropic client instance."""

    def __init__(self, client: Any, system_id: str, store: AuditStore, environment: str):
        self._client = client
        self.messages = _WrappedAnthropicMessages(
            client.messages, system_id, store, environment
        )

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)


def _detect_client_type(client: Any) -> str:
    """Detect whether this is an OpenAI or Anthropic client."""
    cls = type(client)
    module = cls.__module__ or ""
    name = cls.__name__ or ""

    if "openai" in module.lower() or "OpenAI" in name:
        return "openai"
    if "anthropic" in module.lower() or "Anthropic" in name:
        return "anthropic"
    # Structural detection
    if hasattr(client, "chat") and hasattr(client.chat, "completions"):
        return "openai"
    if hasattr(client, "messages") and hasattr(client.messages, "create"):
        return "anthropic"

    raise ProviderError(
        f"Cannot detect AI provider from client type '{name}'. "
        "Currently supported: openai, anthropic. "
        "Open an issue at github.com/aidecision/sdk-python if you need another provider."
    )


def wrap(
    client: Any,
    system_id: str,
    *,
    environment: str = "production",
    store: Optional[AuditStore] = None,
    api_key: Optional[str] = None,
) -> Any:
    """
    Wrap an AI client to automatically capture and audit every decision.

    Args:
        client:      Your existing OpenAI or Anthropic client instance.
        system_id:   A stable identifier for this AI system (e.g. "credit-scoring-v2").
                     This appears in all audit records and the compliance dashboard.
        environment: "production", "staging", or "development". Defaults to "production".
        store:       Optional custom AuditStore. If not provided, uses the shared default.
        api_key:     Your AiDecision API key. Falls back to AIDECISION_API_KEY env var.
                     If neither is set, runs in local mode (logs to ./aidecision_decisions.jsonl).

    Returns:
        A wrapped client with an identical interface to the original.
        Use it as a drop-in replacement — no other code changes required.

    Example (OpenAI):
        import aidecision
        from openai import OpenAI

        client = aidecision.wrap(OpenAI(), system_id="credit-scoring-v2")
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}]
        )

    Example (Anthropic):
        import aidecision
        import anthropic

        client = aidecision.wrap(anthropic.Anthropic(), system_id="fraud-detection-v1")
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
    """
    if not system_id or not system_id.strip():
        raise ConfigurationError(
            "system_id is required and cannot be empty. "
            "Use a stable, descriptive identifier like 'credit-scoring-v2' or 'loan-eligibility-v3'."
        )

    if " " in system_id:
        raise ConfigurationError(
            f"system_id '{system_id}' contains spaces. "
            "Use hyphens or underscores instead (e.g. 'credit-scoring-v2')."
        )

    # Use provided store, or create one with the given api_key, or use the default
    if store is None:
        if api_key:
            store = AuditStore(api_key=api_key)
        else:
            store = get_default_store()

    provider = _detect_client_type(client)

    if provider == "openai":
        return _WrappedOpenAIClient(client, system_id, store, environment)
    elif provider == "anthropic":
        return _WrappedAnthropicClient(client, system_id, store, environment)

    raise ProviderError(f"Unsupported provider: {provider}")
