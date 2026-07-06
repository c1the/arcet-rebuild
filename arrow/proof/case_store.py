"""Load and validate case_config.json for an Arrow Proof case directory."""

from __future__ import annotations

import json
from pathlib import Path

from schemas import CaseConfig, parse_dt

REQUIRED_FIELDS = [
    "case_id",
    "event_name",
    "event_type",
    "target_actor",
    "target_organisation",
    "country_jurisdiction",
    "prediction_question",
    "outcome_classes",
    "positive_outcome_definition",
    "negative_outcome_definition",
]


class CaseConfigError(Exception):
    """Raised when a case config is missing, unparseable, or incomplete."""


def load_case_config(case_dir: Path) -> CaseConfig:
    """Load and validate ``case_config.json`` from ``case_dir``.

    Raises CaseConfigError with a full list of problems rather than failing
    on the first one, so a broken config can be fixed in one pass.
    """
    case_dir = Path(case_dir)
    config_path = case_dir / "case_config.json"
    if not config_path.is_file():
        raise CaseConfigError(f"No case_config.json found in {case_dir}")

    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CaseConfigError(f"{config_path} is not valid JSON: {exc}") from exc

    problems: list[str] = []

    for name in REQUIRED_FIELDS:
        value = raw.get(name)
        if value is None or value == "" or value == []:
            problems.append(f"missing required field: {name}")

    # The cutoff may appear as "forecast_cutoff" (Phase 0 template) or
    # "forecast_cutoff_date". Exactly one aware datetime is required.
    cutoff_raw = raw.get("forecast_cutoff") or raw.get("forecast_cutoff_date")
    cutoff = None
    if cutoff_raw is None:
        problems.append("missing required field: forecast_cutoff (or forecast_cutoff_date)")
    else:
        try:
            cutoff = parse_dt(cutoff_raw)
        except ValueError:
            problems.append(f"forecast_cutoff is not a valid ISO 8601 datetime: {cutoff_raw!r}")

    window = raw.get("data_window") or {}
    window_start = window_end = None
    try:
        window_start = parse_dt(window.get("start"))
    except ValueError:
        problems.append(f"data_window.start is not a valid ISO 8601 datetime: {window.get('start')!r}")
    try:
        window_end = parse_dt(window.get("end"))
    except ValueError:
        problems.append(f"data_window.end is not a valid ISO 8601 datetime: {window.get('end')!r}")
    if window_start and window_end and window_start > window_end:
        problems.append("data_window.start is after data_window.end")
    if window_end and cutoff and window_end > cutoff:
        problems.append("data_window.end is after the forecast cutoff")

    if problems:
        raise CaseConfigError(
            f"Invalid case config {config_path}:\n  - " + "\n  - ".join(problems)
        )

    return CaseConfig(
        case_id=raw["case_id"],
        event_name=raw["event_name"],
        event_type=raw["event_type"],
        target_actor=raw["target_actor"],
        target_organisation=raw["target_organisation"],
        country_jurisdiction=raw["country_jurisdiction"],
        prediction_question=raw["prediction_question"],
        forecast_cutoff=cutoff,
        outcome_classes=list(raw["outcome_classes"]),
        positive_outcome_definition=raw["positive_outcome_definition"],
        negative_outcome_definition=raw["negative_outcome_definition"],
        data_window_start=window_start,
        data_window_end=window_end,
        forecast_horizon_days=raw.get("forecast_horizon_days"),
        actual_event_date=raw.get("actual_event_date"),
        allowed_sources=list(raw.get("allowed_sources") or []),
        excluded_sources=list(raw.get("excluded_sources") or []),
        known_limitations=list(raw.get("known_limitations") or []),
        status=raw.get("status", "defined"),
        frozen_at=raw.get("frozen_at"),
        frozen_by=raw.get("frozen_by"),
    )
