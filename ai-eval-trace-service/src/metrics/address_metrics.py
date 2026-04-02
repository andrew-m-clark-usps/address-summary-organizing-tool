"""Concrete evaluation metrics for address verification models.

Implements DeepEval-inspired metrics adapted for USPS address correction:

- **AddressAccuracyMetric**: Field-by-field correctness against expected output
- **CorrectionCompletenessMetric**: Were all needed corrections applied?
- **HallucinationMetric**: Did the model fabricate address components?
- **FaithfulnessMetric**: Does the corrected output preserve intent of the input?
- **LatencyMetric**: Is model inference within acceptable bounds?
- **ValidationStatusMetric**: Did AMS validation succeed?
- **FieldConfidenceMetric**: Are per-field confidence scores calibrated?
- **RobustnessMetric**: Stability under input perturbations
- **RegressionMetric**: Comparison against previous model version baselines
- **BiasMetric**: Uniform performance across geographies / address types
"""

from __future__ import annotations

import re
from typing import Any

from src.core.models import (
    CorrectionResult,
    CorrectionType,
    MetricCategory,
    MetricResult,
    TestCase,
    ValidationStatus,
)
from src.metrics.base import BaseMetric


# ---------------------------------------------------------------------------
# 1. Address Accuracy (analogous to DeepEval's AnswerRelevancy)
# ---------------------------------------------------------------------------

class AddressAccuracyMetric(BaseMetric):
    """Measures field-by-field accuracy of corrected address vs. expected.

    Compares street, city, state, ZIP5, ZIP+4 with configurable per-field weights.
    """

    FIELD_WEIGHTS = {
        "street": 0.30,
        "city": 0.20,
        "state": 0.15,
        "zip5": 0.20,
        "zip_plus4": 0.10,
        "street2": 0.05,
    }

    def __init__(self, threshold: float = 0.80):
        super().__init__(
            name="address_accuracy",
            category=MetricCategory.ACCURACY,
            threshold=threshold,
            description="Field-by-field accuracy of corrected address versus expected canonical form",
        )

    def evaluate(self, test_case: TestCase, result: CorrectionResult) -> MetricResult:
        if not test_case.expected_address or not result.corrected:
            return self._make_result(0.0, reason="Missing expected or corrected address")

        expected = test_case.expected_address
        corrected = result.corrected
        field_scores: dict[str, float] = {}
        details: dict[str, Any] = {}

        for field, weight in self.FIELD_WEIGHTS.items():
            exp_val = _normalize(getattr(expected, field, ""))
            cor_val = _normalize(getattr(corrected, field, ""))
            if not exp_val:
                # Field not in expected — skip
                continue
            match = 1.0 if exp_val == cor_val else 0.0
            field_scores[field] = match * weight
            details[field] = {"expected": exp_val, "corrected": cor_val, "match": match == 1.0}

        total_weight = sum(self.FIELD_WEIGHTS[f] for f in field_scores)
        score = sum(field_scores.values()) / total_weight if total_weight > 0 else 0.0

        return self._make_result(
            score,
            reason=f"{sum(1 for d in details.values() if d['match'])}/{len(details)} fields match",
            details=details,
        )


# ---------------------------------------------------------------------------
# 2. Correction Completeness
# ---------------------------------------------------------------------------

class CorrectionCompletenessMetric(BaseMetric):
    """Measures whether the model applied all expected corrections."""

    def __init__(self, threshold: float = 0.80):
        super().__init__(
            name="correction_completeness",
            category=MetricCategory.CORRECTION_QUALITY,
            threshold=threshold,
            description="Fraction of expected corrections that were actually applied",
        )

    def evaluate(self, test_case: TestCase, result: CorrectionResult) -> MetricResult:
        expected = set(test_case.expected_corrections)
        if not expected:
            return self._make_result(1.0, reason="No corrections expected")

        applied = set(result.corrections_applied)
        matched = expected & applied
        score = len(matched) / len(expected)

        missing = expected - applied
        extra = applied - expected

        return self._make_result(
            score,
            reason=f"{len(matched)}/{len(expected)} corrections applied",
            details={
                "expected": [c.value for c in expected],
                "applied": [c.value for c in applied],
                "missing": [c.value for c in missing],
                "extra": [c.value for c in extra],
            },
        )


# ---------------------------------------------------------------------------
# 3. Hallucination Detection (DeepEval-style)
# ---------------------------------------------------------------------------

class HallucinationMetric(BaseMetric):
    """Detects fabricated address components not derivable from the input.

    Flags cases where the model introduces street names, cities, or ZIP codes
    that have no relationship to the original input — the address equivalent
    of an LLM hallucination.
    """

    def __init__(self, threshold: float = 0.90):
        super().__init__(
            name="hallucination",
            category=MetricCategory.HALLUCINATION,
            threshold=threshold,
            description="Detects fabricated address components not present in input",
        )

    def evaluate(self, test_case: TestCase, result: CorrectionResult) -> MetricResult:
        if not result.corrected:
            return self._make_result(1.0, reason="No correction output")

        original = test_case.input_address
        corrected = result.corrected
        hallucinations: list[dict[str, str]] = []

        # Check street number preservation
        orig_num = _extract_street_number(original.street)
        corr_num = _extract_street_number(corrected.street)
        if orig_num and corr_num and orig_num != corr_num:
            hallucinations.append({"field": "street_number", "original": orig_num, "fabricated": corr_num})

        # Check city — model should not invent a totally different city
        if original.city and corrected.city:
            orig_city = _normalize(original.city)
            corr_city = _normalize(corrected.city)
            if orig_city and corr_city and _levenshtein_ratio(orig_city, corr_city) < 0.4:
                hallucinations.append({"field": "city", "original": orig_city, "fabricated": corr_city})

        # Check state — should never change to a completely different state
        if original.state and corrected.state:
            orig_state = _normalize(original.state)
            corr_state = _normalize(corrected.state)
            if orig_state and corr_state and orig_state != corr_state:
                # Only flag if the original was a valid 2-letter code
                if len(orig_state) == 2:
                    hallucinations.append({"field": "state", "original": orig_state, "fabricated": corr_state})

        # Check ZIP — first 3 digits should generally be preserved
        if original.zip5 and corrected.zip5:
            orig_z = original.zip5.strip()[:3]
            corr_z = corrected.zip5.strip()[:3]
            if orig_z and corr_z and orig_z != corr_z:
                hallucinations.append({"field": "zip_prefix", "original": orig_z, "fabricated": corr_z})

        total_checks = 4
        score = 1.0 - (len(hallucinations) / total_checks)

        return self._make_result(
            max(score, 0.0),
            reason=f"{len(hallucinations)} hallucinated component(s) detected" if hallucinations else "No hallucinations",
            details={"hallucinations": hallucinations},
        )


# ---------------------------------------------------------------------------
# 4. Faithfulness (DeepEval-style)
# ---------------------------------------------------------------------------

class FaithfulnessMetric(BaseMetric):
    """Measures how faithfully the corrected address preserves the input intent.

    A correction is faithful if every component of the output is traceable back
    to the input or a known USPS standardisation rule.
    """

    def __init__(self, threshold: float = 0.85):
        super().__init__(
            name="faithfulness",
            category=MetricCategory.FAITHFULNESS,
            threshold=threshold,
            description="Output traceability back to input and USPS standardisation rules",
        )

    def evaluate(self, test_case: TestCase, result: CorrectionResult) -> MetricResult:
        if not result.corrected:
            return self._make_result(1.0, reason="No correction output")

        original = test_case.input_address
        corrected = result.corrected
        faithful_fields = 0
        total_fields = 0
        details: dict[str, Any] = {}

        for field in ("street", "city", "state", "zip5"):
            orig = _normalize(getattr(original, field, ""))
            corr = _normalize(getattr(corrected, field, ""))
            if not corr:
                continue
            total_fields += 1
            # Faithful if: exact match, or the corrected value contains key tokens from original
            if orig == corr or _token_overlap(orig, corr) >= 0.5:
                faithful_fields += 1
                details[field] = {"faithful": True}
            else:
                details[field] = {"faithful": False, "original": orig, "corrected": corr}

        score = faithful_fields / total_fields if total_fields > 0 else 1.0
        return self._make_result(score, reason=f"{faithful_fields}/{total_fields} fields faithful", details=details)


# ---------------------------------------------------------------------------
# 5. Latency / Performance
# ---------------------------------------------------------------------------

class LatencyMetric(BaseMetric):
    """Checks that model inference time is within acceptable bounds."""

    def __init__(self, max_ms: float = 500.0, threshold: float = 0.80):
        self.max_ms = max_ms
        super().__init__(
            name="latency",
            category=MetricCategory.LATENCY,
            threshold=threshold,
            description=f"Model inference latency within {max_ms}ms",
        )

    def evaluate(self, test_case: TestCase, result: CorrectionResult) -> MetricResult:
        actual = result.processing_time_ms
        if actual <= 0:
            return self._make_result(1.0, reason="No timing data available")

        score = max(0.0, 1.0 - (actual / self.max_ms)) if actual < self.max_ms else 0.0
        return self._make_result(
            score,
            reason=f"Inference took {actual:.1f}ms (limit: {self.max_ms}ms)",
            details={"actual_ms": actual, "max_ms": self.max_ms},
        )


# ---------------------------------------------------------------------------
# 6. Validation Status
# ---------------------------------------------------------------------------

class ValidationStatusMetric(BaseMetric):
    """Checks that the AMS validation status matches expectations."""

    def __init__(self, threshold: float = 1.0):
        super().__init__(
            name="validation_status",
            category=MetricCategory.ACCURACY,
            threshold=threshold,
            description="AMS validation status matches expected outcome",
        )

    def evaluate(self, test_case: TestCase, result: CorrectionResult) -> MetricResult:
        expected = test_case.expected_status
        actual = result.validation_status
        match = 1.0 if actual == expected else 0.0
        return self._make_result(
            match,
            reason=f"Expected {expected.value}, got {actual.value}",
            details={"expected": expected.value, "actual": actual.value},
        )


# ---------------------------------------------------------------------------
# 7. Confidence Calibration
# ---------------------------------------------------------------------------

class ConfidenceCalibrationMetric(BaseMetric):
    """Evaluates whether the model's confidence score is well-calibrated.

    High confidence on correct results and low confidence on incorrect results
    indicates a well-calibrated model.
    """

    def __init__(self, threshold: float = 0.70):
        super().__init__(
            name="confidence_calibration",
            category=MetricCategory.ACCURACY,
            threshold=threshold,
            description="Model confidence alignment with actual correctness",
        )

    def evaluate(self, test_case: TestCase, result: CorrectionResult) -> MetricResult:
        confidence = result.confidence
        # Determine actual correctness (use validation_status as proxy)
        is_correct = result.validation_status in (ValidationStatus.VALID, ValidationStatus.CORRECTED)

        if is_correct:
            score = confidence  # Higher is better
            reason = f"Correct result with {confidence:.0%} confidence"
        else:
            score = 1.0 - confidence  # Lower confidence = better calibration on failures
            reason = f"Incorrect result with {confidence:.0%} confidence (should be low)"

        return self._make_result(score, reason=reason, details={"confidence": confidence, "is_correct": is_correct})


# ---------------------------------------------------------------------------
# 8. Robustness
# ---------------------------------------------------------------------------

class RobustnessMetric(BaseMetric):
    """Measures model stability under common input perturbations.

    Evaluates whether the correction handles case variations, extra whitespace,
    missing punctuation, and common misspellings gracefully.
    """

    def __init__(self, threshold: float = 0.75):
        super().__init__(
            name="robustness",
            category=MetricCategory.ROBUSTNESS,
            threshold=threshold,
            description="Model stability under common address input perturbations",
        )

    def evaluate(self, test_case: TestCase, result: CorrectionResult) -> MetricResult:
        if not result.corrected:
            return self._make_result(0.0, reason="No correction output for robustness check")

        checks: dict[str, bool] = {}

        # Check 1: Output is properly standardised (uppercase)
        corrected = result.corrected
        checks["uppercase_standardised"] = corrected.street == corrected.street.upper() if corrected.street else True

        # Check 2: No leading/trailing whitespace
        checks["no_extra_whitespace"] = (
            corrected.street == corrected.street.strip()
            and corrected.city == corrected.city.strip()
        )

        # Check 3: ZIP is numeric and valid length
        z = corrected.zip5.strip()
        checks["valid_zip_format"] = bool(re.match(r"^\d{5}$", z)) if z else True

        # Check 4: State is valid 2-letter code
        checks["valid_state_format"] = bool(re.match(r"^[A-Z]{2}$", corrected.state.strip())) if corrected.state else True

        # Check 5: No double spaces in output
        checks["no_double_spaces"] = "  " not in corrected.street if corrected.street else True

        passed_checks = sum(1 for v in checks.values() if v)
        score = passed_checks / len(checks) if checks else 0.0

        return self._make_result(
            score,
            reason=f"{passed_checks}/{len(checks)} robustness checks passed",
            details={"checks": checks},
        )


# ---------------------------------------------------------------------------
# 9. Regression Detection
# ---------------------------------------------------------------------------

class RegressionMetric(BaseMetric):
    """Compares current model output against a baseline to detect regressions.

    If a previous model version produced a valid result for this test case,
    the current version should not degrade.
    """

    def __init__(self, threshold: float = 0.90):
        super().__init__(
            name="regression",
            category=MetricCategory.REGRESSION,
            threshold=threshold,
            description="Detects performance regressions compared to baseline model",
        )
        self._baselines: dict[str, CorrectionResult] = {}

    def set_baseline(self, test_case_id: str, baseline: CorrectionResult) -> None:
        self._baselines[test_case_id] = baseline

    def evaluate(self, test_case: TestCase, result: CorrectionResult) -> MetricResult:
        baseline = self._baselines.get(test_case.id)
        if not baseline:
            return self._make_result(1.0, reason="No baseline available — skipping regression check")

        regressions: list[str] = []

        # Check if validation status degraded
        valid_statuses = {ValidationStatus.VALID, ValidationStatus.CORRECTED}
        if baseline.validation_status in valid_statuses and result.validation_status not in valid_statuses:
            regressions.append(f"Validation regressed: {baseline.validation_status.value} → {result.validation_status.value}")

        # Check if confidence dropped significantly
        if result.confidence < baseline.confidence - 0.1:
            regressions.append(f"Confidence dropped: {baseline.confidence:.2f} → {result.confidence:.2f}")

        # Check if latency increased significantly (>50%)
        if baseline.processing_time_ms > 0 and result.processing_time_ms > baseline.processing_time_ms * 1.5:
            regressions.append(f"Latency regressed: {baseline.processing_time_ms:.0f}ms → {result.processing_time_ms:.0f}ms")

        score = 1.0 - (len(regressions) / 3.0)
        return self._make_result(
            max(score, 0.0),
            reason=f"{len(regressions)} regression(s) detected" if regressions else "No regressions",
            details={"regressions": regressions},
        )


# ---------------------------------------------------------------------------
# 10. Bias Detection
# ---------------------------------------------------------------------------

class BiasMetric(BaseMetric):
    """Checks for systematic bias in model performance across address types or regions."""

    def __init__(self, threshold: float = 0.80):
        super().__init__(
            name="bias",
            category=MetricCategory.BIAS,
            threshold=threshold,
            description="Uniform model performance across address types and regions",
        )

    def evaluate(self, test_case: TestCase, result: CorrectionResult) -> MetricResult:
        # Single test-case level: check if PO Box / rural / military addresses are treated fairly
        tags = set(test_case.tags)
        penalty = 0.0
        issues: list[str] = []

        # If it's a hard-to-process address type and model just failed without trying
        difficult_types = {"rural", "military", "po_box", "territory", "apo_fpo"}
        is_difficult = bool(tags & difficult_types)

        if is_difficult and result.validation_status == ValidationStatus.FAILED:
            if not result.corrections_applied:
                penalty += 0.3
                issues.append(f"No correction attempted for {tags & difficult_types} address")

        if is_difficult and result.confidence == 0.0:
            penalty += 0.2
            issues.append("Zero confidence for difficult address type")

        score = max(0.0, 1.0 - penalty)
        return self._make_result(
            score,
            reason=f"{len(issues)} bias indicator(s)" if issues else "No bias indicators",
            details={"issues": issues, "address_tags": list(tags)},
        )


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _normalize(s: str) -> str:
    """Upper-case, strip, collapse whitespace."""
    return re.sub(r"\s+", " ", s.upper().strip())


def _extract_street_number(street: str) -> str:
    """Extract leading numeric street number."""
    m = re.match(r"^(\d+)", street.strip())
    return m.group(1) if m else ""


def _levenshtein_ratio(a: str, b: str) -> float:
    """Simple normalised Levenshtein similarity."""
    if a == b:
        return 1.0
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    dist = _levenshtein_dist(a, b)
    return 1.0 - dist / max_len


def _levenshtein_dist(a: str, b: str) -> int:
    if len(a) < len(b):
        return _levenshtein_dist(b, a)
    if len(b) == 0:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            cost = 0 if ca == cb else 1
            curr.append(min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost))
        prev = curr
    return prev[-1]


def _token_overlap(a: str, b: str) -> float:
    """Proportion of tokens in ``a`` that appear in ``b``."""
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if not tokens_a:
        return 1.0
    return len(tokens_a & tokens_b) / len(tokens_a)
