# Arrow Proof

Arrow Proof is a controlled historical event forecasting engine.

## What it does

Given a political event, the engine is provided with:

1. **An event definition** — the event, the actors involved, and the jurisdiction.
2. **A forecast cutoff date** — a hard information boundary set before the event occurred.
3. **A pre-cutoff evidence packet** — dated sources (news, speeches, votes, polls, public records) all published or knowable before the cutoff.

The engine then produces a probabilistic forecast of the outcome using only that evidence. Because the events are historical, the actual outcome is known and the forecast can be **backtested**: the prediction is locked first, then compared against what really happened.

## Why historical events

Backtesting against history gives a ground-truth outcome for every case, which lets us measure calibration and accuracy without waiting years for real-world resolution. The core risk of this design is **information leakage** — evidence that implicitly or explicitly reveals the outcome. Phase 0 exists to control that risk before any modelling begins.

## Phase 0 scope

Phase 0 defines the experimental protocol only. It contains:

| File | Purpose |
|------|---------|
| `PHASE_0_PROTOCOL.md` | The experiment protocol: what a case is, what fields define it |
| `SOURCE_RULES.md` | Which sources are allowed into an evidence packet, and which are banned |
| `LEAKAGE_CHECKLIST.md` | The checklist run on every case before a forecast is made |
| `CASE_TEMPLATE.md` | Human-readable template for defining a new case |
| `LAB_NOTES_TEMPLATE.md` | Template for paper-ready documentation of each run |
| `cases/_template_case/` | Skeleton file structure that every case directory copies |

Out of scope for Phase 0: the forecasting model, world-state systems, external API ingestion, and any UI. Those arrive in Phase 1 (ingestion) and Phase 2 (world systems).

## Phase 1 — evidence ingestion

Local-file pipeline: `data_manifest.csv` + `raw_sources/` → leakage-screened
`evidence.jsonl`, `excluded_evidence.jsonl`, and `ingestion_report.json`.
Modules: `schemas.py`, `case_store.py`, `evidence_store.py`, `validation.py`,
`ingestion.py`.

```cmd
cd arrow\proof
python phase1_smoke_test.py          rem verify the pipeline on demo_case_001
python ingestion.py cases\demo_case_001   rem ingest any case directly
```

## Phase 2 — claim extraction

Turns included evidence into structured political claims:
`evidence.jsonl` → `extracted_claims.jsonl` + `claim_extraction_report.json`.
Modules: `claim_schema.py`, `claim_store.py`, `claim_validation.py`,
`claim_extractor.py`.

The current extractor is **rule-based keyword matching** — no LLM, no network.
Every claim quotes the exact sentence it came from (`text_span`), carries both
`event_time` and `knowledge_time`, and traces to an included evidence item via
`evidence_id`. Strength and confidence are simple documented heuristics, not
calibrated probabilities. The `ClaimExtractor` interface in
`claim_extractor.py` is the seam where an LLM-backed extractor can be swapped
in later without changing the pipeline.

```cmd
cd arrow\proof
python phase2_smoke_test.py          rem verify extraction on demo_case_001
python claim_extractor.py cases\demo_case_001   rem extract any case directly
```

## Phase 3 — world-state building

Aggregates extracted claims into a point-in-time political snapshot:
`extracted_claims.jsonl` → `world_state.json` + `world_state_report.json`.
Modules: `world_state_schema.py`, `world_state_store.py`,
`world_state_validation.py`, `world_state_builder.py`.

The world state contains actor-level signals, per-claim-type signals
(`weighted_score = average_strength × average_confidence`), and six 0–1
**world-system inputs** (incentive, faction, ideology, network_contagion,
institutional, media_pressure), each taking the max weighted score of its
contributing claim types. All values are transparent heuristic aggregates of
the rule-based extraction — **not calibrated probabilities** — and every
number traces back to claim ids and quoted text spans.

```cmd
cd arrow\proof
python phase3_smoke_test.py          rem verify world-state build on demo_case_001
python world_state_builder.py cases\demo_case_001   rem build any case directly
```

## Phase 4 — world systems

Runs six theory-specific assessments over the world state:
`world_state.json` → `world_system_results.json` + `world_system_report.json`.
Modules: `world_systems/` package (`base.py` + one module per theory) and
`world_system_runner.py`.

The six systems — **incentive** (electoral cost), **faction** (organised
internal opposition), **ideology** (principled conflict),
**network_contagion** (defection diffusion), **institutional** (formal
mechanisms), **media_pressure** (public salience) — each read their
world-system input and return a score, confidence, direction
(`event_more_likely` / `event_less_likely` / `mixed` / `insufficient_signal`),
a reasoning summary, and supporting claim ids drawn only from the world state.
The institutional system treats constraints as direction-ambiguous unless
faction pressure shows the mechanism is activated. These are **partial theory
outputs for the future aggregator** — heuristic, uncalibrated, and not the
Arrow forecast.

```cmd
cd arrow\proof
python phase4_smoke_test.py          rem verify world systems on demo_case_001
python world_system_runner.py cases\demo_case_001   rem run any case directly
```

## Boundary from legacy Arrow simulator

Arrow Proof is **separate from the existing FPTP simulator**. The legacy engine (`fptp_strategy_model`, `district_adapter.py`, `blocs.py`, `server.py`, the `/chat` and `/run` endpoints, and the HoC/ONS district data) handles seat counterfactuals and is not used here in any way. Code in `proof/` must never import from those modules or call those endpoints.

Phase 0/1 **do not forecast, simulate elections, or run Monte Carlo**. Their only purpose is to create **auditable historical event case packets**: a frozen case definition, a source manifest, leakage-screened evidence (`evidence.jsonl`), logged exclusions (`excluded_evidence.jsonl`), and an ingestion report.

Future phases will add forecast aggregation and backtesting — as new code inside `proof/`, not by reusing the legacy simulator. This boundary was re-audited after Phase 4: no `proof/` module imports anything outside the Python standard library and `proof/` itself, and no simulator, Monte Carlo, FPTP, or HoC/ONS references exist anywhere in `proof/`.
