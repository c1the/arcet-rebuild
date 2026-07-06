// =============================================================================
// risks.ts — risk, score, and action endpoints
// =============================================================================
import {
  RiskService,
  ScoreService,
  ActionService,
  validators,
} from '../domain/ontology/index.js';
import { type Route, ok, created, badRequest, notFound, intParam } from './http.js';

export const riskRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/risks',
    handler: async (req) =>
      ok(await RiskService.getWarRoomRisks({ limit: intParam(req.query.limit, 50) })),
  },
  {
    method: 'POST',
    path: '/api/risks',
    handler: async (req) => {
      const parsed = validators.createRiskSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid risk', parsed.error.flatten());
      return created(await RiskService.createRisk(parsed.data, req.actor));
    },
  },
  {
    method: 'PATCH',
    path: '/api/risks/:id',
    handler: async (req) => {
      const parsed = validators.updateRiskSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid update', parsed.error.flatten());
      return ok(await RiskService.updateRisk(req.params.id, parsed.data, req.actor));
    },
  },
  {
    method: 'GET',
    path: '/api/entities/:id/risks',
    handler: async (req) => ok(await RiskService.getRisksForEntity(req.params.id)),
  },
];

export const scoreRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/scores',
    handler: async (req) => {
      const parsed = validators.createScoreSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid score', parsed.error.flatten());
      return created(await ScoreService.recordScore(parsed.data, req.actor));
    },
  },
  {
    method: 'GET',
    path: '/api/entities/:id/scores',
    handler: async (req) => ok(await ScoreService.getLatestScores(req.params.id, req.query.contextId)),
  },
];

export const actionRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/actions',
    handler: async (req) =>
      ok(
        await ActionService.getWarRoomActions({
          overdueOnly: req.query.overdueOnly === 'true',
          limit: intParam(req.query.limit, 50),
        }),
      ),
  },
  {
    method: 'POST',
    path: '/api/actions',
    handler: async (req) => {
      const parsed = validators.createActionSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid action', parsed.error.flatten());
      return created(await ActionService.createRecommendation(parsed.data, req.actor));
    },
  },
  {
    method: 'PATCH',
    path: '/api/actions/:id',
    handler: async (req) => {
      const body = req.body as { status?: string; ownerUserId?: string };
      if (body?.ownerUserId) {
        return ok(await ActionService.assignAction(req.params.id, body.ownerUserId, req.actor));
      }
      if (body?.status) {
        return ok(await ActionService.updateActionStatus(req.params.id, body.status as never, req.actor));
      }
      return badRequest('status or ownerUserId is required');
    },
  },
  {
    method: 'POST',
    path: '/api/actions/:id/complete',
    handler: async (req) => {
      const body = req.body as { outcome?: string };
      return ok(await ActionService.completeAction(req.params.id, body?.outcome, req.actor));
    },
  },
  {
    method: 'GET',
    path: '/api/entities/:id/actions',
    handler: async (req) => ok(await ActionService.getActionsForEntity(req.params.id)),
  },
];
