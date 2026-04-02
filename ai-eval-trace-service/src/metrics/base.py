"""Base metric interface and abstract classes.

Every metric must implement ``evaluate()`` which receives a TestCase and a
CorrectionResult, returning a MetricResult.  This follows the DeepEval pattern
of composable, pluggable metrics with thresholds and human-readable explanations.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from src.core.models import (
    CorrectionResult,
    MetricCategory,
    MetricResult,
    TestCase,
)


class BaseMetric(ABC):
    """Abstract base class for all evaluation metrics."""

    def __init__(self, name: str, category: MetricCategory, threshold: float = 0.5, weight: float = 1.0):
        self._name = name
        self._category = category
        self._threshold = threshold
        self._weight = weight

    @property
    def name(self) -> str:
        return self._name

    @property
    def category(self) -> MetricCategory:
        return self._category

    @property
    def threshold(self) -> float:
        return self._threshold

    @threshold.setter
    def threshold(self, value: float) -> None:
        self._threshold = value

    @property
    def weight(self) -> float:
        return self._weight

    @abstractmethod
    def evaluate(self, test_case: TestCase, correction: CorrectionResult) -> MetricResult:
        """Compute the metric score for a single test case."""
        ...

    def _make_result(self, score: float, reason: str = "", details: dict | None = None) -> MetricResult:
        """Helper to build a MetricResult with threshold check."""
        return MetricResult(
            metric_name=self._name,
            category=self._category,
            score=round(score, 6),
            threshold=self._threshold,
            passed=score >= self._threshold,
            reason=reason,
            details=details or {},
        )
