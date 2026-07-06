# Lab Notes: demo_case_001

> Fictional demo case used to exercise the Phase 1 ingestion pipeline.

## Research question

Does Phase 1 ingestion correctly admit pre-cutoff evidence and exclude
post-cutoff and retrospective sources, with reasons recorded in the report?

## Data collection log

| Date | Action | Sources found | Kept / excluded | Notes |
|------|--------|---------------|-----------------|-------|
| 2026-07-06 | Authored 3 fictional sources | 3 | 1 kept / 2 excluded | src-0002 post-cutoff; src-0003 retrospective |

## Evidence preparation

All three sources are hand-written fictional texts in `raw_sources/`.
Timestamps were assigned in the manifest to create one clean pre-cutoff
source, one cutoff violation, and one manual exclusion.

## Forecast protocol

Not applicable — no forecasting in Phase 1.

## Run notes

Run `python phase1_smoke_test.py` from `arrow/proof/`; it re-runs ingestion
on this case and asserts the expected inclusion/exclusion split.

## Limitations

Entirely fictional; exercises pipeline mechanics only, not source research.

## Observations

(filled by smoke-test runs)
