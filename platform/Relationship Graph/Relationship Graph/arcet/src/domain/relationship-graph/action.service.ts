// =============================================================================
// action.service.ts — relationship-based action recommendations (§8.8, §13, §18)
// -----------------------------------------------------------------------------
// Derives actions from the relationship scores via the pure rules engine,
// persists ActionRecommendation records, and feeds completed-action outcomes
// back into the relationship (last interaction, attitude/trust, risk, gaps).
// =============================================================================
import { prisma } from '../ontology/db.js';
import { ActionService } from '../ontology/action.service.js';
import { Attitude } from '../ontology/enums.js';
import { RelationshipTemporalService } from '../temporal/relationship-temporal.service.js';
import { ChangeService } from '../temporal/change.service.js';
import { ChangeType, TemporalEventType } from '../temporal/enums.js';
import { RelationshipScoringService } from './scoring.service.js';
import * as rules from './rules.js';
import { RelationshipScoreType, RelationshipGapStatus } from './enums.js';
import type { ActorContext, UUID } from './types.js';

export const RelationshipActionService = {
  async generateRelationshipActions(relationshipId: UUID, context: { strategic?: Parameters<typeof rules.scoreStrategicValue>[0]; briefing?: Parameters<typeof rules.scoreBriefingPriority>[0] } = {}, actor?: ActorContext) {
    const rel = await prisma.relationship.findUnique({ where: { id: relationshipId } });
    if (!rel) throw new Error('Relationship not found');
    const { results } = await RelationshipScoringService.recalculateRelationshipScores(relationshipId, context, actor);
    const get = (t: RelationshipScoreType) => results.find((r) => r.scoreType === t)?.value ?? 0;

    const proposed = rules.relationshipActions({
      relationshipId,
      targetEntityId: rel.targetEntityId,
      stalenessScore: get(RelationshipScoreType.STALENESS),
      riskScore: get(RelationshipScoreType.RISK),
      strategicValue: get(RelationshipScoreType.STRATEGIC_VALUE),
      attitude: rel.attitude as Attitude,
      repairabilityScore: get(RelationshipScoreType.REPAIRABILITY),
      hasOwner: !!(rel.relationshipOwnerUserId || rel.relationshipOwnerEntityId),
      hasOverdueCommitment: (rel.openCommitmentCount ?? 0) > 0,
      lowConfidenceHighImpact: rel.confidence === 'LOW' && get(RelationshipScoreType.STRATEGIC_VALUE) >= 60,
      briefingPriority: get(RelationshipScoreType.BRIEFING_PRIORITY),
    });

    const created = [];
    for (const a of proposed) {
      created.push(await ActionService.createRecommendation({ title: a.title, actionType: a.actionType, priority: a.priority, targetEntityId: a.targetEntityId, sourceModule: 'relationship-graph', rationale: a.rationale }, actor));
    }
    return created;
  },

  /**
   * Outcome feedback (§13): a completed relationship action updates the edge —
   * records an interaction, refreshes lastInteractionAt, may improve attitude/
   * trust and reduce risk, and resolves any matching open gap.
   */
  async updateRelationshipFromActionOutcome(actionId: UUID, relationshipId: UUID, outcome: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL', actor?: ActorContext) {
    const rel = await prisma.relationship.findUnique({ where: { id: relationshipId } });
    if (!rel) throw new Error('Relationship not found');
    await RelationshipTemporalService.recordRelationshipInteraction(relationshipId, TemporalEventType.MEETING_OCCURRED, new Date(), actor).catch(() => undefined);
    await prisma.relationship.update({ where: { id: relationshipId }, data: { lastInteractionAt: new Date(), lastConfirmedAt: new Date() } });

    if (outcome === 'POSITIVE') {
      const newStrength = Math.min((rel.strength ?? 3) + 1, 5);
      await prisma.relationship.update({ where: { id: relationshipId }, data: { strength: newStrength } });
      await ChangeService.recordChange({ relationshipId, entityId: rel.targetEntityId, changeType: ChangeType.RELATIONSHIP_STRENGTHENED, deltaNumeric: 1, rationale: 'Positive action outcome.', sourceModule: 'relationship-graph', significant: false }, actor);
      // Resolve a matching open gap for this target, if any.
      await prisma.relationshipGap.updateMany({ where: { missingTargetEntityId: rel.targetEntityId, status: RelationshipGapStatus.OPEN }, data: { status: RelationshipGapStatus.RESOLVED, resolvedAt: new Date() } }).catch(() => undefined);
    } else if (outcome === 'NEGATIVE') {
      await ChangeService.recordChange({ relationshipId, entityId: rel.targetEntityId, changeType: ChangeType.ATTITUDE_WORSENED, rationale: 'Negative action outcome.', sourceModule: 'relationship-graph', significant: true }, actor);
    }
    await RelationshipScoringService.recalculateRelationshipScores(relationshipId, {}, actor);
    return { actionId, relationshipId, outcome };
  },
};
