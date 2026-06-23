"""Test suite for the aidecision SDK — 26 tests total."""

import sys
import os
import unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from aidecision import (
    AIDecisionWrapper,
    CaptureError,
    Decision,
    DecisionCapture,
    DecisionOutcome,
    DecisionStore,
    NotFoundError,
    StoreError,
    ValidationError,
)
from aidecision.exceptions import AIDecisionError


# ---------------------------------------------------------------------------
# Models (6 tests)
# ---------------------------------------------------------------------------

class TestDecisionModel(unittest.TestCase):

    def test_decision_creation(self):
        d = Decision(input="prompt", output="response")
        self.assertEqual(d.input, "prompt")
        self.assertEqual(d.output, "response")

    def test_decision_defaults(self):
        d = Decision(input="x", output="y")
        self.assertEqual(d.model, "unknown")
        self.assertEqual(d.outcome, DecisionOutcome.UNKNOWN)
        self.assertEqual(d.metadata, {})
        self.assertIsNone(d.duration_ms)
        self.assertIsInstance(d.timestamp, datetime)
        self.assertIsNotNone(d.id)

    def test_decision_outcome_enum_values(self):
        self.assertEqual(DecisionOutcome.ACCEPTED.value, "accepted")
        self.assertEqual(DecisionOutcome.REJECTED.value, "rejected")
        self.assertEqual(DecisionOutcome.PENDING.value, "pending")
        self.assertEqual(DecisionOutcome.UNKNOWN.value, "unknown")

    def test_decision_to_dict(self):
        d = Decision(input="q", output="a", model="gpt-4", outcome=DecisionOutcome.ACCEPTED)
        data = d.to_dict()
        self.assertEqual(data["input"], "q")
        self.assertEqual(data["output"], "a")
        self.assertEqual(data["model"], "gpt-4")
        self.assertEqual(data["outcome"], "accepted")
        self.assertIn("id", data)
        self.assertIn("timestamp", data)

    def test_decision_from_dict(self):
        d = Decision(input="q", output="a", model="gpt-4", outcome=DecisionOutcome.ACCEPTED)
        data = d.to_dict()
        restored = Decision.from_dict(data)
        self.assertEqual(restored.id, d.id)
        self.assertEqual(restored.input, "q")
        self.assertEqual(restored.outcome, DecisionOutcome.ACCEPTED)
        self.assertIsInstance(restored.timestamp, datetime)

    def test_decision_metadata(self):
        meta = {"temperature": 0.7, "tokens": 128}
        d = Decision(input="x", output="y", metadata=meta)
        self.assertEqual(d.metadata["temperature"], 0.7)
        self.assertEqual(d.metadata["tokens"], 128)


# ---------------------------------------------------------------------------
# Exceptions (4 tests)
# ---------------------------------------------------------------------------

class TestExceptions(unittest.TestCase):

    def test_base_exception_is_exception(self):
        err = AIDecisionError("base error")
        self.assertIsInstance(err, Exception)
        self.assertEqual(str(err), "base error")

    def test_validation_error_inherits_base(self):
        err = ValidationError("bad input")
        self.assertIsInstance(err, AIDecisionError)

    def test_store_error_inherits_base(self):
        err = StoreError("store failed")
        self.assertIsInstance(err, AIDecisionError)

    def test_not_found_error_inherits_store_error(self):
        err = NotFoundError("missing")
        self.assertIsInstance(err, StoreError)
        self.assertIsInstance(err, AIDecisionError)


# ---------------------------------------------------------------------------
# DecisionCapture (5 tests)
# ---------------------------------------------------------------------------

class TestDecisionCapture(unittest.TestCase):

    def setUp(self):
        self.cap = DecisionCapture(model="test-model")

    def test_capture_creates_decision(self):
        d = self.cap.capture(input="hello", output="world")
        self.assertIsInstance(d, Decision)
        self.assertEqual(d.input, "hello")
        self.assertEqual(d.output, "world")
        self.assertEqual(d.model, "test-model")

    def test_capture_with_outcome(self):
        d = self.cap.capture(
            input="query",
            output="answer",
            outcome=DecisionOutcome.ACCEPTED,
        )
        self.assertEqual(d.outcome, DecisionOutcome.ACCEPTED)

    def test_capture_with_metadata(self):
        meta = {"source": "unit-test"}
        d = self.cap.capture(input="q", output="a", metadata=meta)
        self.assertEqual(d.metadata["source"], "unit-test")

    def test_capture_timing(self):
        def add(x, y):
            return x + y

        d = self.cap.capture_with_timing(add, 2, 3)
        self.assertEqual(d.output, 5)
        self.assertIsNotNone(d.duration_ms)
        self.assertGreaterEqual(d.duration_ms, 0)

    def test_capture_none_input_raises(self):
        with self.assertRaises(CaptureError):
            self.cap.capture(input=None, output="something")


# ---------------------------------------------------------------------------
# DecisionStore (6 tests)
# ---------------------------------------------------------------------------

class TestDecisionStore(unittest.TestCase):

    def setUp(self):
        self.store = DecisionStore()
        self.decision = Decision(input="a", output="b", model="m1")

    def test_store_add_decision(self):
        result = self.store.add(self.decision)
        self.assertEqual(result.id, self.decision.id)
        self.assertEqual(self.store.count(), 1)

    def test_store_get_decision(self):
        self.store.add(self.decision)
        fetched = self.store.get(self.decision.id)
        self.assertEqual(fetched.input, "a")

    def test_store_list_decisions(self):
        d2 = Decision(input="c", output="d")
        self.store.add(self.decision)
        self.store.add(d2)
        all_decisions = self.store.list()
        self.assertEqual(len(all_decisions), 2)

    def test_store_filter_by_outcome(self):
        accepted = Decision(input="x", output="y", outcome=DecisionOutcome.ACCEPTED)
        rejected = Decision(input="p", output="q", outcome=DecisionOutcome.REJECTED)
        self.store.add(accepted)
        self.store.add(rejected)
        results = self.store.filter_by_outcome(DecisionOutcome.ACCEPTED)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].outcome, DecisionOutcome.ACCEPTED)

    def test_store_delete_decision(self):
        self.store.add(self.decision)
        deleted = self.store.delete(self.decision.id)
        self.assertTrue(deleted)
        self.assertEqual(self.store.count(), 0)

    def test_store_not_found_raises(self):
        with self.assertRaises(NotFoundError):
            self.store.get("nonexistent-id")


# ---------------------------------------------------------------------------
# AIDecisionWrapper (5 tests)
# ---------------------------------------------------------------------------

class TestAIDecisionWrapper(unittest.TestCase):

    def setUp(self):
        self.wrapper = AIDecisionWrapper(model="claude-3")

    def test_wrapper_initialization(self):
        self.assertEqual(self.wrapper.model, "claude-3")
        with self.assertRaises(ValidationError):
            AIDecisionWrapper(model="")

    def test_wrapper_record(self):
        d = self.wrapper.record(
            input="What is 2+2?",
            output="4",
            outcome=DecisionOutcome.ACCEPTED,
        )
        self.assertIsInstance(d, Decision)
        self.assertEqual(d.input, "What is 2+2?")
        self.assertEqual(d.output, "4")

    def test_wrapper_get_history(self):
        self.wrapper.record(input="q1", output="a1")
        self.wrapper.record(input="q2", output="a2")
        history = self.wrapper.get_history()
        self.assertEqual(len(history), 2)

    def test_wrapper_clear_history(self):
        self.wrapper.record(input="q", output="a")
        self.wrapper.clear_history()
        self.assertEqual(len(self.wrapper.get_history()), 0)

    def test_wrapper_summary(self):
        self.wrapper.record(input="q1", output="a1", outcome=DecisionOutcome.ACCEPTED)
        self.wrapper.record(input="q2", output="a2", outcome=DecisionOutcome.ACCEPTED)
        self.wrapper.record(input="q3", output="a3", outcome=DecisionOutcome.REJECTED)
        summary = self.wrapper.summary()
        self.assertEqual(summary["model"], "claude-3")
        self.assertEqual(summary["total"], 3)
        self.assertEqual(summary["outcomes"]["accepted"], 2)
        self.assertEqual(summary["outcomes"]["rejected"], 1)


if __name__ == "__main__":
    unittest.main()
