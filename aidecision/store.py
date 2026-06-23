"""
aidecision.store
~~~~~~~~~~~~~~~~
Ships captured decision events to the AiDecision audit store.

Key design decisions:
- Async by default: the AI call returns immediately, logging happens in background
- Local buffer: if the network is down, events queue locally and retry
- Fail-safe: a logging failure NEVER raises an exception to the caller
  (the AI call already returned — we must not break the customer's application)
- Local-only mode: if no API key is set, events write to a local JSONL file
  (useful for development and for the MVP before the backend exists)
"""

from __future__ import annotations

import json
import logging
import os
import queue
import threading
import time
from pathlib import Path
from typing import Optional

from .models import DecisionEvent

logger = logging.getLogger("aidecision")

# How many events to buffer before dropping (prevents unbounded memory growth)
_BUFFER_MAX = 1000
# How many seconds between retry flushes
_FLUSH_INTERVAL = 5.0
# Local fallback file path
_LOCAL_LOG_PATH = Path(os.environ.get("AIDECISION_LOCAL_LOG", "./aidecision_decisions.jsonl"))


class AuditStore:
    """
    Background worker that ships DecisionEvents to the audit store.

    Runs a daemon thread that drains a queue every FLUSH_INTERVAL seconds.
    Events are never lost on successful capture — they buffer locally if
    the network is unavailable.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint: str = "https://ingest.aidecision.io/v1/events",
        local_mode: bool = False,
        local_log_path: Optional[Path] = None,
    ):
        self.api_key = api_key or os.environ.get("AIDECISION_API_KEY")
        self.endpoint = endpoint
        self.local_mode = local_mode or not self.api_key
        self.local_log_path = local_log_path or _LOCAL_LOG_PATH

        self._queue: queue.Queue[DecisionEvent] = queue.Queue(maxsize=_BUFFER_MAX)
        self._shutdown = threading.Event()
        self._thread = threading.Thread(target=self._worker, daemon=True, name="aidecision-store")
        self._thread.start()

        if self.local_mode:
            logger.info(
                "AiDecision running in local mode — decisions logged to %s. "
                "Set AIDECISION_API_KEY to ship to the audit store.",
                self.local_log_path,
            )

    def enqueue(self, event: DecisionEvent) -> None:
        """
        Add an event to the shipping queue. Non-blocking. Never raises.
        If the queue is full, the event is dropped with a warning.
        """
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            logger.warning(
                "AiDecision buffer full (%d events). Dropping event %s. "
                "Consider increasing flush frequency or checking network connectivity.",
                _BUFFER_MAX,
                event.decision_id,
            )

    def _worker(self) -> None:
        """Background thread — drains the queue and ships events."""
        while not self._shutdown.is_set():
            self._flush()
            time.sleep(_FLUSH_INTERVAL)
        # Final flush on shutdown
        self._flush()

    def _flush(self) -> None:
        """Drain the queue and ship all pending events."""
        events: list[DecisionEvent] = []
        try:
            while True:
                events.append(self._queue.get_nowait())
        except queue.Empty:
            pass

        if not events:
            return

        if self.local_mode:
            self._write_local(events)
        else:
            self._ship_remote(events)

    def _write_local(self, events: list[DecisionEvent]) -> None:
        """Write events to a local JSONL file (one JSON object per line)."""
        try:
            with self.local_log_path.open("a", encoding="utf-8") as f:
                for event in events:
                    f.write(json.dumps(event.to_dict(), default=str) + "\n")
            logger.debug("AiDecision: wrote %d events to %s", len(events), self.local_log_path)
        except Exception as e:
            logger.error("AiDecision: failed to write local log: %s", e)

    def _ship_remote(self, events: list[DecisionEvent]) -> None:
        """Ship events to the AiDecision ingest endpoint."""
        try:
            import urllib.request

            payload = json.dumps(
                {"events": [e.to_dict() for e in events]},
                default=str,
            ).encode("utf-8")

            req = urllib.request.Request(
                self.endpoint,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                    "X-AiDecision-SDK": "python/0.1.0",
                },
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    logger.debug("AiDecision: shipped %d events", len(events))
                else:
                    logger.warning(
                        "AiDecision: ingest returned status %d for %d events — will retry",
                        resp.status,
                        len(events),
                    )
                    # Re-queue for retry
                    for event in events:
                        self.enqueue(event)

        except Exception as e:
            logger.warning(
                "AiDecision: failed to ship %d events (%s) — falling back to local log",
                len(events),
                e,
            )
            # Fallback to local on network failure
            self._write_local(events)

    def shutdown(self) -> None:
        """Graceful shutdown — flushes remaining events before stopping."""
        self._shutdown.set()
        self._thread.join(timeout=10)


# Module-level singleton — shared across all wrap() calls in a process
_default_store: Optional[AuditStore] = None
_store_lock = threading.Lock()


def get_default_store() -> AuditStore:
    """Return (or lazily create) the module-level default store."""
    global _default_store
    if _default_store is None:
        with _store_lock:
            if _default_store is None:
                _default_store = AuditStore()
    return _default_store
