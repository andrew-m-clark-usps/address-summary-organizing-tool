"""Lightweight distributed-tracing implementation for the eval service.

Provides OpenTelemetry-inspired Span/Tracer primitives without requiring
the full OTel SDK.  Traces are collected in-memory and can be exported to
JSON audit files or rendered on the dashboard.
"""

from __future__ import annotations

import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Generator

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SpanKind(str, Enum):
    """OpenTelemetry-compatible span kinds."""
    INTERNAL = "internal"
    SERVER = "server"
    CLIENT = "client"
    PRODUCER = "producer"
    CONSUMER = "consumer"


class SpanStatus(str, Enum):
    UNSET = "unset"
    OK = "ok"
    ERROR = "error"


# ---------------------------------------------------------------------------
# Event & Span Models
# ---------------------------------------------------------------------------

class SpanEvent(BaseModel):
    """A timestamped event attached to a span."""
    name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    attributes: dict[str, Any] = Field(default_factory=dict)


class SpanLink(BaseModel):
    """A link to another span (e.g. upstream request)."""
    trace_id: str
    span_id: str
    attributes: dict[str, Any] = Field(default_factory=dict)


class Span(BaseModel):
    """A single trace span with OpenTelemetry-compatible structure."""
    span_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:16])
    trace_id: str = ""
    parent_span_id: str = ""
    name: str = ""
    kind: SpanKind = SpanKind.INTERNAL
    status: SpanStatus = SpanStatus.UNSET
    start_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: datetime | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    events: list[SpanEvent] = Field(default_factory=list)
    links: list[SpanLink] = Field(default_factory=list)
    _start_perf: float = 0.0

    model_config = {"arbitrary_types_allowed": True}

    # -- Mutable helpers (called during span lifetime) -----------------------

    def set_attribute(self, key: str, value: Any) -> None:
        self.attributes[key] = value

    def add_event(self, name: str, attributes: dict[str, Any] | None = None) -> None:
        self.events.append(SpanEvent(name=name, attributes=attributes or {}))

    def add_link(self, trace_id: str, span_id: str, attributes: dict[str, Any] | None = None) -> None:
        self.links.append(SpanLink(trace_id=trace_id, span_id=span_id, attributes=attributes or {}))

    def end(self) -> None:
        self.end_time = datetime.now(timezone.utc)
        if self.status == SpanStatus.UNSET:
            self.status = SpanStatus.OK

    @property
    def duration_ms(self) -> float:
        if self.end_time and self.start_time:
            return (self.end_time - self.start_time).total_seconds() * 1000
        return 0.0

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a JSON-safe dictionary for audit export."""
        return {
            "span_id": self.span_id,
            "trace_id": self.trace_id,
            "parent_span_id": self.parent_span_id,
            "name": self.name,
            "kind": self.kind.value,
            "status": self.status.value,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_ms": round(self.duration_ms, 3),
            "attributes": self.attributes,
            "events": [{"name": e.name, "timestamp": e.timestamp.isoformat(), "attributes": e.attributes} for e in self.events],
            "links": [{"trace_id": ln.trace_id, "span_id": ln.span_id, "attributes": ln.attributes} for ln in self.links],
        }


# ---------------------------------------------------------------------------
# Trace (collection of spans)
# ---------------------------------------------------------------------------

class Trace(BaseModel):
    """A complete trace composed of multiple spans."""
    trace_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    service_name: str = ""
    spans: list[Span] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def root_span(self) -> Span | None:
        for s in self.spans:
            if not s.parent_span_id:
                return s
        return self.spans[0] if self.spans else None

    @property
    def duration_ms(self) -> float:
        root = self.root_span
        return root.duration_ms if root else 0.0

    @property
    def span_count(self) -> int:
        return len(self.spans)

    @property
    def error_count(self) -> int:
        return sum(1 for s in self.spans if s.status == SpanStatus.ERROR)

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "service_name": self.service_name,
            "started_at": self.started_at.isoformat(),
            "duration_ms": round(self.duration_ms, 3),
            "span_count": self.span_count,
            "error_count": self.error_count,
            "metadata": self.metadata,
            "spans": [s.to_dict() for s in self.spans],
        }


# ---------------------------------------------------------------------------
# Service Tracer
# ---------------------------------------------------------------------------

class ServiceTracer:
    """Collects spans into traces, providing a context-manager API.

    Usage::

        tracer = ServiceTracer(service_name="address-eval")
        with tracer.start_span("process_batch") as span:
            span.set_attribute("batch.size", 500)
            ...
        traces = tracer.get_traces()
    """

    def __init__(self, service_name: str = "ai-eval-trace-service"):
        self.service_name = service_name
        self._traces: list[Trace] = []
        self._active_trace: Trace | None = None
        self._span_stack: list[Span] = []

    # -- Public API ----------------------------------------------------------

    @contextmanager
    def start_trace(self, name: str = "", metadata: dict[str, Any] | None = None) -> Generator[Trace, None, None]:
        """Begin a new trace context."""
        trace = Trace(service_name=self.service_name, metadata=metadata or {})
        prev = self._active_trace
        self._active_trace = trace
        try:
            yield trace
        finally:
            self._traces.append(trace)
            self._active_trace = prev

    @contextmanager
    def start_span(
        self,
        name: str,
        kind: SpanKind = SpanKind.INTERNAL,
        attributes: dict[str, Any] | None = None,
    ) -> Generator[Span, None, None]:
        """Create and yield a span; auto-closes on exit."""
        # Lazily create a trace if none is active
        if self._active_trace is None:
            trace = Trace(service_name=self.service_name)
            self._active_trace = trace
            self._traces.append(trace)

        parent_id = self._span_stack[-1].span_id if self._span_stack else ""
        span = Span(
            trace_id=self._active_trace.trace_id,
            parent_span_id=parent_id,
            name=name,
            kind=kind,
            attributes=attributes or {},
        )
        span._start_perf = time.perf_counter()
        self._span_stack.append(span)
        self._active_trace.spans.append(span)
        try:
            yield span
        except Exception as exc:
            span.status = SpanStatus.ERROR
            span.set_attribute("error", True)
            span.set_attribute("error.type", type(exc).__name__)
            span.set_attribute("error.message", str(exc))
            raise
        finally:
            span.end()
            self._span_stack.pop()

    def get_traces(self) -> list[Trace]:
        """Return all collected traces."""
        return list(self._traces)

    def get_all_spans(self) -> list[Span]:
        """Flatten all spans across all traces."""
        spans: list[Span] = []
        for t in self._traces:
            spans.extend(t.spans)
        return spans

    def clear(self) -> None:
        """Reset all traces."""
        self._traces.clear()
        self._active_trace = None
        self._span_stack.clear()

    def summary(self) -> dict[str, Any]:
        """Aggregate trace statistics for dashboard display."""
        all_spans = self.get_all_spans()
        durations = [s.duration_ms for s in all_spans if s.end_time]
        return {
            "service_name": self.service_name,
            "total_traces": len(self._traces),
            "total_spans": len(all_spans),
            "error_spans": sum(1 for s in all_spans if s.status == SpanStatus.ERROR),
            "avg_span_duration_ms": round(sum(durations) / len(durations), 3) if durations else 0.0,
            "max_span_duration_ms": round(max(durations), 3) if durations else 0.0,
            "min_span_duration_ms": round(min(durations), 3) if durations else 0.0,
            "span_kinds": {k.value: sum(1 for s in all_spans if s.kind == k) for k in SpanKind},
        }

    def export_json(self) -> list[dict[str, Any]]:
        """Export all traces as JSON-serialisable dicts."""
        return [t.to_dict() for t in self._traces]
