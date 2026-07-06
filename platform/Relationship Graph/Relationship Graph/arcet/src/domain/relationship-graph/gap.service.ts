// =============================================================================
// gap.service.ts — relationship gap detection + persistence (§8.6)
// -----------------------------------------------------------------------------
// Reuses the ontology gap detector and the temporal stale-relationship alerts,
// classifies severity via the pure rules, and persists RelationshipGap rows.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { AuditService } from '../ontology/audit.service.js';
import { RelationshipService } from '../ontology/relationship.service.js';
import { Confidence, InfluenceLevel } from '../ontology/enums.js';
import * as rules from './rules.js';
import { RelationshipGapContextType, RelationshipGapType, RelationshipGapStatus } from './enums.js';
import type { ActorContext, DetectedGap, UUID } from './types.js';

const ONTOLOGY_GAP_MAP: Record<string, RelationshipGapType> = {
  CANDIDATE_NO_LOCAL_ASSOCIATION_LINK: RelationshipGapType.NO_RELATIONSHIP,
  STAKEHOLDER_NO_OWNER: RelationshipGapType.NO_RELATIONSHIP_OWNER,
  HIGH_INFLUENCE_NOT_CONTACTED: RelationshipGapType.STALE_RELATIONSHIP,
  POLICY_AFFECTS_STAKEHOLDER_NO_BRIEFING: RelationshipGapType.NO_RECENT_BRIEFING,
  CANDIDATE_WEAK_STAKEHOLDER_COVERAGE: RelationshipGapType.WEAK_RELATIONSHIP,
};

export const RelationshipGapService = {
  async detectCandidateRelationshipGaps(candidateEntityId: UUID, constituencyEntityId: UUID, persist = true, actor?: ActorContext): Promise<DetectedGap[]> {
    const raw = await RelationshipService.getRelationshipGaps({ candidateEntityId, constituencyEntityId });
    const gaps: DetectedGap[] = raw.map((g) => {
      const gapType = ONTOLOGY_GAP_MAP[g.kind] ?? RelationshipGapType.WEAK_RELATIONSHIP;
      return { contextEntityId: candidateEntityId, contextType: RelationshipGapContextType.CANDIDATE, missingTargetEntityId: g.relatedEntityId, gapType, severity: rules.gapSeverity(gapType, true), reason: g.description, confidence: Confidence.LOW };
    });
    if (persist) await this._persist(gaps, actor);
    return gaps;
  },

  async detectConstituencyRelationshipGaps(constituencyEntityId: UUID, persist = true, actor?: ActorContext): Promise<DetectedGap[]> {
    const raw = await RelationshipService.getRelationshipGaps({ constituencyEntityId });
    const gaps: DetectedGap[] = raw.map((g) => {
      const gapType = ONTOLOGY_GAP_MAP[g.kind] ?? RelationshipGapType.WEAK_RELATIONSHIP;
      return { contextEntityId: constituencyEntityId, contextType: RelationshipGapContextType.CONSTITUENCY, missingTargetEntityId: g.relatedEntityId, gapType, severity: rules.gapSeverity(gapType, true), reason: g.description, confidence: Confidence.LOW };
    });
    if (persist) await this._persist(gaps, actor);
    return gaps;
  },

  /** Policy briefing gaps: high-influence stakeholders affected by the policy with unknown/hostile attitude. */
  async detectPolicyRelationshipGaps(policyEntityId: UUID, affectedStakeholderIds: UUID[], persist = true, actor?: ActorContext): Promise<DetectedGap[]> {
    const gaps: DetectedGap[] = [];
    for (const sid of affectedStakeholderIds) {
      const rels = await RelationshipService.getRelationshipsForEntity(sid);
      const briefed = rels.some((r) => (r.type as string) === 'BROKER_FOR' || r.lastInteractionAt);
      if (!briefed) gaps.push({ contextEntityId: policyEntityId, contextType: RelationshipGapContextType.POLICY, missingTargetEntityId: sid, gapType: RelationshipGapType.NO_RECENT_BRIEFING, severity: rules.gapSeverity(RelationshipGapType.NO_RECENT_BRIEFING, true), reason: 'Policy affects stakeholder but no briefing relationship exists.', confidence: Confidence.LOW });
    }
    if (persist) await this._persist(gaps, actor);
    return gaps;
  },

  async getOpenRelationshipGaps(filters: { contextEntityId?: UUID; limit?: number } = {}) {
    return prisma.relationshipGap.findMany({ where: { status: RelationshipGapStatus.OPEN, ...(filters.contextEntityId ? { contextEntityId: filters.contextEntityId } : {}) }, orderBy: { detectedAt: 'desc' }, take: filters.limit ?? 100 });
  },

  async resolveRelationshipGap(gapId: UUID, resolution: string, actor?: ActorContext) {
    const gap = await prisma.relationshipGap.update({ where: { id: gapId }, data: { status: RelationshipGapStatus.RESOLVED, resolvedAt: new Date(), reason: resolution } });
    await AuditService.record({ action: 'relationship.gap.resolve', objectType: 'RelationshipGap', objectId: gapId, after: gap as never, actor });
    return gap;
  },

  async _persist(gaps: DetectedGap[], actor?: ActorContext) {
    for (const g of gaps) {
      await prisma.relationshipGap.create({ data: { contextEntityId: g.contextEntityId, contextType: g.contextType as never, missingTargetEntityId: g.missingTargetEntityId, gapType: g.gapType as never, severity: g.severity as never, reason: g.reason, confidence: g.confidence as never, status: RelationshipGapStatus.OPEN } });
    }
    if (gaps.length) await AuditService.record({ action: 'relationship.gaps.detect', objectType: 'RelationshipGap', objectId: gaps[0].contextEntityId, after: { count: gaps.length } as never, actor });
  },
};
