// =============================================================================
// fptp.ts — FPTP, policy-radius, faction, and war-room endpoints
// =============================================================================
import {
  FPTPContextService,
  PolicyRadiusContextService,
  FactionContextService,
  ActionService,
  WarRoomService,
  validators,
} from '../domain/ontology/index.js';
import { type Route, ok, created, badRequest, intParam } from './http.js';

export const fptpRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/fptp/:constituencyId/context',
    handler: async (req) =>
      ok(await FPTPContextService.getFPTPContext(req.params.constituencyId, req.query.candidateId)),
  },
  {
    method: 'GET',
    path: '/api/fptp/scenarios',
    handler: async (req) => ok(await FPTPContextService.getAllFPTPScenarios(intParam(req.query.limit, 50))),
  },
  {
    method: 'POST',
    path: '/api/fptp/scenarios',
    handler: async (req) => {
      const parsed = validators.saveFptpScenarioSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid scenario', parsed.error.flatten());
      return created(await FPTPContextService.saveFPTPScenario(parsed.data, req.actor));
    },
  },
  {
    method: 'GET',
    path: '/api/fptp/:constituencyId/scenarios',
    handler: async (req) => ok(await FPTPContextService.getFPTPScenarios(req.params.constituencyId)),
  },
];

export const policyRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/policies/:id/radius',
    handler: async (req) => ok(await PolicyRadiusContextService.getPolicyContext(req.params.id)),
  },
  {
    method: 'POST',
    path: '/api/policies/:id/impacts',
    handler: async (req) => {
      // materialise rule-derived impacts, or accept an explicit impact body
      if (req.body == null) {
        return created(await PolicyRadiusContextService.materialiseImpacts(req.params.id, req.actor));
      }
      const parsed = validators.savePolicyImpactSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid impact', parsed.error.flatten());
      return created(await PolicyRadiusContextService.savePolicyImpact(parsed.data, req.actor));
    },
  },
  {
    method: 'GET',
    path: '/api/policies/:id/actions',
    handler: async (req) => ok(await PolicyRadiusContextService.getPolicyActions(req.params.id)),
  },
];

export const factionRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/factions/:id/context',
    handler: async (req) => ok(await FactionContextService.getFactionMap(req.params.id)),
  },
  {
    method: 'GET',
    path: '/api/factions/:id/members',
    handler: async (req) => ok(await FactionContextService.getPersonsByFaction(req.params.id)),
  },
  {
    method: 'GET',
    path: '/api/factions/risk/candidate/:candidateId',
    handler: async (req) =>
      ok(
        await FactionContextService.getFactionRiskForCandidate(
          req.params.candidateId,
          req.query.constituencyId,
        ),
      ),
  },
  {
    method: 'GET',
    path: '/api/factions/risk/policy/:policyId',
    handler: async (req) => ok(await FactionContextService.getFactionRiskForPolicy(req.params.policyId)),
  },
];

export const warRoomRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/war-room/summary',
    handler: async (req) => ok(await WarRoomService.getSummary({ limit: intParam(req.query.limit, 10) })),
  },
  {
    method: 'GET',
    path: '/api/war-room/risks',
    handler: async (req) => ok(await WarRoomService.getRisks({ limit: intParam(req.query.limit, 10) })),
  },
  {
    method: 'GET',
    path: '/api/war-room/actions',
    handler: async (req) => ok(await WarRoomService.getActions({ limit: intParam(req.query.limit, 10) })),
  },
  {
    method: 'GET',
    path: '/api/war-room/recent-changes',
    handler: async (req) =>
      ok(await WarRoomService.getRecentChanges({ limit: intParam(req.query.limit, 10) })),
  },
  // rule-driven action generators (exposed for the action engine / UI buttons)
  {
    method: 'POST',
    path: '/api/entities/:id/generate-relationship-actions',
    handler: async (req) => created(await ActionService.generateRelationshipActions(req.params.id, req.actor)),
  },
];
