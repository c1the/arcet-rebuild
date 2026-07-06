# Arcet Temporal Graph (MVP)

The time-aware memory layer that sits **on top of** the `@arcet/ontology` package. It does not duplicate the political data model — it makes the existing ontology objects (Entity, profiles, Relationship, PoliticalEvent, Risk, Score, CandidateSeatAssessment, FPTPScenario, PolicyImpact, ActionRecommendation, ComplianceFlag, AuditLog) time-aware.

It answers: what was true before, what changed, when it changed, when Arcet learned it, who/what was affected, what evidence supports it, and what was true at the moment a decision was made.

## Design

* **Layer, not a replacement.** All cross-references to ontology objects are **soft pointers** (indexed UUID columns resolved in the service layer), exactly the convention the ontology already uses. The only new formal relation is `TemporalEvent → TemporalEventEntity`. No new back-relations were added to `Entity`.
* **Four primitives** (brief §4): **events** (what happened, with `occurredAt` vs `recordedAt` vs `effectiveFrom/To`), **observations** (timestamped values → time series), **changes** (meaningful before/after, kept distinct from per-edit `AuditLog`), and **snapshots** (reproducible "as-of" context).
* **Deterministic, explainable rules first** (brief §17, §21). No ML in the MVP. Every proposed change/risk/action carries a `rule` id and a `rationale`. The rules live in `rules.ts` as **pure functions** and are unit-tested in isolation.
* **Reuses ontology services.** `SnapshotService` calls the candidate/FPTP/constituency/policy context services; `DecayService` and the relationship layer call `RelationshipService`/`RiskService`/`ActionService`; the war room composes the temporal services.

## New schema objects

Models: `TemporalEvent`, `TemporalEventEntity`, `TemporalObservation`, `TemporalChange` (with a `significant` flag), `EntitySnapshot`, `RelationshipTemporalState`, `Commitment`, `TimelineItem`.
Enums: `TemporalEventType`, `TemporalEntityRole`, `ObservationType`, `ChangeType`, `SnapshotType`, `CommitmentType`, `CommitmentStatus`, `Sensitivity`, `TimelineItemType` (+ a TS-only `TrendDirection`).

## Services (`src/domain/temporal/`)

`TemporalEventService`, `ObservationService`, `ChangeService`, `SnapshotService`, `CommitmentService`, `TimelineService`, `TrendService`, `DecayService`, `TemporalQueryService` (as-of reconstruction), and the context services `RelationshipTemporalService`, `CandidateTemporalService`, `ConstituencyTemporalService`, `FPTPTemporalService`, `PolicyTemporalService`, `FactionTemporalService`, `ActionTemporalService`, `ComplianceTemporalService`, `WarRoomTemporalService`. The `Temporal` façade exposes them all.

## Rules (`rules.ts`, pure)

* **Relationship decay** — 30/90/180-day bands; high-influence escalates faster; overdue commitment raises staleness; recent positive contact lowers it; **hostile ties are flagged `UNMANAGED_HOSTILE`, not ordinary decay**.
* **Trend** — direction (improving/worsening/stable/volatile), magnitude, slope, volatility; orientation-aware (rising risk = worsening).
* **Commitment urgency**, **significance thresholds**, **candidate movement**, **FPTP staleness** (material-delta + qualitative triggers), **faction escalation**, **policy-radius movement**.

## API (`src/api/temporal/temporal.ts`)

42 endpoints under `/api/temporal/*` — timeline, changes, snapshots, observations, trends, as-of, commitments, war-room — spread into the ontology's `apiRoutes` and dispatched by the same framework-agnostic router.

## Build & test

```bash
npm run typecheck:isolated   # pure layer (enums/types/validators/rules + tests)
npm run test:unit            # ontology + temporal pure unit tests (75 tests)
npm run prisma:generate && npm run prisma:migrate   # in your environment
npm run temporal:seed        # time-based demo storylines (needs DB)
DATABASE_URL=… npx vitest run tests/temporal-integration.test.ts
```

### What is verified in this sandbox vs your environment

The build environment blocks the Prisma engine download, so `prisma generate/validate/migrate` and any typecheck of files importing the generated client cannot run here. What **is** verified in-sandbox:

* the **pure layer** (`enums.ts`, `types.ts`, `validators.ts`, `rules.ts`) typechecks clean (`tsc -p tsconfig.check.json`, exit 0);
* the **temporal rules and validators** pass full unit tests (29 temporal tests; 75 total with the ontology suite);
* the **integration test** collects and cleanly skips without `DATABASE_URL`.

Needs your environment (Postgres + `prisma generate`): the service-layer files (they import the generated client via the ontology `db`), the seed, the REST wiring, and the DB-gated integration test — which is written and ready to run.

## Seed storylines (`src/domain/temporal/seed.ts`)

Demonstrates all ten acceptance storylines: candidate improving, candidate deteriorating, stale relationship, overdue commitment, faction-risk escalation, policy-radius expansion, FPTP scenario going stale, relationship repaired after action, candidate ranking change, and a war-room briefing of recent changes — all **fictional** data, modelling candidates/stakeholders/factions/seats, never individual voters.
