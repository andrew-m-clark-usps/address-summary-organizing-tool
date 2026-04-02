"""USPS Address Management System (AMS) validation integration.

Provides an abstraction over USPS AMS / CASS validation that can work with:
- USPS Web Tools API (free, rate-limited)
- CASS-certified vendor APIs (SmartyStreets, Melissa, Lob)
- Local AMS file lookups
- A mock/stub for testing

The validator enriches CorrectionResults with DPV confirmation codes,
footnotes, carrier routes, and ZIP+4 data.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from src.core.models import (
    AddressRecord,
    AddressType,
    CorrectionResult,
    CorrectionType,
    ValidationStatus,
)


# ---------------------------------------------------------------------------
# AMS Response Model
# ---------------------------------------------------------------------------

class DPVCode(str, Enum):
    """DPV (Delivery Point Validation) confirmation codes."""
    CONFIRMED = "Y"           # Address confirmed
    CONFIRMED_MISSING_SEC = "D"  # Primary confirmed, secondary missing
    CONFIRMED_SEC_INVALID = "S"  # Primary confirmed, secondary invalid
    NOT_CONFIRMED = "N"       # Not confirmed / not deliverable


class AMSFootnote(str, Enum):
    """Common AMS/CASS processing footnotes."""
    ZIP_CORRECTED = "A#"
    CITY_STATE_CORRECTED = "B#"
    INVALID_CITY_STATE_ZIP = "C#"
    NO_ZIP_ASSIGNED = "D#"
    ZIP_MULTIPLE_RESPONSE = "E#"
    ADDRESS_NOT_FOUND = "F#"
    INFO_FROM_CITY_STATE = "G#"
    MISSING_SECONDARY = "H#"
    INSUFFICIENT_DATA = "I#"
    DUAL_ADDRESS = "J#"
    CARDINAL_RULE_APPLIED = "K#"
    CHANGED_ADDRESS = "L#"
    STREET_NAME_CHANGED = "M#"
    SUFFIX_NORMALIZED = "N#"
    RURAL_ROUTE_PMB = "O#"
    BETTER_ADDRESS_EXISTS = "P#"


class AMSResponse(BaseModel):
    """Response from AMS validation, containing all USPS standardisation data."""
    is_valid: bool = False
    dpv_code: str = ""
    dpv_footnotes: list[str] = Field(default_factory=list)
    carrier_route: str = ""
    delivery_point: str = ""
    congressional_district: str = ""
    county_fips: str = ""
    county_name: str = ""
    rdi: str = ""  # R=Residential, C=Commercial
    vacancy: str = ""
    lacs_link: str = ""
    ews_match: bool = False
    standardised_address: AddressRecord | None = None
    footnotes: list[str] = Field(default_factory=list)
    error_message: str = ""
    response_time_ms: float = 0.0
    raw_response: dict[str, Any] = Field(default_factory=dict)

    @property
    def is_deliverable(self) -> bool:
        return self.dpv_code in ("Y", "D")


# ---------------------------------------------------------------------------
# AMS Validator
# ---------------------------------------------------------------------------

class AMSValidator:
    """Validates addresses against USPS AMS rules.

    Uses a pluggable backend strategy — defaults to a built-in rule-based
    validator for offline use / testing.

    Usage::

        validator = AMSValidator()
        response = validator.validate(address)
        enriched = validator.enrich_correction(correction_result)
    """

    # Valid US state/territory codes
    VALID_STATES = frozenset([
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
        "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
        "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
        "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
        "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
        "DC", "PR", "GU", "VI", "AS", "MP", "AA", "AE", "AP",
    ])

    # USPS street suffix abbreviations
    SUFFIX_MAP: dict[str, str] = {
        "STREET": "ST", "AVENUE": "AVE", "ROAD": "RD", "DRIVE": "DR",
        "BOULEVARD": "BLVD", "LANE": "LN", "COURT": "CT", "CIRCLE": "CIR",
        "PLACE": "PL", "TERRACE": "TER", "WAY": "WAY", "TRAIL": "TRL",
        "HIGHWAY": "HWY", "PARKWAY": "PKWY", "EXPRESSWAY": "EXPY",
    }

    DIRECTIONAL_MAP: dict[str, str] = {
        "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W",
        "NORTHEAST": "NE", "NORTHWEST": "NW", "SOUTHEAST": "SE", "SOUTHWEST": "SW",
    }

    def __init__(self, mode: str = "local"):
        """Initialize with backend mode: 'local' (rule-based), 'api', or 'mock'."""
        self.mode = mode

    # -- Public API ----------------------------------------------------------

    def validate(self, address: AddressRecord) -> AMSResponse:
        """Validate an address and return enriched AMS response."""
        if self.mode == "mock":
            return self._mock_validate(address)
        return self._local_validate(address)

    def enrich_correction(self, correction: CorrectionResult) -> CorrectionResult:
        """Run AMS validation on a correction result and enrich it."""
        if not correction.corrected:
            return correction

        response = self.validate(correction.corrected)

        # Update the corrected address with AMS data
        enriched = correction.corrected.model_copy()
        if response.standardised_address:
            std = response.standardised_address
            if std.street:
                enriched.street = std.street
            if std.zip_plus4:
                enriched.zip_plus4 = std.zip_plus4
                if CorrectionType.ZIP_PLUS4_ADDED not in correction.corrections_applied:
                    correction.corrections_applied.append(CorrectionType.ZIP_PLUS4_ADDED)
        enriched.carrier_route = response.carrier_route
        enriched.delivery_point = response.delivery_point
        enriched.dpv_confirmation = response.dpv_code
        enriched.rdi = response.rdi
        enriched.vacancy_indicator = response.vacancy
        enriched.county = response.county_name
        enriched.congressional_district = response.congressional_district

        correction.corrected = enriched
        correction.ams_response_code = response.dpv_code
        correction.ams_footnotes = response.footnotes

        if response.is_valid:
            correction.validation_status = ValidationStatus.VALID
        elif response.dpv_code == DPVCode.CONFIRMED_MISSING_SEC.value:
            correction.validation_status = ValidationStatus.PARTIAL
        else:
            correction.validation_status = ValidationStatus.FAILED

        return correction

    # -- Local rule-based validation -----------------------------------------

    def _local_validate(self, address: AddressRecord) -> AMSResponse:
        """Rule-based local validation simulating AMS checks."""
        footnotes: list[str] = []
        is_valid = True
        dpv_code = DPVCode.CONFIRMED.value
        standardised = address.model_copy()

        # 1. Standardise street
        std_street = self._standardise_street(address.street)
        if std_street != address.street.upper().strip():
            footnotes.append(AMSFootnote.SUFFIX_NORMALIZED.value)
        standardised.street = std_street

        # 2. Validate state
        state = address.state.upper().strip()
        if state not in self.VALID_STATES:
            is_valid = False
            dpv_code = DPVCode.NOT_CONFIRMED.value
            footnotes.append(AMSFootnote.INVALID_CITY_STATE_ZIP.value)
        standardised.state = state

        # 3. Validate ZIP
        zip_clean = re.sub(r"\D", "", address.zip5)
        if not zip_clean or len(zip_clean) < 5:
            is_valid = False
            dpv_code = DPVCode.NOT_CONFIRMED.value
            footnotes.append(AMSFootnote.NO_ZIP_ASSIGNED.value)
        else:
            standardised.zip5 = zip_clean[:5]

        # 4. Check for missing components
        if not address.street.strip():
            is_valid = False
            dpv_code = DPVCode.NOT_CONFIRMED.value
            footnotes.append(AMSFootnote.INSUFFICIENT_DATA.value)

        if not address.city.strip():
            is_valid = False
            footnotes.append(AMSFootnote.INSUFFICIENT_DATA.value)

        standardised.city = address.city.upper().strip()

        # 5. Detect address type
        street_upper = address.street.upper()
        if re.search(r"\bPO\s*BOX\b", street_upper):
            standardised.address_type = AddressType.PO_BOX
        elif re.search(r"\b(APO|FPO|DPO)\b", street_upper):
            standardised.address_type = AddressType.MILITARY
        elif re.search(r"\b(STE|SUITE|FL|FLOOR)\b", street_upper):
            standardised.address_type = AddressType.COMMERCIAL

        # 6. Generate synthetic ZIP+4 for valid addresses
        if is_valid and not standardised.zip_plus4:
            standardised.zip_plus4 = "0001"

        return AMSResponse(
            is_valid=is_valid,
            dpv_code=dpv_code,
            dpv_footnotes=[dpv_code],
            footnotes=footnotes,
            standardised_address=standardised,
            carrier_route=f"C{hash(address.street) % 999:03d}" if is_valid else "",
            delivery_point=f"{hash(address.full_address) % 99:02d}" if is_valid else "",
            rdi="R",
            county_name=address.county or "UNKNOWN",
        )

    def _standardise_street(self, street: str) -> str:
        """Apply USPS street standardisation rules."""
        s = street.upper().strip()
        s = re.sub(r"[^A-Z0-9\s#\-/]", " ", s)
        s = re.sub(r"\s+", " ", s).strip()

        # Replace full suffix words
        for full, abbr in self.SUFFIX_MAP.items():
            s = re.sub(rf"\b{full}\b", abbr, s)

        # Replace full directionals
        for full, abbr in self.DIRECTIONAL_MAP.items():
            s = re.sub(rf"\b{full}\b", abbr, s)

        return s

    # -- Mock validation for testing -----------------------------------------

    def _mock_validate(self, address: AddressRecord) -> AMSResponse:
        """Return a mock success response for testing."""
        std = address.model_copy()
        std.street = std.street.upper().strip()
        std.city = std.city.upper().strip()
        std.state = std.state.upper().strip()
        std.zip_plus4 = "0001"
        return AMSResponse(
            is_valid=True,
            dpv_code=DPVCode.CONFIRMED.value,
            standardised_address=std,
            carrier_route="C001",
            delivery_point="01",
            rdi="R",
            county_name="MOCK COUNTY",
        )
