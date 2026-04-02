"""Core evaluation engine and data models."""

from src.core.engine import EvaluationEngine
from src.core.models import (
    AddressRecord,
    CorrectionResult,
    EvaluationResult,
    EvaluationSuite,
    TestCase,
)

__all__ = [
    "EvaluationEngine",
    "AddressRecord",
    "CorrectionResult",
    "EvaluationResult",
    "EvaluationSuite",
    "TestCase",
]
