"""Core data models for the AI Address Evaluation and Trace Service.

Provides Pydantic models for address records, test cases, evaluation results,
correction outcomes, and evaluation suites — the foundational data structures
used throughout the service.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class AddressType(str, Enum):
    """USPS address classification."""
    RESIDENTIAL = "residential"
    COMMERCIAL = "commercial"
    PO_BOX = "po_box"
    MILITARY = "military"
    GENERAL_DELIVERY = "general_delivery"
    RURAL_ROUTE = "rural_route"
    UNKNOWN = "unknown"


class ValidationStatus(str, Enum):
    """AMS validation outcome."""
    VALID = "valid"
    CORRECTED = "corrected"
    FAILED = "failed"
    UNDELIVERABLE = "undeliverable"
    PARTIAL = "partial"
    NOT_VALIDATED = "not_validated"


class Severity(str, Enum):
    """Issue severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class CorrectionType(str, Enum):
    """Types of address corrections applied."""
    ZIP_CORRECTED = "zip_corrected"
    CITY_CORRECTED = "city_corrected"
    STATE_CORRECTED = "state_corrected"
    STREET_STANDARDIZED = "street_standardized"
    SECONDARY_ADDED = "secondary_added"
    SECONDARY_REMOVED = "secondary_removed"
    DIRECTIONAL_ADDED = "directional_added"
    SUFFIX_CORRECTED = "suffix_corrected"
    ZIP_PLUS4_ADDED = "zip_plus4_added"
    CASS_CORRECTED = "cass_corrected"
    NO_CORRECTION = "no_correction"


class MetricCategory(str, Enum):
    """Categories of evaluation metrics."""
    ACCURACY = "accuracy"
    CORRECTION_QUALITY = "correction_quality"
    LATENCY = "latency"
    THROUGHPUT = "throughput"
    HALLUCINATION = "hallucination"
    FAITHFULNESS = "faithfulness"
    RELEVANCE = "relevance"
    BIAS = "bias"
    ROBUSTNESS = "robustness"
    REGRESSION = "regression"


# ---------------------------------------------------------------------------
# Address Models
# ---------------------------------------------------------------------------

class AddressRecord(BaseModel):
    """A single address record with all USPS-relevant fields."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    street: str = ""
    street2: str = ""
    city: str = ""
    state: str = ""
    zip5: str = ""
    zip_plus4: str = ""
    county: str = ""
    carrier_route: str = ""
    delivery_point: str = ""
    address_type: AddressType = AddressType.UNKNOWN
    latitude: float | None = None
    longitude: float | None = None
    dpv_confirmation: str = ""
    lacs_link_indicator: str = ""
    congressional_district: str = ""
    rdi: str = ""  # Residential Delivery Indicator
    vacancy_indicator: str = ""
    raw_input: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def full_address(self) -> str:
        """Return the full single-line address string."""
        parts = [self.street]
        if self.street2:
            parts.append(self.street2)
        city_state_zip = f"{self.city}, {self.state} {self.zip5}"
        if self.zip_plus4:
            city_state_zip += f"-{self.zip_plus4}"
        parts.append(city_state_zip)
        return ", ".join(p for p in parts if p.strip())


class CorrectionResult(BaseModel):
    """Result of an address correction attempt."""
    original: AddressRecord
    corrected: AddressRecord | None = None
    corrections_applied: list[CorrectionType] = Field(default_factory=list)
    confidence: float = 0.0
    validation_status: ValidationStatus = ValidationStatus.NOT_VALIDATED
    ams_response_code: str = ""
    ams_footnotes: list[str] = Field(default_factory=list)
    processing_time_ms: float = 0.0
    model_version: str = ""
    trace_id: str = ""
    error_message: str = ""
    field_changes: dict[str, dict[str, str]] = Field(default_factory=dict)

    @property
    def was_corrected(self) -> bool:
        return self.corrected is not None and len(self.corrections_applied) > 0

    @property
    def fields_changed_count(self) -> int:
        return len(self.field_changes)


# ---------------------------------------------------------------------------
# Test Case & Evaluation Models
# ---------------------------------------------------------------------------

class TestCase(BaseModel):
    """A single test case for evaluating an address correction model.

    Inspired by DeepEval's test case structure, adapted for address verification.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    input_address: AddressRecord
    expected_address: AddressRecord | None = None
    expected_status: ValidationStatus = ValidationStatus.VALID
    expected_corrections: list[CorrectionType] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    priority: Severity = Severity.MEDIUM
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MetricResult(BaseModel):
    """Result of a single metric evaluation."""
    metric_name: str
    category: MetricCategory
    score: float
    threshold: float = 0.0
    passed: bool = True
    reason: str = ""
    details: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EvaluationResult(BaseModel):
    """Complete result for a single test case evaluation."""
    test_case_id: str
    test_case_name: str = ""
    correction_result: CorrectionResult | None = None
    metric_results: list[MetricResult] = Field(default_factory=list)
    overall_score: float = 0.0
    passed: bool = True
    duration_ms: float = 0.0
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    errors: list[str] = Field(default_factory=list)

    @property
    def failed_metrics(self) -> list[MetricResult]:
        return [m for m in self.metric_results if not m.passed]

    @property
    def metric_summary(self) -> dict[str, float]:
        return {m.metric_name: m.score for m in self.metric_results}


class EvaluationSuite(BaseModel):
    """A collection of test cases and their evaluation results.

    Analogous to DeepEval's evaluate() output — aggregates results across
    multiple test cases with summary statistics.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Address Verification Evaluation"
    description: str = ""
    model_version: str = ""
    test_cases: list[TestCase] = Field(default_factory=list)
    results: list[EvaluationResult] = Field(default_factory=list)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def total_tests(self) -> int:
        return len(self.results)

    @property
    def passed_tests(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def failed_tests(self) -> int:
        return self.total_tests - self.passed_tests

    @property
    def pass_rate(self) -> float:
        return (self.passed_tests / self.total_tests * 100) if self.total_tests > 0 else 0.0

    @property
    def avg_score(self) -> float:
        if not self.results:
            return 0.0
        return sum(r.overall_score for r in self.results) / len(self.results)

    @property
    def avg_duration_ms(self) -> float:
        if not self.results:
            return 0.0
        return sum(r.duration_ms for r in self.results) / len(self.results)

    @property
    def duration_seconds(self) -> float:
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return 0.0

    def summary(self) -> dict[str, Any]:
        """Return a summary dictionary for dashboard/audit output."""
        return {
            "suite_id": self.id,
            "name": self.name,
            "model_version": self.model_version,
            "total_tests": self.total_tests,
            "passed": self.passed_tests,
            "failed": self.failed_tests,
            "pass_rate": round(self.pass_rate, 2),
            "avg_score": round(self.avg_score, 4),
            "avg_duration_ms": round(self.avg_duration_ms, 2),
            "total_duration_s": round(self.duration_seconds, 2),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
