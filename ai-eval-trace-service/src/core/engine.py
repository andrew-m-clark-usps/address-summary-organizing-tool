"""Evaluation engine — orchestrates test execution and metric evaluation.

Inspired by DeepEval's evaluate() pattern: takes a list of test cases, runs them
through the address correction model, applies all configured metrics, and produces
an EvaluationSuite with comprehensive results.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Callable, Protocol

from src.core.models import (
    AddressRecord,
    CorrectionResult,
    EvaluationResult,
    EvaluationSuite,
    MetricResult,
    TestCase,
    ValidationStatus,
)
from src.metrics.registry import MetricRegistry
from src.traces.tracer import ServiceTracer, SpanKind


# ---------------------------------------------------------------------------
# Protocol for pluggable address correction models
# ---------------------------------------------------------------------------

class AddressCorrectionModel(Protocol):
    """Interface that any address correction model must implement."""

    def correct(self, address: AddressRecord) -> CorrectionResult:
        """Attempt to correct and validate the given address."""
        ...

    @property
    def version(self) -> str:
        """Return the model version string."""
        ...


# ---------------------------------------------------------------------------
# Default (passthrough) model for demo / testing
# ---------------------------------------------------------------------------

class PassthroughModel:
    """A no-op model that returns the input as-is. Used for baseline comparisons."""

    def __init__(self, version: str = "passthrough-1.0"):
        self._version = version

    def correct(self, address: AddressRecord) -> CorrectionResult:
        return CorrectionResult(
            original=address,
            corrected=address.model_copy(),
            corrections_applied=[],
            confidence=1.0,
            validation_status=ValidationStatus.NOT_VALIDATED,
            model_version=self._version,
        )

    @property
    def version(self) -> str:
        return self._version


# ---------------------------------------------------------------------------
# Evaluation Engine
# ---------------------------------------------------------------------------

class EvaluationEngine:
    """Core engine that evaluates an address correction model against test cases.

    Usage::

        engine = EvaluationEngine(model=my_model)
        engine.register_default_metrics()
        suite = engine.evaluate(test_cases, suite_name="Nightly Regression")
        print(suite.summary())
    """

    def __init__(
        self,
        model: AddressCorrectionModel | None = None,
        tracer: ServiceTracer | None = None,
        config: dict[str, Any] | None = None,
    ):
        self.model = model or PassthroughModel()
        self.tracer = tracer or ServiceTracer(service_name="eval-engine")
        self.metric_registry = MetricRegistry()
        self.config = config or {}
        self._pre_hooks: list[Callable] = []
        self._post_hooks: list[Callable] = []

    # -- Hook registration ---------------------------------------------------

    def add_pre_hook(self, hook: Callable[[TestCase], None]) -> None:
        """Register a hook called before each test case execution."""
        self._pre_hooks.append(hook)

    def add_post_hook(self, hook: Callable[[EvaluationResult], None]) -> None:
        """Register a hook called after each test case execution."""
        self._post_hooks.append(hook)

    # -- Metric registration -------------------------------------------------

    def register_default_metrics(self) -> None:
        """Register the standard suite of address verification metrics."""
        from src.metrics import defaults
        defaults.register_all(self.metric_registry)

    # -- Evaluation ----------------------------------------------------------

    def evaluate(
        self,
        test_cases: list[TestCase],
        suite_name: str = "Address Verification Evaluation",
        suite_description: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> EvaluationSuite:
        """Run all test cases through the model and evaluate with all metrics."""
        suite = EvaluationSuite(
            name=suite_name,
            description=suite_description,
            model_version=self.model.version,
            test_cases=test_cases,
            started_at=datetime.now(timezone.utc),
            metadata=metadata or {},
        )

        with self.tracer.start_span("evaluation_suite", kind=SpanKind.INTERNAL, attributes={
            "suite.name": suite_name,
            "suite.test_count": len(test_cases),
            "model.version": self.model.version,
        }) as suite_span:
            results = []
            for tc in test_cases:
                result = self._evaluate_single(tc)
                results.append(result)
                suite_span.add_event("test_completed", {
                    "test_case_id": tc.id,
                    "passed": result.passed,
                    "score": result.overall_score,
                })

            suite.results = results
            suite.completed_at = datetime.now(timezone.utc)

            suite_span.set_attribute("suite.passed", suite.passed_tests)
            suite_span.set_attribute("suite.failed", suite.failed_tests)
            suite_span.set_attribute("suite.pass_rate", suite.pass_rate)

        return suite

    def _evaluate_single(self, test_case: TestCase) -> EvaluationResult:
        """Evaluate a single test case."""
        for hook in self._pre_hooks:
            hook(test_case)

        start = time.perf_counter()

        with self.tracer.start_span("test_case_execution", kind=SpanKind.INTERNAL, attributes={
            "test_case.id": test_case.id,
            "test_case.name": test_case.name,
        }) as span:
            # Step 1: Run the model
            correction_result = self._run_model(test_case, span)

            # Step 2: Evaluate all metrics
            metric_results = self._run_metrics(test_case, correction_result, span)

            # Step 3: Compute overall score and pass/fail
            overall_score = self._compute_overall_score(metric_results)
            passed = all(m.passed for m in metric_results) if metric_results else True

            elapsed_ms = (time.perf_counter() - start) * 1000

            result = EvaluationResult(
                test_case_id=test_case.id,
                test_case_name=test_case.name,
                correction_result=correction_result,
                metric_results=metric_results,
                overall_score=overall_score,
                passed=passed,
                duration_ms=elapsed_ms,
                trace_id=span.trace_id,
            )

            span.set_attribute("result.passed", passed)
            span.set_attribute("result.score", overall_score)
            span.set_attribute("result.duration_ms", elapsed_ms)

        for hook in self._post_hooks:
            hook(result)

        return result

    def _run_model(self, test_case: TestCase, parent_span: Any) -> CorrectionResult:
        """Execute the address correction model within a traced span."""
        with self.tracer.start_span("model_inference", kind=SpanKind.INTERNAL, attributes={
            "input.address": test_case.input_address.full_address,
        }) as span:
            start = time.perf_counter()
            try:
                result = self.model.correct(test_case.input_address)
                elapsed = (time.perf_counter() - start) * 1000
                result.processing_time_ms = elapsed
                result.trace_id = span.trace_id
                span.set_attribute("model.latency_ms", elapsed)
                span.set_attribute("model.status", result.validation_status.value)
                if result.corrected:
                    span.set_attribute("output.address", result.corrected.full_address)
                return result
            except Exception as exc:
                span.set_attribute("error", True)
                span.set_attribute("error.message", str(exc))
                return CorrectionResult(
                    original=test_case.input_address,
                    error_message=str(exc),
                    validation_status=ValidationStatus.FAILED,
                )

    def _run_metrics(
        self,
        test_case: TestCase,
        correction: CorrectionResult,
        parent_span: Any,
    ) -> list[MetricResult]:
        """Evaluate all registered metrics for a single test case."""
        results: list[MetricResult] = []
        for metric in self.metric_registry.get_all():
            with self.tracer.start_span(f"metric_{metric.name}", kind=SpanKind.INTERNAL) as span:
                try:
                    mr = metric.evaluate(test_case, correction)
                    span.set_attribute("metric.score", mr.score)
                    span.set_attribute("metric.passed", mr.passed)
                    results.append(mr)
                except Exception as exc:
                    results.append(MetricResult(
                        metric_name=metric.name,
                        category=metric.category,
                        score=0.0,
                        passed=False,
                        reason=f"Metric error: {exc}",
                    ))
                    span.set_attribute("error", True)
                    span.set_attribute("error.message", str(exc))
        return results

    def _compute_overall_score(self, metrics: list[MetricResult]) -> float:
        """Weighted average of all metric scores."""
        if not metrics:
            return 0.0
        weights = {m.metric_name: self.config.get("weights", {}).get(m.metric_name, 1.0) for m in metrics}
        total_weight = sum(weights.values())
        if total_weight == 0:
            return 0.0
        weighted_sum = sum(m.score * weights[m.metric_name] for m in metrics)
        return weighted_sum / total_weight
