// =============================================================================
// scoring.service.ts — relationship quality scoring (§8.3, §17)
// -----------------------------------------------------------------------------
// Derives structured signals from the relationship row + temporal state +
// commitments, runs the pure scorers, persists specialised RelationshipScore
// rows, and (for cross-module use) mirrors key scores into the generic Score
// table and updates the relationship's stalenessScore / status.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { ScoreService } from '../ontology/score.service.js';
import { Attitude, Confidence, InfluenceLevel, ScoreType } from '../ontology/enums.js';
import { CommitmentService } from '../temporal/commitment.service.js';
import * as rules from './rules.js';
import { RelationshipScoreType } from './enums.js';
import type { ActorContext, ScoreResult, UUID } from './types.js';

const HOSTILE = new Set([Attitude.HOSTILE, Attitude.SCEPTICAL]);

async function loadContext(relationshipId: UUID) {
  const rel = await prisma.relationship.findUnique({ where: { id: relationshipId } });
  if (!rel) throw new Error('Relationship not found');
  const days = rel.lastInteractionAt ? Math.floor((Date.now() - new Date(rel.lastInteractionAt).getTime()) / 86400000) : null;
  const overdue = await CommitmentService.getOverdueCommitments({ limit: 1000 }).then((list) => list.some((o) => o.commitment.toEntityId === rel.targetEntityId || o.commitment.fromEntityId === rel.targetEntityId)).catch(() => false);
  return { rel, days, overdue };
}

export const RelationshipScoringService = {
  async calculateStrength(relationshipId: UUID) {
    const { rel, days } = await loadContext(relationshipId);
    return rules.scoreStrength({ currentStrength: rel.strength, daysSinceInteraction: days, hostileStatement: HOSTILE.has(rel.attitude as never) }, rel.confidence as Confidence);
  },
  async calculateTrust(relationshipId: UUID) {
    const { rel } = await loadContext(relationshipId);
    return rules.scoreTrust({ currentTrust: rel.trustLevel ?? undefined }, rel.confidence as Confidence);
  },
  async calculateInfluence(relationshipId: UUID) {
    const { rel } = await loadContext(relationshipId);
    return rules.scoreInfluence({ influenceLevel: rel.influenceLevel as InfluenceLevel, controlsAccess: rel.type === 'CONTROLS_ACCESS_TO', formalRole: rel.type === 'REPRESENTS' || rel.type === 'WORKS_FOR' }, rel.confidence as Confidence);
  },
  async calculateAccessValue(relationshipId: UUID) {
    const { rel } = await loadContext(relationshipId);
    return rules.scoreAccessValue({ controlsAccessToTarget: rel.type === 'CONTROLS_ACCESS_TO', brokerForTarget: rel.type === 'BROKER_FOR', influenceLevel: rel.influenceLevel as InfluenceLevel }, rel.confidence as Confidence);
  },
  async calculateStrategicValue(relationshipId: UUID, context: rules.ProposedAction extends never ? never : Parameters<typeof rules.scoreStrategicValue>[0] = {}) {
    const { rel } = await loadContext(relationshipId);
    return rules.scoreStrategicValue(context, rel.confidence as Confidence);
  },
  async calculateStaleness(relationshipId: UUID) {
    const { rel, days, overdue } = await loadContext(relationshipId);
    return rules.scoreStaleness({ daysSinceInteraction: days, overdueCommitment: overdue, highValueNoOwner: (rel.strength ?? 0) >= 4 && !rel.relationshipOwnerUserId && !rel.relationshipOwnerEntityId, influenceLevel: rel.influenceLevel as InfluenceLevel }, rel.confidence as Confidence);
  },
  async calculateRepairability(relationshipId: UUID) {
    const { rel } = await loadContext(relationshipId);
    return rules.scoreRepairability({ contactable: true, pastPositiveHistory: (rel.strength ?? 0) >= 3 }, rel.confidence as Confidence);
  },
  async calculateRelationshipRisk(relationshipId: UUID) {
    const { rel, overdue } = await loadContext(relationshipId);
    return rules.scoreRelationshipRisk({ attitude: rel.attitude as Attitude, influenceLevel: rel.influenceLevel as InfluenceLevel, unresolvedCommitment: overdue, sensitiveData: rel.dataClassification === 'RESTRICTED' || rel.dataClassification === 'SENSITIVE_PERSONAL_DATA', complianceFlag: rel.requiresReview, factionLink: rel.type === 'MEMBER_OF_FACTION' || rel.type === 'LEANING_TOWARD_FACTION' }, rel.confidence as Confidence);
  },
  async calculateBriefingPriority(relationshipId: UUID, context: Parameters<typeof rules.scoreBriefingPriority>[0] = {}) {
    const { rel } = await loadContext(relationshipId);
    const merged = { highInfluence: rel.influenceLevel === InfluenceLevel.HIGH || rel.influenceLevel === InfluenceLevel.CRITICAL, attitudeUnknownOrHostile: rel.attitude === Attitude.UNKNOWN || HOSTILE.has(rel.attitude as never), ...context };
    return rules.scoreBriefingPriority(merged, rel.confidence as Confidence);
  },

  /** Recompute all relationship scores, persist them, and update status/staleness. */
  async recalculateRelationshipScores(relationshipId: UUID, context: { strategic?: Parameters<typeof rules.scoreStrategicValue>[0]; briefing?: Parameters<typeof rules.scoreBriefingPriority>[0] } = {}, actor?: ActorContext) {
    const { rel } = await loadContext(relationshipId);
    const results: ScoreResult[] = [
      await this.calculateStrength(relationshipId),
      await this.calculateTrust(relationshipId),
      await this.calculateInfluence(relationshipId),
      await this.calculateAccessValue(relationshipId),
      await this.calculateStrategicValue(relationshipId, context.strategic ?? {}),
      await this.calculateStaleness(relationshipId),
      await this.calculateRepairability(relationshipId),
      await this.calculateRelationshipRisk(relationshipId),
      await this.calculateBriefingPriority(relationshipId, context.briefing ?? {}),
    ];

    for (const r of results) {
      await prisma.relationshipScore.upsert({
        where: { relationshipId_scoreType: { relationshipId, scoreType: r.scoreType as never } },
        create: { relationshipId, scoreType: r.scoreType as never, value: r.value, confidence: r.confidence as never, rationale: r.rationale },
        update: { value: r.value, confidence: r.confidence as never, rationale: r.rationale },
      });
    }

    const get = (t: RelationshipScoreType) => results.find((r) => r.scoreType === t)?.value ?? 0;
    const staleness = get(RelationshipScoreType.STALENESS);
    const risk = get(RelationshipScoreType.RISK);
    const repair = get(RelationshipScoreType.REPAIRABILITY);
    const status = rules.deriveStatus({ attitude: rel.attitude as Attitude, stalenessScore: staleness, riskScore: risk, repairabilityScore: repair, sensitive: rel.dataClassification === 'RESTRICTED', archived: !rel.isCurrent });

    await prisma.relationship.update({ where: { id: relationshipId }, data: { stalenessScore: staleness, status: status as never, riskLevel: (risk >= 75 ? 'CRITICAL' : risk >= 50 ? 'HIGH' : risk >= 25 ? 'MEDIUM' : 'LOW') as never } });

    // Mirror the cross-module-relevant scores into the generic Score table.
    await ScoreService.recordScore({ subjectEntityId: rel.targetEntityId, contextEntityId: rel.sourceEntityId, scoreType: ScoreType.RELATIONSHIP_STRENGTH, value: get(RelationshipScoreType.RELATIONSHIP_STRENGTH), confidence: rel.confidence as never, sourceModule: 'relationship-graph', rationale: 'relationship strength' }, actor).catch(() => undefined);

    return { results, status, staleness, risk };
  },
};
