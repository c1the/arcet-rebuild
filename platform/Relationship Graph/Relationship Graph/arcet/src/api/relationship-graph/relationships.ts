// =============================================================================
// relationships.ts — relationship-graph REST endpoints (§15)
// -----------------------------------------------------------------------------
// Framework-agnostic Route[] groups aggregated as relationshipGraphApiRoutes.
// CRUD reuses the ontology relationship validators; graph/score/gap/path/
// explanation endpoints use the relationship-graph services.
// =============================================================================
import {
  RelationshipGraphService,
  RelationshipCrudService,
  RelationshipScoringService,
  RelationshipGapService,
  AccessPathService,
  RelationshipActionService,
  RelationshipExplanationService,
  RelationshipCompatibilityService,
  RelationshipTemporalService,
  relationshipGraphValidators as v,
} from '../../domain/relationship-graph/index.js';
import { validators as ontologyValidators } from '../../domain/ontology/index.js';
import { type Route, ok, created, noContent, badRequest, notFound, intParam, boolParam } from '../http.js';

const opts = (req: { query: Record<string, string | undefined> }) => ({ depth: intParam(req.query.depth, 1), staleOnly: boolParam(req.query.staleOnly), highRiskOnly: boolParam(req.query.highRiskOnly), maxNodes: req.query.maxNodes ? intParam(req.query.maxNodes, 100) : undefined, maxEdges: req.query.maxEdges ? intParam(req.query.maxEdges, 200) : undefined });

// ---- CRUD -------------------------------------------------------------------
export const crudRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/relationship-graph',
    handler: async (req) => {
      const parsed = ontologyValidators.createRelationshipSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid relationship', parsed.error.flatten());
      return created(await RelationshipCrudService.createRelationship(parsed.data as never, req.actor));
    },
  },
  { method: 'GET', path: '/api/relationship-graph/:relationshipId', handler: async (req) => { const r = await RelationshipGraphService.getRelationshipSummary(req.params.relationshipId); return r ? ok(r) : notFound('Relationship not found'); } },
  {
    method: 'PATCH',
    path: '/api/relationship-graph/:relationshipId',
    handler: async (req) => {
      const parsed = ontologyValidators.updateRelationshipSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid update', parsed.error.flatten());
      return ok(await RelationshipCrudService.updateRelationship(req.params.relationshipId, parsed.data as never, req.actor));
    },
  },
  { method: 'POST', path: '/api/relationship-graph/:relationshipId/archive', handler: async (req) => ok(await RelationshipCrudService.archiveRelationship(req.params.relationshipId, req.actor)) },
  {
    method: 'POST',
    path: '/api/relationship-graph/:relationshipId/confirm',
    handler: async (req) => {
      const parsed = v.confirmRelationshipSchema.safeParse(req.body ?? {});
      if (!parsed.success) return badRequest('Invalid confirm', parsed.error.flatten());
      return ok(await RelationshipCrudService.confirmRelationship(req.params.relationshipId, parsed.data.evidenceId, req.actor));
    },
  },
  {
    method: 'POST',
    path: '/api/relationship-graph/merge',
    handler: async (req) => {
      const parsed = v.mergeRelationshipsSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid merge', parsed.error.flatten());
      return ok(await RelationshipCrudService.mergeDuplicateRelationships(parsed.data.primaryRelationshipId, parsed.data.duplicateRelationshipId, req.actor));
    },
  },
];

// ---- Entity graph -----------------------------------------------------------
export const entityGraphRoutes: Route[] = [
  { method: 'GET', path: '/api/relationship-graph/entities/:entityId/graph', handler: async (req) => ok(await RelationshipGraphService.getGraphForEntity(req.params.entityId, opts(req))) },
  { method: 'GET', path: '/api/relationship-graph/entities/:entityId/neighbourhood', handler: async (req) => ok(await RelationshipGraphService.getRelationshipNeighbourhood(req.params.entityId, intParam(req.query.depth, 1), opts(req))) },
  { method: 'GET', path: '/api/relationship-graph/entities/:entityId/timeline', handler: async (req) => ok(await RelationshipTemporalService.getRelationshipTimeline(req.params.entityId)) },
  { method: 'GET', path: '/api/relationship-graph/entities/:entityId/gaps', handler: async (req) => ok(await RelationshipGapService.getOpenRelationshipGaps({ contextEntityId: req.params.entityId })) },
  { method: 'GET', path: '/api/relationship-graph/entities/:entityId/actions', handler: async (req) => ok(await RelationshipActionService.generateRelationshipActions(req.params.entityId, {}, req.actor)) },
];

// ---- Candidate / constituency context --------------------------------------
export const contextRoutes: Route[] = [
  { method: 'GET', path: '/api/relationship-graph/candidates/:candidateId/graph', handler: async (req) => ok(await RelationshipGraphService.getGraphForCandidate(req.params.candidateId, opts(req))) },
  { method: 'GET', path: '/api/relationship-graph/candidates/:candidateId/stakeholder-coverage', handler: async (req) => ok(await RelationshipCompatibilityService.getCandidateRelationshipAggregate(req.params.candidateId, req.query.constituencyId)) },
  { method: 'GET', path: '/api/relationship-graph/candidates/:candidateId/gaps', handler: async (req) => { if (!req.query.constituencyId) return badRequest('constituencyId is required'); return ok(await RelationshipGapService.detectCandidateRelationshipGaps(req.params.candidateId, req.query.constituencyId, false)); } },
  { method: 'GET', path: '/api/relationship-graph/candidates/:candidateId/fptp-inputs', handler: async (req) => { if (!req.query.constituencyId) return badRequest('constituencyId is required'); return ok(await RelationshipCompatibilityService.getRelationshipInputsForFPTP(req.query.constituencyId, req.params.candidateId)); } },
  { method: 'GET', path: '/api/relationship-graph/constituencies/:constituencyId/graph', handler: async (req) => ok(await RelationshipGraphService.getGraphForConstituency(req.params.constituencyId, opts(req))) },
  { method: 'GET', path: '/api/relationship-graph/constituencies/:constituencyId/gaps', handler: async (req) => ok(await RelationshipGapService.detectConstituencyRelationshipGaps(req.params.constituencyId, false)) },
];

// ---- Faction / policy context ----------------------------------------------
export const factionPolicyRoutes: Route[] = [
  { method: 'GET', path: '/api/relationship-graph/factions/:factionId/context', handler: async (req) => ok(await RelationshipCompatibilityService.getFactionRelationshipContext(req.params.factionId)) },
  { method: 'GET', path: '/api/relationship-graph/policies/:policyId/context', handler: async (req) => ok(await RelationshipGraphService.getGraphForPolicy(req.params.policyId, opts(req))) },
  { method: 'GET', path: '/api/relationship-graph/policies/:policyId/briefing-list', handler: async (req) => ok(await RelationshipCompatibilityService.getRelationshipInputsForPolicyRadius(req.params.policyId)) },
];

// ---- Access paths -----------------------------------------------------------
export const pathRoutes: Route[] = [
  { method: 'GET', path: '/api/relationship-graph/access-paths', handler: async (req) => { if (!req.query.sourceEntityId || !req.query.targetEntityId) return badRequest('sourceEntityId and targetEntityId are required'); return ok(await AccessPathService.findAccessPaths(req.query.sourceEntityId, req.query.targetEntityId, { maxDepth: intParam(req.query.maxDepth, 4), allowRestricted: boolParam(req.query.allowRestricted) })); } },
  {
    method: 'POST',
    path: '/api/relationship-graph/access-paths/save',
    handler: async (req) => {
      const parsed = v.savePathSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid path', parsed.error.flatten());
      return created(await AccessPathService.saveAccessPath(parsed.data, req.actor));
    },
  },
  { method: 'GET', path: '/api/relationship-graph/access-paths/:pathId/explain', handler: async (req) => { const r = await RelationshipExplanationService.explainAccessPath(req.params.pathId); return r ? ok(r) : notFound('Path not found'); } },
];

// ---- Gaps + decay -----------------------------------------------------------
export const gapDecayRoutes: Route[] = [
  { method: 'GET', path: '/api/relationship-graph/gaps', handler: async (req) => ok(await RelationshipGapService.getOpenRelationshipGaps({ limit: intParam(req.query.limit, 100) })) },
  { method: 'POST', path: '/api/relationship-graph/gaps/:gapId/resolve', handler: async (req) => ok(await RelationshipGapService.resolveRelationshipGap(req.params.gapId, ((req.body as { resolution?: string })?.resolution) ?? 'resolved', req.actor)) },
  { method: 'GET', path: '/api/relationship-graph/stale', handler: async () => ok(await RelationshipTemporalService.getStaleHighValueRelationships({})) },
  { method: 'GET', path: '/api/relationship-graph/high-risk', handler: async (req) => ok(await RelationshipGraphService.getHighRiskRelationships({ limit: intParam(req.query.limit, 50) })) },
  { method: 'GET', path: '/api/relationship-graph/unmanaged-hostile', handler: async () => ok(await RelationshipTemporalService.getUnmanagedHostileRelationships({})) },
];

// ---- Notes / tags / scoring / explain --------------------------------------
export const noteTagRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/relationship-graph/:relationshipId/notes',
    handler: async (req) => {
      const parsed = v.addNoteSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid note', parsed.error.flatten());
      return created(await RelationshipCrudService.addRelationshipNote(req.params.relationshipId, parsed.data, req.actor));
    },
  },
  { method: 'GET', path: '/api/relationship-graph/:relationshipId/notes', handler: async (req) => ok(await RelationshipCrudService.getRelationshipNotes(req.params.relationshipId)) },
  {
    method: 'POST',
    path: '/api/relationship-graph/:relationshipId/tags',
    handler: async (req) => {
      const parsed = v.addTagSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid tag', parsed.error.flatten());
      return created(await RelationshipCrudService.addRelationshipTag(req.params.relationshipId, parsed.data.tag, req.actor));
    },
  },
  { method: 'DELETE', path: '/api/relationship-graph/:relationshipId/tags/:tag', handler: async (req) => ok(await RelationshipCrudService.removeRelationshipTag(req.params.relationshipId, req.params.tag, req.actor)) },
  { method: 'GET', path: '/api/relationship-graph/:relationshipId/explain', handler: async (req) => { const r = await RelationshipExplanationService.explainRelationship(req.params.relationshipId); return r ? ok(r) : notFound('Relationship not found'); } },
  { method: 'GET', path: '/api/relationship-graph/:relationshipId/explain-score', handler: async (req) => ok(await RelationshipExplanationService.explainRelationshipScore(req.params.relationshipId, req.query.scoreType ?? 'RELATIONSHIP_STRENGTH')) },
  { method: 'POST', path: '/api/relationship-graph/:relationshipId/recalculate', handler: async (req) => ok(await RelationshipScoringService.recalculateRelationshipScores(req.params.relationshipId, {}, req.actor)) },
];

export const relationshipGraphApiRoutes: Route[] = [
  ...crudRoutes,
  ...entityGraphRoutes,
  ...contextRoutes,
  ...factionPolicyRoutes,
  ...pathRoutes,
  ...gapDecayRoutes,
  ...noteTagRoutes,
];
