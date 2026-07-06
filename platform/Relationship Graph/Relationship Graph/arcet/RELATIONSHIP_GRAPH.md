# Arcet Relationship Graph (MVP)

Maps political power, access, trust, influence, obligations, hostility, factional alignment, constituency relevance, and recommended next actions. It is **not** a separate CRM or graph database — it sits on the shared ontology `Relationship` edge and the temporal graph, and feeds Candidate Intelligence, the FPTP simulator, faction-risk, and policy radius.

## What was built

* **Extended the existing `Relationship` model** (no duplicate edge table) with the brief's quality/maintenance/explanation/compliance fields — `trustLevel`, `accessValue`/`strategicValue`/`riskLevel`, `status`, `nextReviewAt`, `stalenessScore`, `openCommitmentCount`, `recommendedNextActionId`, `rationale`, `evidenceSummary`, `lastConfirmedAt/By`, `sourceModule`, `dataClassification`, `containsInferredData`, `requiresReview`, `restrictedReason` — all optional/defaulted and backward-compatible.
* **6 new models** (formal relations only for the children of `Relationship`): `RelationshipTag`, `RelationshipNote`, `RelationshipScore` (children); `RelationshipPath`, `RelationshipGap`, `RelationshipImportBatch` (standalone, soft-pointer references). Plus 7 new enums. Schema is now 47 models / 68 enums.
* **Pure rules engine** (`rules.ts`): nine deterministic relationship scores (strength, trust, influence, access value, strategic value, staleness, repairability, risk, briefing priority), each with explicit drivers; `deriveStatus` (hostile→`NEEDS_REPAIR`/`HOSTILE`, stale→`STALE`, etc.); **access-path scoring** (averaged edge quality discounted by length, blocked when any hop is restricted/sensitive, risk raised by hostile/inferred hops); gap severity; and the §18 action triggers (follow-up / repair / briefing / assign-owner / verify / consult-broker).
* **8 services** (§8): `RelationshipGraphService`, `RelationshipCrudService` (with tags/notes/confirm/merge), `RelationshipScoringService` (persists `RelationshipScore` + mirrors into the generic `Score` table + updates status/staleness), `RelationshipGapService`, `AccessPathService` (BFS over current edges), `RelationshipActionService` (generates actions + outcome feedback that updates the edge and resolves gaps), `RelationshipExplanationService`, and `RelationshipCompatibilityService` (candidate aggregate, FPTP inputs, faction context, policy briefing inputs). The temporal `RelationshipTemporalService` and decay layer are re-exported.
* **35 REST endpoints**, a seed covering all five storylines, and tests (20 rules + 6 validators runnable; a DB-gated integration suite).

## The relationship loop

Map → score → detect gaps/decay → recommend actions → record outcomes → update graph. A completed relationship action (`updateRelationshipFromActionOutcome`) records a temporal interaction, refreshes `lastInteractionAt`, bumps strength / worsens attitude per outcome, resolves any matching open gap, and recalculates scores — which is what lets a repaired relationship flow through to Candidate Intelligence and mark an FPTP scenario stale.

## API prefix note

The brief specifies `/api/relationships/*`, but the **ontology API already owns** `POST /api/relationships`, `/api/relationships/:id`, `/api/relationships/gaps`, `/api/relationships/stale`, and `/api/relationships/:id/evidence`. Registering duplicates would be a routing bug, so the richer graph layer is mounted under **`/api/relationship-graph/*`** (same paths otherwise). The basic relationship CRUD remains available on the ontology's `/api/relationships`.

## Compliance

Relationships, notes, and tags carry `dataClassification`; inferred edges set `containsInferredData` and are surfaced as low-confidence, not fact; restricted/sensitive edges are excluded from recommended access paths (blocked) and flagged via `getSensitiveRelationships`; every create/update/confirm/merge/tag/note writes an `AuditLog`. No black-box scoring, no voter-level graph, no autonomous outreach (brief §25).

## Build & test

```bash
npm run typecheck:isolated   # pure layers + tests
npm run test:unit            # 132 unit tests across all four modules
npm run prisma:generate && npm run prisma:migrate   # in your environment
npm run rg:seed              # relationship-graph storylines (needs DB)
DATABASE_URL=… npx vitest run tests/relationship-graph-integration.test.ts
```

### Verified in this sandbox vs your environment

The build environment blocks the Prisma engine download, so `prisma generate/validate/migrate` and typechecking files that import the generated client cannot run here. **Verified in-sandbox:** the pure layer (`enums.ts`, `types.ts`, `validators.ts`, `rules.ts`) typechecks clean and the scoring/path/gap/action rules + validators pass full unit tests (20 + 6; 132 total with the ontology, temporal, and candidate-intelligence suites). **Needs your environment:** the service layer (imports the generated client via the ontology `db`), the seed, the REST wiring, and the DB-gated integration test — all written to the same conventions as the working ontology/temporal/candidate-intelligence services and ready to run after `prisma generate` + `migrate`.

UI (§16) is not built; the data model, rules, services, and 35 endpoints are the MVP value and map directly onto the described graph/side-panel/gaps/access-path/war-room views.
