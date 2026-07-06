// =============================================================================
// temporal-event.service.ts — canonical temporal event layer (§6.1)
// -----------------------------------------------------------------------------
// Wraps/references the ontology's PoliticalEvent and records occurredAt vs
// recordedAt vs effectiveFrom/To. Bridges ontology objects (audit, actions,
// risks, scores) into the temporal event stream.
// =============================================================================
import { prisma, type Tx } from '../ontology/db.js';
import { AuditService } from '../ontology/audit.service.js';
import { Confidence, Visibility, DataClassification } from '../ontology/enums.js';
import { TemporalEntityRole, TemporalEventType } from './enums.js';
import { createTemporalEventSchema } from './validators.js';
import type { ActorContext, CreateTemporalEventInput, TemporalEventFilters, UUID } from './types.js';

export const TemporalEventService = {
  async createTemporalEvent(input: CreateTemporalEventInput, actor?: ActorContext, tx?: Tx) {
    const data = createTemporalEventSchema.parse(input);
    const client = tx ?? prisma;
    const event = await client.temporalEvent.create({
      data: {
        politicalEventId: data.politicalEventId,
        eventType: data.eventType,
        occurredAt: data.occurredAt,
        recordedAt: data.recordedAt ?? new Date(),
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
        title: data.title,
        summary: data.summary,
        sourceModule: data.sourceModule,
        createdByUserId: actor?.userId,
        confidence: data.confidence ?? Confidence.LOW,
        visibility: data.visibility ?? Visibility.CLIENT_PRIVATE,
        dataClassification: data.dataClassification ?? DataClassification.CLIENT_PRIVATE,
        metadata: (data.metadata ?? undefined) as never,
        entities: data.entities?.length
          ? { create: data.entities.map((e) => ({ entityId: e.entityId, role: e.role ?? TemporalEntityRole.PRIMARY_SUBJECT })) }
          : undefined,
      },
      include: { entities: true },
    });
    await AuditService.record(
      { action: 'temporal.event.create', objectType: 'TemporalEvent', objectId: event.id, after: event as never, actor },
      tx,
    );
    return event;
  },

  async linkEntity(eventId: UUID, entityId: UUID, role: TemporalEntityRole = TemporalEntityRole.PRIMARY_SUBJECT) {
    return prisma.temporalEventEntity.upsert({
      where: { temporalEventId_entityId_role: { temporalEventId: eventId, entityId, role } },
      create: { temporalEventId: eventId, entityId, role },
      update: {},
    });
  },

  async getEvent(eventId: UUID) {
    return prisma.temporalEvent.findUnique({ where: { id: eventId }, include: { entities: true } });
  },

  async getEventsForEntity(entityId: UUID, filters: TemporalEventFilters = {}) {
    const links = await prisma.temporalEventEntity.findMany({ where: { entityId }, select: { temporalEventId: true } });
    const ids = links.map((l) => l.temporalEventId);
    return prisma.temporalEvent.findMany({
      where: { id: { in: ids }, ...this._whereFilters(filters) },
      orderBy: { occurredAt: 'desc' },
      take: filters.limit ?? 100,
      include: { entities: true },
    });
  },

  async getEventsBetween(startDate: Date, endDate: Date, filters: TemporalEventFilters = {}) {
    return prisma.temporalEvent.findMany({
      where: { occurredAt: { gte: startDate, lte: endDate }, ...this._whereFilters(filters) },
      orderBy: { occurredAt: 'desc' },
      take: filters.limit ?? 200,
    });
  },

  async getEventsSince(date: Date, filters: TemporalEventFilters = {}) {
    return prisma.temporalEvent.findMany({
      where: { occurredAt: { gte: date }, ...this._whereFilters(filters) },
      orderBy: { occurredAt: 'desc' },
      take: filters.limit ?? 200,
    });
  },

  // ---- bridges from ontology objects into the temporal stream --------------
  async createEventFromPoliticalEvent(politicalEventId: UUID, actor?: ActorContext) {
    const pe = await prisma.politicalEvent.findUnique({ where: { id: politicalEventId }, include: { participants: true } });
    if (!pe) throw new Error('PoliticalEvent not found');
    return this.createTemporalEvent(
      {
        politicalEventId: pe.id,
        eventType: TemporalEventType.OTHER,
        occurredAt: pe.occurredAt,
        title: pe.title,
        summary: pe.summary ?? undefined,
        sourceModule: 'ontology',
        confidence: pe.confidence as never,
        visibility: pe.visibility as never,
        entities: pe.participants.map((p) => ({ entityId: p.entityId, role: TemporalEntityRole.ACTOR })),
      },
      actor,
    );
  },

  async createEventFromAction(actionRecommendationId: UUID, eventType: TemporalEventType, actor?: ActorContext) {
    const a = await prisma.actionRecommendation.findUnique({ where: { id: actionRecommendationId } });
    if (!a) throw new Error('ActionRecommendation not found');
    return this.createTemporalEvent(
      {
        eventType,
        occurredAt: new Date(),
        title: `Action ${eventType === TemporalEventType.ACTION_COMPLETED ? 'completed' : 'updated'}: ${a.title}`,
        sourceModule: 'action',
        entities: a.targetEntityId ? [{ entityId: a.targetEntityId, role: TemporalEntityRole.TARGET }] : [],
      },
      actor,
    );
  },

  async createEventFromRisk(riskId: UUID, eventType: TemporalEventType, actor?: ActorContext) {
    const r = await prisma.risk.findUnique({ where: { id: riskId }, include: { links: true } });
    if (!r) throw new Error('Risk not found');
    return this.createTemporalEvent(
      {
        eventType,
        occurredAt: new Date(),
        title: `${r.title}`,
        sourceModule: 'risk',
        entities: r.links.map((l) => ({ entityId: l.entityId, role: TemporalEntityRole.AFFECTED })),
      },
      actor,
    );
  },

  _whereFilters(filters: TemporalEventFilters) {
    const where: Record<string, unknown> = {};
    if (filters.eventType) where.eventType = Array.isArray(filters.eventType) ? { in: filters.eventType } : filters.eventType;
    if (filters.sourceModule) where.sourceModule = filters.sourceModule;
    if (filters.startDate || filters.endDate) {
      where.occurredAt = { ...(filters.startDate ? { gte: filters.startDate } : {}), ...(filters.endDate ? { lte: filters.endDate } : {}) };
    }
    return where;
  },
};
