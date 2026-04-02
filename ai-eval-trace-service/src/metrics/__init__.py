"""Metrics module — DeepEval-inspired evaluation metrics for address verification."""

from src.metrics.registry import MetricRegistry
from src.metrics.base import BaseMetric

__all__ = ["MetricRegistry", "BaseMetric"]
