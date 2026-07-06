# Arcet Candidate Intelligence (MVP)

Structured, explainable evaluation, comparison, development and monitoring of political candidates. It sits **on top of** `@arcet/ontology` and the temporal graph — it does not duplicate the candidate/person/constituency/faction/relationship/risk/action models. It consumes them and writes back `CandidateSeatAssessment`, `Score`, `Risk`, `TemporalObservation`/`TemporalChange`/`EntitySnapshot`, `ActionRecommendation`, and `AuditLog`.

## Core idea

A candidate is not "good" or "bad" in the abstract — they are suitable or unsuitable for a *specific* constituency, party, factional, policy and media context. So every assessment is contextual, evidence-backed, confidence-rated, timestamped, and explainable. No black-box ranking (brief §0/§25): the scoring is transparent weighted dimensions with a configurable weight model.

## What was built

* **9 new models** (soft-pointer convention; formal relations only for parent→child): `CandidateScoreWeightConfig`, `CandidateAssessmentRun` (+`CandidateAssessmentDimension`), `CandidateVulnerability`, `CandidateDevelopmentPlan` (+`CandidateDevelopmentAction`), `CandidateComparisonRun` (+`CandidateComparisonEntry`), `CandidateSelectionDecision`. Plus 9 new enums. The shared `CandidateSeatAssessment` is reused as the bridge to candidate selection and FPTP.
* **Pure scoring engine** (`rules.ts`): ten deterministic dimension scorers (political experience, local connection, stakeholder coverage, local association support, faction acceptability, issue credibility, media readiness, campaign capacity, risk profile, development potential), each returning a 0–100 score with explicit positive/negative drivers; a configurable **weighted blend** with the brief's default weights (local connection 18, stakeholder/local-assoc 14, …, **risk −12**) where risk is applied as a discount and development potential cannot mask serious risk; a **confidence** model (evidence count/freshness/missing fields/conflicts); **recommendation labels** (STRONG_FIT … DO_NOT_SELECT/NEEDS_MORE_DATA); **comparison ranking + superlatives**; **material-change thresholds** (overall ±10, risk ±10, local-assoc ±15, faction ±15, label change, viability crossing); and **action triggers**.
* **10 services** (`§10`): orchestration (`CandidateIntelligenceService.runCandidateSeatAssessment` is the spine), scoring, comparison, risk/vulnerability, development, relationship, temporal, FPTP-compatibility, policy-exposure, explanation — plus a `CandidateIntelligence` façade.
* **35 REST endpoints** under `/api/candidate-intelligence/*`, spread into the shared router.
* **Seed** demonstrating the four storylines, and **tests** (24 scoring + 7 validators runnable; a DB-gated integration suite).

## The assessment spine

`runCandidateSeatAssessment(candidate, constituency)` → derive signals from the ontology profile + relationships + faction links + open risks → score ten dimensions → blend (risk-discounted) → confidence → recommendation → persist: `CandidateAssessmentRun` (+dimensions), generic `Score` rows, the `CandidateSeatAssessment` bridge, a `TemporalObservation` (CANDIDATE_SEAT_FIT), an `EntitySnapshot` (linked back as `snapshotId`), material `TemporalChange`s versus the previous run, and `ActionRecommendation`s. Comparison runs the spine per candidate, ranks, computes superlatives, and records a `CandidateComparisonRun`. A `CandidateSelectionDecision` records the **human** decision separately — the model recommends, it does not select.

## Compliance & non-goals

Every output carries source/confidence/timestamp and is audited. The module never autonomously publishes, contacts stakeholders, or makes final selection or legal/compliance determinations — it recommends and flags for human approval (brief §19, §25). No voter-level modelling, no protected-characteristic ranking, no black-box selection.

## Build & test

```bash
npm run typecheck:isolated   # pure layers + tests (enums/types/validators/rules)
npm run test:unit            # 106 unit tests across ontology + temporal + candidate-intelligence
npm run prisma:generate && npm run prisma:migrate   # in your environment
npm run ci:seed              # candidate-intelligence storylines (needs DB)
DATABASE_URL=… npx vitest run tests/candidate-intelligence-integration.test.ts
```

### Verified in this sandbox vs your environment

The build environment blocks the Prisma engine download, so `prisma generate/validate/migrate` and typechecking files that import the generated client cannot run here. **Verified in-sandbox:** the pure layer (`enums.ts`, `types.ts`, `validators.ts`, `rules.ts`) typechecks clean, and the scoring rules + validators pass full unit tests (24 + 7; 106 total with the ontology and temporal suites). **Needs your environment:** the service layer (imports the generated client via the ontology `db`), the seed, the REST wiring, and the DB-gated integration test — all written to the same conventions as the working ontology/temporal services and ready to run after `prisma generate` + `migrate`.

UI (§14) is not built; the data model, scoring rules, services and 35 endpoints are the MVP value and map directly onto the described pages.
