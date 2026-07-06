// =============================================================================
// temporal.ts — temporal graph REST endpoints (brief §15), framework-agnostic
// -----------------------------------------------------------------------------
// One file holding the temporal Route[] groups; aggregated as temporalApiRoutes.
// Mirrors the ontology API style (ApiRequest in, ApiResult out, zod at the edge).
// =============================================================================
import {
  TemporalEventService,
  ObservationService,
  ChangeService,
  SnapshotService,
  CommitmentService,
  TimelineService,
  TrendService,
  TemporalQueryService,
  RelationshipTemporalService,
  CandidateTemporalService,
  ConstituencyTemporalService,
  FPTPTemporalService,
  PolicyTemporalService,
  FactionTemporalService,
  WarRoomTemporalService,
  temporalValidators,
} from '../../domain/temporal/index.js';
import { ObservationType, SnapshotType } from '../../domain/temporal/enums.js';
import { type Route, ok, created, badRequest, notFound, intParam } from '../http.js';

const date = (v: string | undefined, fallback?: Date): Date => {
  if (v == null) return fallback ?? new Date();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? (fallback ?? new Date()) : d;
};
const sinceDays = (v: string | undefined, d = 7) => date(undefined, new Date(Date.now() - intParam(v, d) * 86400000));
const limit = (req: { query: Record<string, string | undefined> }) => intParam(req.query.limit, 100);

// ---- Timeline ---------------------------------------------------------------
export const timelineRoutes: Route[] = [
  { method: 'GET', path: '/api/temporal/entities/:entityId/timeline', handler: async (req) => ok(await TimelineService.getTimelineForEntity(req.params.entityId, { startDate: req.query.since ? date(req.query.since) : undefined, limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/candidates/:candidateId/timeline', handler: async (req) => ok(await CandidateTemporalService.getCandidateTimeline(req.params.candidateId, { limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/constituencies/:constituencyId/timeline', handler: async (req) => ok(await ConstituencyTemporalService.getConstituencyTimeline(req.params.constituencyId, { limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/relationships/:relationshipId/timeline', handler: async (req) => ok(await RelationshipTemporalService.getRelationshipTimeline(req.params.relationshipId)) },
  { method: 'GET', path: '/api/temporal/issues/:issueId/timeline', handler: async (req) => ok(await TimelineService.getTimelineForIssue(req.params.issueId, { limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/factions/:factionId/timeline', handler: async (req) => ok(await FactionTemporalService.getFactionTimeline(req.params.factionId, { limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/policies/:policyId/timeline', handler: async (req) => ok(await PolicyTemporalService.getPolicyTimeline(req.params.policyId, { limit: limit(req) })) },
];

// ---- Changes ----------------------------------------------------------------
export const changeRoutes: Route[] = [
  { method: 'GET', path: '/api/temporal/changes', handler: async (req) => ok(await ChangeService.getChangesSince(sinceDays(req.query.sinceDays, 30), { limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/entities/:entityId/changes', handler: async (req) => ok(await ChangeService.getChangesForEntity(req.params.entityId, { limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/changes/significant', handler: async (req) => ok(await ChangeService.getSignificantChanges({ limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/changes/since', handler: async (req) => ok(await ChangeService.getChangesSince(date(req.query.date), { limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/changes/:changeId/explain', handler: async (req) => { const r = await ChangeService.explainChange(req.params.changeId); return r ? ok(r) : notFound('Change not found'); } },
];

// ---- Snapshots --------------------------------------------------------------
export const snapshotRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/temporal/snapshots',
    handler: async (req) => {
      const parsed = temporalValidators.createSnapshotSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid snapshot', parsed.error.flatten());
      return created(await SnapshotService.createEntitySnapshot(parsed.data, req.actor));
    },
  },
  { method: 'GET', path: '/api/temporal/snapshots/:snapshotId', handler: async (req) => { const s = await SnapshotService.getSnapshot(req.params.snapshotId); return s ? ok(s) : notFound('Snapshot not found'); } },
  { method: 'GET', path: '/api/temporal/entities/:entityId/snapshots', handler: async (req) => ok(await SnapshotService.getSnapshotsForEntity(req.params.entityId, { limit: limit(req) })) },
  {
    method: 'POST',
    path: '/api/temporal/snapshots/compare',
    handler: async (req) => {
      const body = (req.body ?? {}) as { snapshotIdA?: string; snapshotIdB?: string };
      if (!body.snapshotIdA || !body.snapshotIdB) return badRequest('snapshotIdA and snapshotIdB are required');
      return ok(await SnapshotService.compareSnapshots(body.snapshotIdA, body.snapshotIdB));
    },
  },
];

// ---- Observations + trends --------------------------------------------------
export const observationRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/temporal/observations',
    handler: async (req) => {
      const parsed = temporalValidators.recordObservationSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid observation', parsed.error.flatten());
      return created(await ObservationService.recordObservation(parsed.data, req.actor));
    },
  },
  { method: 'GET', path: '/api/temporal/entities/:entityId/observations', handler: async (req) => ok(await ObservationService.getObservationsForEntity(req.params.entityId, req.query.type as ObservationType | undefined, { limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/entities/:entityId/trends', handler: async (req) => ok(await TrendService.calculateTrend(req.params.entityId, (req.query.type as ObservationType) ?? ObservationType.CANDIDATE_READINESS)) },
  { method: 'GET', path: '/api/temporal/candidates/:candidateId/trends', handler: async (req) => ok(await CandidateTemporalService.getCandidateReadinessTrend(req.params.candidateId)) },
  { method: 'GET', path: '/api/temporal/relationships/:relationshipId/trends', handler: async (req) => ok(await TrendService.calculateTrend(req.params.relationshipId, ObservationType.RELATIONSHIP_STRENGTH)) },
  { method: 'GET', path: '/api/temporal/constituencies/:constituencyId/trends', handler: async (req) => ok(await ConstituencyTemporalService.getConstituencyCompetitivenessTrend(req.params.constituencyId)) },
  { method: 'GET', path: '/api/temporal/factions/:factionId/trends', handler: async (req) => ok(await FactionTemporalService.getFactionRiskTrend(req.params.factionId)) },
  { method: 'GET', path: '/api/temporal/policies/:policyId/trends', handler: async (req) => ok(await PolicyTemporalService.getPolicyLaunchReadinessTrend(req.params.policyId)) },
];

// ---- As-of ------------------------------------------------------------------
export const asOfRoutes: Route[] = [
  { method: 'GET', path: '/api/temporal/entities/:entityId/as-of', handler: async (req) => ok(await TemporalQueryService.getEntityAsOf(req.params.entityId, date(req.query.date))) },
  { method: 'GET', path: '/api/temporal/relationships/:relationshipId/as-of', handler: async (req) => ok(await TemporalQueryService.getRelationshipAsOf(req.params.relationshipId, date(req.query.date))) },
  { method: 'GET', path: '/api/temporal/candidates/:candidateId/context-as-of', handler: async (req) => { if (!req.query.constituencyId) return badRequest('constituencyId is required'); return ok(await TemporalQueryService.getCandidateContextAsOf(req.params.candidateId, req.query.constituencyId, date(req.query.date))); } },
  { method: 'GET', path: '/api/temporal/constituencies/:constituencyId/context-as-of', handler: async (req) => ok(await TemporalQueryService.getConstituencyContextAsOf(req.params.constituencyId, date(req.query.date))) },
  { method: 'GET', path: '/api/temporal/fptp/context-as-of', handler: async (req) => { if (!req.query.constituencyId) return badRequest('constituencyId is required'); return ok(await TemporalQueryService.getFPTPContextAsOf(req.query.constituencyId, req.query.candidateId, date(req.query.date))); } },
  { method: 'GET', path: '/api/temporal/policies/:policyId/radius-as-of', handler: async (req) => ok(await TemporalQueryService.getPolicyContextAsOf(req.params.policyId, date(req.query.date))) },
];

// ---- Commitments ------------------------------------------------------------
export const commitmentRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/temporal/commitments',
    handler: async (req) => {
      const parsed = temporalValidators.createCommitmentSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid commitment', parsed.error.flatten());
      return created(await CommitmentService.createCommitment(parsed.data, req.actor));
    },
  },
  { method: 'GET', path: '/api/temporal/commitments/overdue', handler: async (req) => ok(await CommitmentService.getOverdueCommitments({ limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/commitments/:commitmentId', handler: async (req) => { const c = await CommitmentService.getCommitment(req.params.commitmentId); return c ? ok(c) : notFound('Commitment not found'); } },
  {
    method: 'PATCH',
    path: '/api/temporal/commitments/:commitmentId',
    handler: async (req) => {
      const parsed = temporalValidators.updateCommitmentSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid update', parsed.error.flatten());
      return ok(await CommitmentService.updateCommitment(req.params.commitmentId, parsed.data, req.actor));
    },
  },
  { method: 'POST', path: '/api/temporal/commitments/:commitmentId/complete', handler: async (req) => ok(await CommitmentService.completeCommitment(req.params.commitmentId, req.actor)) },
  { method: 'GET', path: '/api/temporal/entities/:entityId/commitments', handler: async (req) => ok(await CommitmentService.getCommitmentsForEntity(req.params.entityId)) },
];

// ---- War-room ---------------------------------------------------------------
export const warRoomTemporalRoutes: Route[] = [
  { method: 'GET', path: '/api/temporal/war-room/recent-changes', handler: async (req) => ok(await WarRoomTemporalService.getRecentChangesSummary({ sinceDate: sinceDays(req.query.sinceDays), limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/war-room/worsening-risks', handler: async (req) => ok(await WarRoomTemporalService.getTopWorseningRisks({ limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/war-room/stale-relationships', handler: async () => ok(await WarRoomTemporalService.getStaleHighValueRelationships()) },
  { method: 'GET', path: '/api/temporal/war-room/overdue-commitments', handler: async (req) => ok(await WarRoomTemporalService.getOverdueCommitments({ limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/war-room/stale-fptp-scenarios', handler: async (req) => ok(await WarRoomTemporalService.getStaleFPTPScenarios({ limit: limit(req) })) },
  { method: 'GET', path: '/api/temporal/war-room/briefing', handler: async (req) => ok(await WarRoomTemporalService.getWarRoomBriefing({ sinceDate: sinceDays(req.query.sinceDays) })) },
];

export const temporalApiRoutes: Route[] = [
  ...timelineRoutes,
  ...changeRoutes,
  ...snapshotRoutes,
  ...observationRoutes,
  ...asOfRoutes,
  ...commitmentRoutes,
  ...warRoomTemporalRoutes,
];
