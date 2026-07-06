// =============================================================================
// events.ts — event + evidence endpoints (events make the graph temporal)
// =============================================================================
import { EventService, EvidenceService, validators } from '../domain/ontology/index.js';
import { type Route, ok, created, badRequest, notFound } from './http.js';

export const eventRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/events',
    handler: async (req) => {
      const parsed = validators.createEventSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid event', parsed.error.flatten());
      return created(await EventService.createEvent(parsed.data, req.actor));
    },
  },
  {
    method: 'GET',
    path: '/api/events/:id',
    handler: async (req) => {
      // events are entities; reuse the timeline-style fetch via participants
      const events = await EventService.getEventsForEntity(req.params.id);
      return ok(events);
    },
  },
  {
    method: 'POST',
    path: '/api/events/:id/participants',
    handler: async (req) => {
      const body = req.body as { entityId?: string; role?: string };
      if (!body?.entityId) return badRequest('entityId is required');
      return created(
        await EventService.addParticipant(req.params.id, body.entityId, body.role as never, req.actor),
      );
    },
  },
  {
    method: 'POST',
    path: '/api/events/:id/extract-commitments',
    handler: async (req) => ok(await EventService.extractCommitmentsFromEvent(req.params.id)),
  },
  {
    method: 'GET',
    path: '/api/entities/:id/timeline',
    handler: async (req) => ok(await EventService.getEventsForEntity(req.params.id)),
  },
];

export const evidenceRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/evidence',
    handler: async (req) => {
      const parsed = validators.createEvidenceSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid evidence', parsed.error.flatten());
      return created(await EvidenceService.createEvidence(parsed.data, req.actor));
    },
  },
  {
    method: 'GET',
    path: '/api/evidence/:id',
    handler: async (req) => {
      const ev = await EvidenceService.getEvidence(req.params.id);
      return ev ? ok(ev) : notFound();
    },
  },
  {
    method: 'POST',
    path: '/api/entities/:id/evidence',
    handler: async (req) => {
      const body = req.body as { evidenceId?: string; role?: string };
      if (!body?.evidenceId) return badRequest('evidenceId is required');
      return created(
        await EvidenceService.attachEvidenceToEntity(
          req.params.id,
          body.evidenceId,
          body.role as never,
          req.actor,
        ),
      );
    },
  },
];
