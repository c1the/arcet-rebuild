// =============================================================================
// explanation.service.ts — human-readable relationship explanations (§8.9)
// =============================================================================
import { prisma } from '../ontology/db.js';
import { RelationshipScoringService } from './scoring.service.js';
import { RelationshipTemporalService } from '../temporal/relationship-temporal.service.js';
import type { UUID } from './types.js';

export const RelationshipExplanationService = {
  async explainRelationship(relationshipId: UUID) {
    const rel = await prisma.relationship.findUnique({ where: { id: relationshipId }, include: { tags: true, notes: { take: 3, orderBy: { createdAt: 'desc' } }, graphScores: true } });
    if (!rel) return null;
    return {
      conclusion: rel.summary ?? `${rel.type} relationship (strength ${rel.strength}/5, ${rel.attitude}).`,
      strength: rel.strength,
      attitude: rel.attitude,
      influence: rel.influenceLevel,
      owner: rel.relationshipOwnerUserId ?? rel.relationshipOwnerEntityId ?? null,
      lastInteraction: rel.lastInteractionAt,
      confidence: rel.confidence,
      inferred: rel.containsInferredData,
      scores: rel.graphScores,
      evidenceSummary: rel.evidenceSummary,
      missingData: rel.confidence === 'LOW' ? ['relationship is low-confidence / may be inferred'] : [],
    };
  },

  async explainRelationshipScore(relationshipId: UUID, scoreType: string) {
    const fnMap: Record<string, () => Promise<{ value: number; drivers: string[]; rationale: string; missingData: string[] }>> = {
      RELATIONSHIP_STRENGTH: () => RelationshipScoringService.calculateStrength(relationshipId),
      TRUST: () => RelationshipScoringService.calculateTrust(relationshipId),
      INFLUENCE: () => RelationshipScoringService.calculateInfluence(relationshipId),
      ACCESS_VALUE: () => RelationshipScoringService.calculateAccessValue(relationshipId),
      STALENESS: () => RelationshipScoringService.calculateStaleness(relationshipId),
      RISK: () => RelationshipScoringService.calculateRelationshipRisk(relationshipId),
      REPAIRABILITY: () => RelationshipScoringService.calculateRepairability(relationshipId),
    };
    const fn = fnMap[scoreType] ?? fnMap.RELATIONSHIP_STRENGTH;
    const r = await fn();
    return { scoreType, conclusion: r.rationale, value: r.value, topFactors: r.drivers, missingData: r.missingData };
  },

  async explainRelationshipTrend(relationshipId: UUID) {
    const timeline = await RelationshipTemporalService.getRelationshipTimeline(relationshipId);
    return { relationshipId, timeline, conclusion: timeline.length ? 'See timeline for changes over time.' : 'No recorded changes yet.' };
  },

  async explainAccessPath(pathId: UUID) {
    const path = await prisma.relationshipPath.findUnique({ where: { id: pathId } });
    if (!path) return null;
    return { conclusion: path.rationale ?? `Path of length ${path.pathLength}.`, quality: path.pathQualityScore, risk: path.pathRiskScore, confidence: path.confidence, path: path.pathJson };
  },
};
