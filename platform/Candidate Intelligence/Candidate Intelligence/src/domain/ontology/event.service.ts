// =============================================================================
// event.service.ts — temporal layer; events carry their own base Entity
// =============================================================================
import { prisma, type Tx } from './db.js';
import { AuditService } from './audit.service.js';
import { EntityService } from './entity.service.js';
import { RelationshipService } from './relationship.service.js';
import { createEventSchema } from './validators.js';
import {
  EntityType,
  EventType,
  ParticipantRole,
  RelationshipType,
  RelationshipDirection,
} from './enums.js';
import type { ActorContext, CreateEventInput, ExtractedCommitment, UUID } from './types.js';

const DAY = 24 * 60 * 60 * 1000;

export const EventService = {
  /**
   * Create an event. Each event gets its own base Entity (type EVENT) so it can
   * participate in the graph, carry evidence, and be audited like anything else.
   */
  async createEvent(input: CreateEventInput, actor?: ActorContext) {
    const data = createEventSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const baseEntity = await EntityService.createEntity(
        { type: EntityType.EVENT, displayName: data.title, description: data.summary, visibility: data.visibility },
        actor,
        tx,
      );
      const event = await tx.politicalEvent.create({
        data: {
          entityId: baseEntity.id,
          eventType: data.eventType,
          title: data.title,
          summary: data.summary,
          occurredAt: data.occurredAt,
          location: data.location,
          constituencyEntityId: data.constituencyEntityId,
          issueEntityId: data.issueEntityId,
          sourceEvidenceId: data.sourceEvidenceId,
          confidence: data.confidence,
          visibility: data.visibility,
        },
      });
      if (data.participants?.length) {
        await tx.eventParticipant.createMany({
          data: data.participants.map((p) => ({
            eventId: event.id,
            entityId: p.entityId,
            participantRole: p.participantRole ?? ParticipantRole.ATTENDEE,
          })),
          skipDuplicates: true,
        });
      }
      await AuditService.record(
        { action: 'event.create', objectType: 'PoliticalEvent', objectId: event.id, entityId: baseEntity.id, after: event as never, actor },
        tx,
      );
      return event;
    });
  },

  async addParticipant(eventId: UUID, entityId: UUID, role: ParticipantRole = ParticipantRole.ATTENDEE, actor?: ActorContext) {
    const link = await prisma.eventParticipant.upsert({
      where: { eventId_entityId_participantRole: { eventId, entityId, participantRole: role } },
      update: {},
      create: { eventId, entityId, participantRole: role },
    });
    await AuditService.record({ action: 'event.addParticipant', objectType: 'EventParticipant', objectId: link.id, entityId, actor });
    return link;
  },

  async linkEventToEvidence(eventId: UUID, evidenceId: UUID, actor?: ActorContext) {
    const event = await prisma.politicalEvent.update({ where: { id: eventId }, data: { sourceEvidenceId: evidenceId } });
    await AuditService.record({ action: 'event.linkEvidence', objectType: 'PoliticalEvent', objectId: eventId, after: { sourceEvidenceId: evidenceId } as never, actor });
    return event;
  },

  /**
   * Deterministic, conservative commitment extraction. The MVP does NOT do NLP:
   * it only surfaces structured commitments when an event is explicitly typed as
   * an ENDORSEMENT/DONATION and has a clear SUBJECT + HOST/AUTHOR pairing. Real
   * extraction is a later module; this keeps provenance honest.
   */
  async extractCommitmentsFromEvent(eventId: UUID): Promise<ExtractedCommitment[]> {
    const event = await prisma.politicalEvent.findUniqueOrThrow({ where: { id: eventId }, include: { participants: true } });
    const out: ExtractedCommitment[] = [];
    const subjects = event.participants.filter((p) => p.participantRole === ParticipantRole.SUBJECT || p.participantRole === ParticipantRole.TARGET);
    const actors = event.participants.filter((p) => p.participantRole === ParticipantRole.HOST || p.participantRole === ParticipantRole.AUTHOR || p.participantRole === ParticipantRole.ATTENDEE);
    if (event.eventType === EventType.ENDORSEMENT) {
      for (const a of actors) for (const s of subjects) out.push({ fromEntityId: a.entityId, toEntityId: s.entityId, description: `Endorsement recorded at "${event.title}"`, relationshipType: RelationshipType.SUPPORTS });
    }
    if (event.eventType === EventType.DONATION) {
      for (const a of actors) for (const s of subjects) out.push({ fromEntityId: a.entityId, toEntityId: s.entityId, description: `Donation recorded at "${event.title}"`, relationshipType: RelationshipType.FUNDS });
    }
    return out;
  },

  /**
   * Apply an event to the graph: bump lastInteractionAt between participants,
   * and materialise any extracted commitments as relationships.
   */
  async updateRelationshipsFromEvent(eventId: UUID, actor?: ActorContext) {
    const bumped = await RelationshipService.updateRelationshipFromEvent(eventId, actor);
    const commitments = await this.extractCommitmentsFromEvent(eventId);
    let created = 0;
    for (const c of commitments) {
      // only create if a current edge of that type does not already exist
      const exists = await prisma.relationship.count({
        where: { sourceEntityId: c.fromEntityId, targetEntityId: c.toEntityId, type: c.relationshipType, isCurrent: true },
      });
      if (exists === 0) {
        await RelationshipService.createRelationship(
          { sourceEntityId: c.fromEntityId, targetEntityId: c.toEntityId, type: c.relationshipType, direction: RelationshipDirection.DIRECTED, summary: c.description },
          actor,
        );
        created++;
      }
    }
    return { ...bumped, commitmentsCreated: created };
  },

  async getEventsForEntity(entityId: UUID) {
    return prisma.politicalEvent.findMany({
      where: { OR: [{ participants: { some: { entityId } } }, { constituencyEntityId: entityId }, { issueEntityId: entityId }] },
      orderBy: { occurredAt: 'desc' },
      include: { participants: true },
    });
  },

  async getRecentChanges(filters: { sinceDays?: number; limit?: number } = {}) {
    const since = new Date(Date.now() - (filters.sinceDays ?? 14) * DAY);
    return prisma.politicalEvent.findMany({
      where: { occurredAt: { gte: since } },
      orderBy: { occurredAt: 'desc' },
      take: filters.limit ?? 50,
      include: { participants: true },
    });
  },
};
