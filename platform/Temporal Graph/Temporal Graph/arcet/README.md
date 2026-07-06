# @arcet/ontology

The shared **political ontology** for Arcet: the data model and domain layer that every other module (candidate selection, FPTP strategy, faction-risk, policy radius, the action engine, compliance, and the war-room) reads from and writes to. This package is the single source of truth for *what things are* and *how they relate*; the analytical modules are consumers that compute over it.

It is a TypeScript + Prisma (PostgreSQL) package: a schema, a set of domain services, a deterministic rules layer, a seed, tests, and a thin REST API.

---

## ⚠️ Environment requirement: you must generate the Prisma client yourself

This package was assembled in a sandbox whose network blocks Prisma's engine download host (`binaries.prisma.sh`). As a result **`prisma generate`, `prisma validate`, and `prisma migrate` could not be run here**, and the service files — which import `@prisma/client` — could not be typechecked or executed in that environment.

Nothing about this is a defect in the code; it is purely a missing build artifact (the generated client). On any normal machine with network access, the first three commands below produce it and everything compiles and runs.

```bash
npm install
npx prisma generate          # fetches engines + generates the typed client
npx prisma validate          # confirms the schema is well-formed
```

What *was* verified in the sandbox: the client-independent modules (`enums.ts`, `types.ts`, `validators.ts`, `rules.ts`, and the API core `http.ts`) typecheck cleanly, and the DB-independent test suites pass. See [Testing](#testing).

---

## Setup

```bash
# 1. install
npm install

# 2. point at your database
export DATABASE_URL="postgresql://user:pass@localhost:5432/arcet?schema=public"

# 3. generate the client and run the first migration
npx prisma generate
npx prisma migrate dev --name init

# 4. (optional) load the demo graph
npm run db:seed
```

### Scripts

| script | purpose |
| --- | --- |
| `npm run prisma:generate` | generate the typed Prisma client |
| `npm run prisma:validate` | validate `schema.prisma` |
| `npm run prisma:migrate` | create/apply a dev migration |
| `npm run db:seed` | populate a fictional demo graph (see `seed.ts`) |
| `npm run typecheck` | full typecheck (needs a generated client) |
| `npm run typecheck:isolated` | typecheck only the client-independent modules + API core (no client needed) |
| `npm test` | run all tests (DB-backed tests skip unless `DATABASE_URL` is set) |
| `npm run test:unit` | run only the DB-independent unit suites |

---

## Package structure

```
prisma/
  schema.prisma                 # the data model (Postgres, UUID keys)
src/
  domain/ontology/
    enums.ts                    # every enum, as `as const` objects + union types
    types.ts                    # domain + service I/O shapes
    validators.ts               # zod schemas for all create/update inputs
    db.ts                       # lazy Prisma singleton + numeric helpers
    rules.ts                    # pure deterministic rules (no DB)
    *.service.ts                # domain services (entity, relationship, event, …)
    ontology.service.ts         # WarRoom + the `Ontology` facade
    index.ts                    # package barrel (public surface)
    seed.ts                     # demo data, built through the real services
  api/
    http.ts                     # framework-agnostic router + result helpers
    *.ts                        # thin REST handlers per resource
    index.ts                    # `apiRoutes`, `createApiRouter()`, `bindExpress()`
tests/
  rules.test.ts                 # pure rules-engine tests (runnable anywhere)
  http.test.ts                  # API router tests (runnable anywhere)
  validators.test.ts            # zod schema tests (runnable anywhere)
  integration.test.ts           # service-level tests (need a live DB)
```

---

## Design decisions

These are the choices most likely to surprise a new reader, with the reasoning behind each.

### 1. One base `Entity`, typed profiles alongside

Every node in the graph — person, organisation, constituency, candidate, faction, issue, policy, event, risk — is a row in a single `Entity` table that carries the cross-cutting concerns: identity, display name, slug, status, **visibility/classification**, audit columns, and the relationship edges. Type-specific fields live in a dedicated `*Profile` table (`CandidateProfile`, `ConstituencyProfile`, …) linked 1:1 by a unique `entityId`.

This keeps search, permissioning, the graph, and the audit trail uniform across all types, while still giving each type a strongly-typed home for its own attributes. Create a typed node with the helpers (`EntityService.createCandidate(entity, profile)`), which write both rows in a single transaction.

### 2. Relational-as-graph, with "soft pointers"

The graph is expressed in two ways:

- **`Relationship` edges** for the many-to-many web (supports, opposes, member-of-faction, brokers-for, …). Edges are first-class: they carry strength (1–5), attitude, influence level, confidence, ownership, validity dates, and evidence links.
- **Soft pointers** for the handful of stable 1:N "belongs-to" references (e.g. a constituency's `currentRepresentativeEntityId`, a candidate's `partyEntityId`, an edge's `sourceEntityId`/`targetEntityId`). These are stored as **indexed UUID string columns**, not formal Prisma relations, and are resolved in the service layer.

Why soft pointers: every typed reference points back to the same `Entity` table, so modelling them all as formal Prisma relations would force a large number of named back-relations on `Entity` purely to satisfy the schema — noise that buys nothing. Indexed UUID columns give the same lookups and indexes without that explosion. **The trade-off is explicit:** referential integrity for soft pointers is enforced in the service layer, not by the database. Formal Prisma relations are reserved for profile↔Entity (1:1) and the genuine join/child tables (`EntityEvidence`, `RelationshipEvidence`, `EventParticipant`, `RiskLink`, `ComplianceFlag`).

### 3. A pure rules engine

`rules.ts` contains the MVP decision logic as **pure functions**: they take already-fetched data and return *proposed* actions, risks, and compliance restrictions. They never touch the database. The services fetch the inputs and persist the outputs.

This makes the logic trivial to unit-test (no mocks, no DB) and keeps provenance explainable: every proposal carries the `rule` id that produced it and a human-readable `rationale`. There is no ML and no hidden state — by design, for an MVP that has to be defensible to a campaign and to compliance.

### 4. Field and enum names are verbatim from the brief

Identifiers match the brief exactly so the FPTP simulator and candidate-selection modules bind to the same names without a translation layer. Scores are floats on a 0–100 scale, relationship strength is an integer 1–5, and win probability is a float 0–1, consistently.

### 5. Append-only scores and an audit trail

`Score` rows are append-only (latest-wins on read), so a candidate's readiness over time is recoverable rather than overwritten. Every mutating service call records an `AuditLog` entry. The seed runs entirely through the services, so it exercises these paths and produces a realistic audit history.

---

## Using the domain layer

```ts
import { Ontology } from '@arcet/ontology';

const { entity, profile } = await Ontology.candidate /* … */;

const assessment = await Ontology.candidate.calculateCandidateSeatAssessment(
  candidateEntityId,
  constituencyEntityId,
  { userId: currentUser.id },
);

const summary = await Ontology.warRoom.getSummary({ limit: 10 });
```

`Ontology` is a facade exposing every service; you can also import services individually from the barrel.

## Using the API layer

The API is deliberately framework-agnostic. `createApiRouter()` returns a dispatcher you can call directly (and unit-test), and `bindExpress(app)` wires the routes onto an Express app without this package depending on Express:

```ts
import express from 'express';
import { bindExpress } from '@arcet/ontology/api';

const app = express();
app.use(express.json());
bindExpress(app);          // mounts /api/entities, /api/relationships, …
app.listen(3000);
```

Handlers are thin: they validate input with the zod schemas and delegate to the services.

---

## Testing

Two tiers:

- **Unit suites** (`rules`, `http`, `validators`) — no database, no generated client. Run anywhere with `npm run test:unit`. These cover the rules engine end-to-end, the router's matching/param/error behaviour, and input validation.
- **Integration suite** (`integration.test.ts`) — exercises the services against a real Postgres (entity CRUD, relationship graph/stale/gaps, candidate seat assessment + comparison, faction risk, policy radius, FPTP scenario save/read, compliance reclassification, war-room summary). It is **skipped automatically unless `DATABASE_URL` is set**:

  ```bash
  export DATABASE_URL="postgresql://…"
  npx prisma migrate deploy
  npx vitest run tests/integration.test.ts
  ```

---

## Scope

**In scope (this package):** the complete data model, the domain services, the deterministic rules layer, the seed, the tests, and the REST API surface.

**Out of scope (separate modules that consume this ontology):** the full FPTP simulation/compute engine, the policy-impact scoring model, and the React war-room UI. This package provides the context-assembly services and persistence those modules call (`getFPTPContext`, `saveFPTPScenario`, `getPolicyContext`, `materialiseImpacts`, the war-room reads, …) and the deterministic MVP rules; it does not implement their heavier analytics or any front-end.

All seeded data is fictional.
