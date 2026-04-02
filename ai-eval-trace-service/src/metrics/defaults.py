"""Default metric registration — registers all standard address verification metrics."""

from __future__ import annotations

from src.metrics.address_metrics import (
    AddressAccuracyMetric,
    BiasMetric,
    ConfidenceCalibrationMetric,
    CorrectionCompletenessMetric,
    FaithfulnessMetric,
    HallucinationMetric,
    LatencyMetric,
    RegressionMetric,
    RobustnessMetric,
    ValidationStatusMetric,
)
from src.metrics.registry import MetricRegistry


def register_all(registry: MetricRegistry) -> None:
    """Register the full suite of address verification evaluation metrics."""
    registry.register(AddressAccuracyMetric())
    registry.register(CorrectionCompletenessMetric())
    registry.register(HallucinationMetric())
    registry.register(FaithfulnessMetric())
    registry.register(LatencyMetric())
    registry.register(ValidationStatusMetric())
    registry.register(ConfidenceCalibrationMetric())
    registry.register(RobustnessMetric())
    registry.register(RegressionMetric())
    registry.register(BiasMetric())
