// =============================================================================
// relationships.ts — relationship graph endpoints
// =============================================================================
import { RelationshipService, validators } from '../domain/ontology/index.js';
import { type Route, ok, created, badRequest, notFound, noContent, intParam } from './http.js';

export const relationshipRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/relationships',
    handler: async (req) => {
      const parsed = validators.createRelationshipSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid relationship', parsed.error.flatten());
      return created(await RelationshipService.createRelationship(parsed.data, req.actor));
    },
  },
  {
    method: 'GET',
    path: '/api/relationships/stale',
    handler: async (req) =>
      ok(
        await RelationshipService.getStaleRelationships({
          staleDays: req.query.staleDays ? intParam(req.query.staleDays, 90) : undefined,
          minStrength: req.query.minStrength ? intParam(req.query.minStrength, 4) : undefined,
        }),
      ),
  },
  {
    method: 'GET',
    path: '/api/relationships/gaps',
    handler: async (req) =>
      ok(
        await RelationshipService.getRelationshipGaps({
          constituencyEntityId: req.query.constituencyId,
          candidateEntityId: req.query.candidateId,
        }),
      ),
  },
  {
    method: 'GET',
    path: '/api/relationships/:id',
    handler: async (req) => {
      const rel = await RelationshipService.getRelationship(req.params.id);
      return rel ? ok(rel) : notFound();
    },
  },
  {
    method: 'PATCH',
    path: '/api/relationships/:id',
    handler: async (req) => {
      const parsed = validators.updateRelationshipSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid update', parsed.error.flatten());
      return ok(await RelationshipService.updateRelationship(req.params.id, parsed.data, req.actor));
    },
  },
  {
    method: 'DELETE',
    path: '/api/relationships/:id',
    handler: async (req) => {
      await RelationshipService.archiveRelationship(req.params.id, req.actor);
      return noContent();
    },
  },
  {
    method: 'POST',
    path: '/api/relationships/:id/evidence',
    handler: async (req) => {
      const body = req.body as { evidenceId?: string; evidenceRole?: string };
      if (!body?.evidenceId) return badRequest('evidenceId is required');
      return ok(
        await RelationshipService.attachEvidence(
          req.params.id,
          body.evidenceId,
          body.evidenceRole as never,
          req.actor,
        ),
      );
    },
  },
  // entity-scoped relationship reads
  {
    method: 'GET',
    path: '/api/entities/:id/relationships',
    handler: async (req) =>
      ok(
        await RelationshipService.getRelationshipsForEntity(req.params.id, {
          type: req.query.type as never,
          attitude: req.query.attitude as never,
          confidence: req.query.confidence as never,
          direction: (req.query.direction as 'in' | 'out' | 'any') ?? undefined,
          isCurrent: req.query.currentOnly === 'true' ? true : undefined,
        }),
      ),
  },
  {
    method: 'GET',
    path: '/api/entities/:id/graph',
    handler: async (req) =>
      ok(await RelationshipService.getRelationshipGraph(req.params.id, intParam(req.query.depth, 1))),
  },
];
