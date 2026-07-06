// =============================================================================
// candidates.ts — candidate + constituency context endpoints
// =============================================================================
import {
  CandidateContextService,
  ConstituencyContextService,
  FPTPContextService,
} from '../domain/ontology/index.js';
import { type Route, ok, badRequest } from './http.js';

export const candidateRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/candidates/:id/context',
    handler: async (req) => ok(await CandidateContextService.getCandidateProfile(req.params.id)),
  },
  {
    method: 'GET',
    path: '/api/candidates/:id/risks',
    handler: async (req) => ok(await CandidateContextService.getCandidateRisks(req.params.id)),
  },
  {
    method: 'GET',
    path: '/api/candidates/:id/actions',
    handler: async (req) =>
      ok(
        await CandidateContextService.getCandidateDevelopmentActions(
          req.params.id,
          req.query.constituencyId,
          req.actor,
        ),
      ),
  },
  {
    method: 'GET',
    path: '/api/candidates/:id/seat-assessment/:constituencyId',
    handler: async (req) =>
      ok(
        await CandidateContextService.calculateCandidateSeatAssessment(
          req.params.id,
          req.params.constituencyId,
          req.actor,
        ),
      ),
  },
  {
    method: 'POST',
    path: '/api/candidates/compare',
    handler: async (req) => {
      const body = req.body as { candidateIds?: string[]; constituencyId?: string };
      if (!body?.candidateIds?.length || !body?.constituencyId)
        return badRequest('candidateIds[] and constituencyId are required');
      return ok(
        await CandidateContextService.compareCandidatesForSeat(
          body.candidateIds,
          body.constituencyId,
          req.actor,
        ),
      );
    },
  },
];

export const constituencyRoutes: Route[] = [
  {
    method: 'GET',
    path: '/api/constituencies/:id/context',
    handler: async (req) => ok(await ConstituencyContextService.getConstituencyContext(req.params.id)),
  },
  {
    method: 'GET',
    path: '/api/constituencies/:id/candidates',
    handler: async (req) => ok(await ConstituencyContextService.getCandidates(req.params.id)),
  },
  {
    method: 'GET',
    path: '/api/constituencies/:id/stakeholders',
    handler: async (req) => ok(await ConstituencyContextService.getStakeholders(req.params.id)),
  },
  {
    method: 'GET',
    path: '/api/constituencies/:id/fptp-context',
    handler: async (req) => ok(await FPTPContextService.getFPTPContext(req.params.id)),
  },
];
