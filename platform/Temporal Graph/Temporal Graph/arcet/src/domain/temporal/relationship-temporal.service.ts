// =============================================================================
// relationship-temporal.service.ts — relationship history + decay (§9.1)
// -----------------------------------------------------------------------------
// Uses the ontology RelationshipService and the temporal decay rules. Records
// interactions as temporal events, strength/attitude changes as TemporalChange,
// and surfaces stale / improved / deteriorated / unmanaged-hostile relationships.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { RelationshipService } from '../ontology/relationship.service.js';
import { Attitude, InfluenceLevel } from '../ontology/enums.js';
import { TemporalEventService } from './temporal-event.service.js';
import { ChangeService } from './change.service.js';
import { ObservationService } from './observation.service.js';
import { DecayService } from './decay.service.js';
import { TimelineService } from './timeline.service.js';
import { TemporalQueryService } from './temporal-query.service.js';
import { relationshipDecay } from './rules.js';
import { ChangeType, ObservationType, TemporalEntityRole, TemporalEventType } from './enums.js';
import type { ActorContext, UUID } from './types.js';

const ATTITUDE_ORDER = ['HOSTILE', 'SCEPTICAL', 'MIXED', 'NEUTRAL', 'SUPPORTIVE'];

export const RelationshipTemporalService = {
  async getRelationshipTimeline(relationshipId: UUID) {
    return TimelineService.getTimelineForRelationship(relationshipId);
  },

  async getRelationshipStateAsOf(relationshipId: UUID, asOfDate: Date) {
    return TemporalQueryService.getRelationshipAsOf(relationshipId, asOfDate);
  },

  async recordRelationshipInteraction(relationshipId: UUID, eventType: TemporalEventType, occurredAt: Date, actor?: ActorContext) {
    const rel = await prisma.relationship.findUnique({ where: { id: relationshipId } });
    if (!rel) throw new Error('Relationship not found');
    const event = await TemporalEventService.createTemporalEvent(
      {
        eventType,
        occurredAt,
        title: `Interaction with contact`,
        sourceModule: 'relationship',
        metadata: { relationshipId } as never,
        entities: [{ entityId: rel.targetEntityId, role: TemporalEntityRole.TARGET }, { entityId: rel.sourceEntityId, role: TemporalEntityRole.ACTOR }],
      },
      actor,
    );
    await prisma.relationship.update({ where: { id: relationshipId }, data: { lastInteractionAt: occurredAt } }).catch(() => undefined);
    await ObservationService.recordObservation({ subjectEntityId: rel.targetEntityId, relationshipId, observationType: ObservationType.RELATIONSHIP_DECAY, valueNumeric: 0, observedAt: occurredAt, sourceModule: 'relationship', sourceTemporalEventId: event.id }, actor);
    return event;
  },

  async recordRelationshipStrengthChange(relationshipId: UUID, oldValue: number, newValue: number, context: { rationale?: string; sourceTemporalEventId?: UUID } = {}, actor?: ActorContext) {
    const rel = await prisma.relationship.findUnique({ where: { id: relationshipId } });
    const delta = newValue - oldValue;
    await ObservationService.recordObservation({ subjectEntityId: rel?.targetEntityId ?? relationshipId, relationshipId, observationType: ObservationType.RELATIONSHIP_STRENGTH, valueNumeric: newValue, sourceModule: 'relationship' }, actor);
    return ChangeService.recordChange(
      {
        relationshipId,
        entityId: rel?.targetEntityId,
        changeType: delta >= 0 ? ChangeType.RELATIONSHIP_STRENGTHENED : ChangeType.RELATIONSHIP_WEAKENED,
        fieldName: 'strength',
        oldValue,
        newValue,
        deltaNumeric: delta,
        rationale: context.rationale ?? `Strength ${oldValue} → ${newValue}`,
        sourceTemporalEventId: context.sourceTemporalEventId,
        sourceModule: 'relationship',
        significant: Math.abs(delta) >= 2,
      },
      actor,
    );
  },

  async recordRelationshipAttitudeChange(relationshipId: UUID, oldValue: Attitude, newValue: Attitude, context: { rationale?: string; sourceTemporalEventId?: UUID } = {}, actor?: ActorContext) {
    const rel = await prisma.relationship.findUnique({ where: { id: relationshipId } });
    const improved = ATTITUDE_ORDER.indexOf(newValue) > ATTITUDE_ORDER.indexOf(oldValue);
    return ChangeService.recordChange(
      {
        relationshipId,
        entityId: rel?.targetEntityId,
        changeType: improved ? ChangeType.ATTITUDE_IMPROVED : ChangeType.ATTITUDE_WORSENED,
        fieldName: 'attitude',
        oldValue,
        newValue,
        rationale: context.rationale ?? `Attitude ${oldValue} → ${newValue}`,
        sourceTemporalEventId: context.sourceTemporalEventId,
        sourceModule: 'relationship',
        significant: !improved,
      },
      actor,
    );
  },

  async calculateRelationshipDecay(relationshipId: UUID, asOfDate?: Date) {
    return DecayService.calculateRelationshipDecay(relationshipId, asOfDate);
  },

  async getStaleHighValueRelationships(filters: { staleDays?: number; minStrength?: number } = {}) {
    return DecayService.calculateStaleRelationshipAlerts({ staleDays: filters.staleDays ?? 90, minStrength: filters.minStrength ?? 4 });
  },

  async getRecentlyImprovedRelationships(filters: { sinceDays?: number; limit?: number } = {}) {
    const since = new Date(Date.now() - (filters.sinceDays ?? 30) * 86400000);
    return prisma.temporalChange.findMany({ where: { changeType: { in: [ChangeType.RELATIONSHIP_STRENGTHENED, ChangeType.ATTITUDE_IMPROVED] }, changedAt: { gte: since } }, orderBy: { changedAt: 'desc' }, take: filters.limit ?? 50 });
  },

  async getRecentlyDeterioratedRelationships(filters: { sinceDays?: number; limit?: number } = {}) {
    const since = new Date(Date.now() - (filters.sinceDays ?? 30) * 86400000);
    return prisma.temporalChange.findMany({ where: { changeType: { in: [ChangeType.RELATIONSHIP_WEAKENED, ChangeType.ATTITUDE_WORSENED, ChangeType.RELATIONSHIP_STALE] }, changedAt: { gte: since } }, orderBy: { changedAt: 'desc' }, take: filters.limit ?? 50 });
  },

  async getUnmanagedHostileRelationships(filters: { limit?: number } = {}) {
    const rels = await prisma.relationship.findMany({ where: { isCurrent: true, attitude: { in: [Attitude.HOSTILE, Attitude.SCEPTICAL] } }, take: filters.limit ?? 200 });
    const out = [];
    for (const rel of rels) {
      const result = relationshipDecay(
        { relationshipId: rel.id, targetEntityId: rel.targetEntityId, lastInteractionAt: rel.lastInteractionAt ?? null, strength: rel.strength ?? 1, attitude: (rel.attitude ?? Attitude.NEUTRAL) as never, influenceLevel: (rel.influenceLevel ?? InfluenceLevel.UNKNOWN) as never, hasOverdueCommitment: false },
        Date.now(),
      );
      if (result.decay.band === 'UNMANAGED_HOSTILE') out.push({ relationship: rel, decay: result.decay });
    }
    return out;
  },
};
