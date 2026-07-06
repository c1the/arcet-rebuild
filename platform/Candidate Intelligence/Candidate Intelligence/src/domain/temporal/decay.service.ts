// =============================================================================
// decay.service.ts — relationship decay + scheduled decay sweeps (§6.7 / §17.1)
// -----------------------------------------------------------------------------
// Fetches relationship state from the ontology, runs the pure decay rules, and
// persists the resulting observations / changes / risks / actions / follow-ups.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { RelationshipService } from '../ontology/relationship.service.js';
import { RiskService } from '../ontology/risk.service.js';
import { ActionService } from '../ontology/action.service.js';
import { Attitude, InfluenceLevel } from '../ontology/enums.js';
import { ObservationService } from './observation.service.js';
import { ChangeService } from './change.service.js';
import { CommitmentService } from './commitment.service.js';
import { relationshipDecay, commitmentUrgency } from './rules.js';
import { ObservationType } from './enums.js';
import type { ActorContext, DecayResult, UUID } from './types.js';

export const DecayService = {
  async calculateRelationshipDecay(relationshipId: UUID, asOfDate?: Date): Promise<DecayResult> {
    const rel = await prisma.relationship.findUnique({ where: { id: relationshipId } });
    if (!rel) throw new Error('Relationship not found');
    const overdue = await this._hasOverdueCommitment(rel.targetEntityId, asOfDate);
    const { decay } = relationshipDecay(
      {
        relationshipId,
        targetEntityId: rel.targetEntityId,
        lastInteractionAt: rel.lastInteractionAt ?? null,
        strength: rel.strength ?? 1,
        attitude: (rel.attitude ?? Attitude.NEUTRAL) as never,
        influenceLevel: (rel.influenceLevel ?? InfluenceLevel.UNKNOWN) as never,
        hasOverdueCommitment: overdue,
      },
      (asOfDate ?? new Date()).getTime(),
    );
    return decay;
  },

  async calculateCommitmentUrgency(commitmentId: UUID, asOfDate?: Date) {
    const c = await prisma.commitment.findUnique({ where: { id: commitmentId } });
    if (!c) throw new Error('Commitment not found');
    return commitmentUrgency({ commitmentId, status: c.status, dueAt: c.dueAt }, (asOfDate ?? new Date()).getTime());
  },

  async calculateStaleRelationshipAlerts(filters: { staleDays?: number; minStrength?: number } = {}) {
    const stale = await RelationshipService.getStaleRelationships(filters);
    const out = [];
    for (const rel of stale) {
      out.push({ relationship: rel, decay: await this.calculateRelationshipDecay(rel.id) });
    }
    return out;
  },

  /**
   * Scheduled decay sweep: recompute decay for current relationships, record an
   * observation + RelationshipTemporalState, and persist rule-proposed
   * risks/actions/changes for stale high-value or unmanaged-hostile ties.
   */
  async applyScheduledDecay(asOfDate?: Date, actor?: ActorContext) {
    const now = asOfDate ?? new Date();
    const rels = await prisma.relationship.findMany({ where: { isCurrent: true }, take: 1000 });
    let processed = 0;
    for (const rel of rels) {
      const overdue = await this._hasOverdueCommitment(rel.targetEntityId, now);
      const result = relationshipDecay(
        {
          relationshipId: rel.id,
          targetEntityId: rel.targetEntityId,
          lastInteractionAt: rel.lastInteractionAt ?? null,
          strength: rel.strength ?? 1,
          attitude: (rel.attitude ?? Attitude.NEUTRAL) as never,
          influenceLevel: (rel.influenceLevel ?? InfluenceLevel.UNKNOWN) as never,
          hasOverdueCommitment: overdue,
        },
        now.getTime(),
      );

      await prisma.relationshipTemporalState.create({
        data: {
          relationshipId: rel.id,
          observedAt: now,
          strength: rel.strength ?? null,
          attitude: rel.attitude ?? null,
          influenceLevel: rel.influenceLevel ?? null,
          stalenessScore: result.decay.stalenessScore,
          decayScore: result.decay.decayScore,
          lastInteractionAt: rel.lastInteractionAt ?? null,
          openCommitmentCount: overdue ? 1 : 0,
          rationale: result.decay.rationale,
        },
      });
      await ObservationService.recordObservation(
        { subjectEntityId: rel.targetEntityId, relationshipId: rel.id, observationType: ObservationType.RELATIONSHIP_DECAY, valueNumeric: result.decay.decayScore, observedAt: now, sourceModule: 'decay' },
        actor,
      );

      for (const ch of result.changes) {
        await ChangeService.recordChange({ relationshipId: rel.id, entityId: rel.targetEntityId, changeType: ch.changeType, deltaNumeric: ch.deltaNumeric, rationale: ch.rationale, significant: ch.significant, sourceModule: 'decay' }, actor);
      }
      for (const r of result.risks) {
        await RiskService.createRisk({ riskType: r.riskType, title: r.title, severity: r.severity, likelihood: r.likelihood, urgency: r.urgency, sourceModule: 'decay', rationale: r.rationale, links: r.links }, actor);
      }
      for (const a of result.actions) {
        await ActionService.createRecommendation({ title: a.title, actionType: a.actionType, priority: a.priority, targetEntityId: a.targetEntityId, sourceModule: 'decay', rationale: a.rationale }, actor);
      }
      processed++;
    }
    return processed;
  },

  async _hasOverdueCommitment(entityId: UUID, asOfDate?: Date): Promise<boolean> {
    const overdue = await CommitmentService.getOverdueCommitments({ asOfDate, limit: 1000 });
    return overdue.some((o) => o.commitment.toEntityId === entityId || o.commitment.fromEntityId === entityId);
  },
};
