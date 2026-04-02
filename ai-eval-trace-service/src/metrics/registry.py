"""Metric registry — central catalogue of all registered metrics."""

from __future__ import annotations

from src.metrics.base import BaseMetric


class MetricRegistry:
    """Thread-safe registry of evaluation metrics."""

    def __init__(self) -> None:
        self._metrics: dict[str, BaseMetric] = {}

    def register(self, metric: BaseMetric) -> None:
        """Register a metric. Overwrites if name already exists."""
        self._metrics[metric.name] = metric

    def unregister(self, name: str) -> None:
        self._metrics.pop(name, None)

    def get(self, name: str) -> BaseMetric | None:
        return self._metrics.get(name)

    def get_all(self) -> list[BaseMetric]:
        return list(self._metrics.values())

    @property
    def names(self) -> list[str]:
        return list(self._metrics.keys())

    def __len__(self) -> int:
        return len(self._metrics)

    def __contains__(self, name: str) -> bool:
        return name in self._metrics
