// =============================================================================
// entities.ts — entity + typed-profile endpoints
// =============================================================================
import { EntityService, validators } from '../domain/ontology/index.js';
import { type Route, ok, created, badRequest, notFound, noContent } from './http.js';

export const entityRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/entities',
    handler: async (req) => {
      const parsed = validators.createEntitySchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid entity', parsed.error.flatten());
      const entity = await EntityService.createEntity(parsed.data, req.actor);
      return created(entity);
    },
  },
  {
    method: 'GET',
    path: '/api/entities/search',
    handler: async (req) => {
      const filters = validators.entitySearchSchema.safeParse({
        type: req.query.type,
        status: req.query.status,
        visibility: req.query.visibility,
        query: req.query.query,
      });
      if (!filters.success) return badRequest('Invalid filters', filters.error.flatten());
      return ok(await EntityService.searchEntities(filters.data));
    },
  },
  {
    method: 'GET',
    path: '/api/entities/:id',
    handler: async (req) => {
      const entity = await EntityService.getEntitySummary(req.params.id);
      return entity ? ok(entity) : notFound();
    },
  },
  {
    method: 'PATCH',
    path: '/api/entities/:id',
    handler: async (req) => {
      const parsed = validators.updateEntitySchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid update', parsed.error.flatten());
      return ok(await EntityService.updateEntity(req.params.id, parsed.data, req.actor));
    },
  },
  {
    method: 'DELETE',
    path: '/api/entities/:id',
    handler: async (req) => {
      await EntityService.archiveEntity(req.params.id, req.actor);
      return noContent();
    },
  },
  {
    method: 'POST',
    path: '/api/entities/:id/archive',
    handler: async (req) => ok(await EntityService.archiveEntity(req.params.id, req.actor)),
  },
  {
    method: 'POST',
    path: '/api/entities/merge',
    handler: async (req) => {
      const body = req.body as { primaryId?: string; duplicateId?: string };
      if (!body?.primaryId || !body?.duplicateId)
        return badRequest('primaryId and duplicateId are required');
      return ok(await EntityService.mergeEntities(body.primaryId, body.duplicateId, req.actor));
    },
  },
  // cross-cutting reads used by the entity page
  {
    method: 'GET',
    path: '/api/entities/:id/timeline',
    handler: async (req) => ok(await EntityService.getEntityTimeline(req.params.id)),
  },
  {
    method: 'GET',
    path: '/api/entities/:id/evidence',
    handler: async (req) => ok(await EntityService.getEntityEvidence(req.params.id)),
  },
];
