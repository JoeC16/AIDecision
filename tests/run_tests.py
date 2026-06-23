#!/usr/bin/env python3
"""Test runner for the aidecision SDK."""

import sys
import os
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def run():
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=os.path.dirname(__file__), pattern="test_*.py")

    runner = unittest.TextTestRunner(verbosity=2, stream=sys.stdout)
    result = runner.run(suite)

    total = result.testsRun
    failures = len(result.failures)
    errors = len(result.errors)
    passed = total - failures - errors

    print()
    print("=" * 60)
    print(f"  Ran {total} tests — {passed} passed, {failures} failed, {errors} errors")
    print("=" * 60)

    sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == "__main__":
    run()
