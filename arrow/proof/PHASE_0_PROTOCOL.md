# Phase 0 Protocol — Controlled Historical Forecasting

Every Phase 0 case is defined **completely and in writing before any evidence is collected**. The protocol fields below are frozen at case creation; changing them after evidence collection begins invalidates the case.

## Case definition fields

| Field | Description | Example format |
|-------|-------------|----------------|
| **Event name** | Short unique name for the historical event | `thatcher-leadership-1990` |
| **Event type** | Category of political event | leadership challenge, no-confidence vote, resignation, election, coalition collapse, treaty ratification |
| **Target actor** | The individual whose outcome is being forecast | full name, role at the time |
| **Target organisation** | The party, government, or body the event occurs within | e.g. Conservative Party (UK) |
| **Country / jurisdiction** | Where the event takes place and which rules govern it | ISO country code + body |
| **Actual event date** | The date the outcome resolved in reality | ISO 8601 date |
| **Forecast cutoff date** | Hard information boundary. No evidence with `knowledge_time` after this instant may enter the packet | ISO 8601 datetime with timezone |
| **Forecast horizon** | Interval between cutoff and expected resolution | e.g. 14 days |
| **Prediction question** | A single, unambiguous, resolvable question | "Will X remain leader of Y on date Z?" |
| **Outcome classes** | Exhaustive, mutually exclusive set of possible answers | typically binary: `positive` / `negative`; multi-class allowed if defined up front |
| **Positive outcome definition** | Exact, objectively checkable criteria for the positive class | who, what, by when, verified how |
| **Negative outcome definition** | Exact criteria for the negative class, including edge cases (resignation vs. defeat, postponement) | — |
| **Data window** | Earliest date from which evidence may be drawn, through the cutoff | e.g. cutoff minus 24 months |
| **Allowed sources** | Source types admitted for this case (must be a subset of `SOURCE_RULES.md` allowed list) | — |
| **Excluded sources** | Case-specific exclusions beyond the global rules | — |
| **Known limitations** | Anything the researcher already knows will weaken the case: hindsight familiarity, sparse contemporaneous coverage, ambiguous resolution criteria | — |

## Procedure

1. **Define** — fill in every field above in `case_config.json` and `CASE_TEMPLATE.md`. Freeze.
2. **Collect** — gather evidence within the data window, obeying `SOURCE_RULES.md`. Log every source (kept or excluded) in `data_manifest.csv`.
3. **Screen** — run `LEAKAGE_CHECKLIST.md` on the full packet. Record the result.
4. **Forecast** — produce the forecast from the evidence packet only. Write it to `forecast_output.json` and lock it (no edits after this point).
5. **Reveal** — only after the forecast is locked, record the real outcome in `actual_outcome.json`.
6. **Evaluate** — score the forecast in `evaluation.json` and write up the run in `lab_notes.md`.

## Integrity rules

- The forecast is **locked before** the actual outcome file is populated. Lock order is not reversible.
- One case = one directory under `cases/`, copied from `cases/_template_case/`.
- Any protocol deviation is recorded in lab notes, not silently corrected.
