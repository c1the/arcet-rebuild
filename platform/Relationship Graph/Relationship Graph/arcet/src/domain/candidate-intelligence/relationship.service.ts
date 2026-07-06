// =============================================================================
// relationship.service.ts — candidate-focused relationship analysis (§10.6)
// -----------------------------------------------------------------------------
// Thin candidate-oriented views over the ontology RelationshipService + the
// temporal decay layer. Relationship gaps feed candidate-seat fit directly.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { RelationshipService } from '../ontology/relationship.service.js';
import { ActionService } from '../ontology/action.service.js';
import { Attitude, InfluenceLevel, ActionType, ActionPriority } from '../ontology/enums.js';
import type { ActorContext, UUID } from './types.js';

const HOSTILE = new Set([Attitude.HOSTILE, Attitude.SCEPTICAL]);
const HIGH_INF = new Set([InfluenceLevel.HIGH, InfluenceLevel.CRITICAL]);

export const CandidateRelationshipService = {
  async getCandidateRelationshipGraph(candidateEntityId: UUID, depth = 1) {
    return RelationshipService.getRelationshipGraph(candidateEntityId, depth);
  },

  async getCandidateStakeholderCoverage(candidateEntityId: UUID, constituencyEntityId: UUID) {
    const rels = await RelationshipService.getRelationshipsForEntity(candidateEntityId);
    const highInfluence = rels.filter((r) => HIGH_INF.has(r.influenceLevel as never));
    const covered = highInfluence.filter((r) => !HOSTILE.has(r.attitude as never));
    return { total: rels.length, highInfluence: highInfluence.length, covered: covered.length, coverageRatio: highInfluence.length ? covered.length / highInfluence.length : 0 };
  },

  async getCandidateRelationshipGaps(candidateEntityId: UUID, constituencyEntityId: UUID) {
    return RelationshipService.getRelationshipGaps({ candidateEntityId, constituencyEntityId });
  },

  async getCandidateStaleRelationships(candidateEntityId: UUID) {
    const rels = await RelationshipService.getRelationshipsForEntity(candidateEntityId);
    const staleCutoff = Date.now() - 90 * 86400000;
    return rels.filter((r) => (r.strength ?? 0) >= 4 && r.lastInteractionAt && new Date(r.lastInteractionAt).getTime() < staleCutoff);
  },

  async getCandidateFactionRelationships(candidateEntityId: UUID) {
    const rels = await RelationshipService.getRelationshipsForEntity(candidateEntityId);
    return rels.filter((r) => (r.type as string)?.includes('FACTION') || r.factionEntityId != null);
  },

  /** Create relationship-building actions for gaps (brief §18). */
  async recommendRelationshipActions(candidateEntityId: UUID, constituencyEntityId: UUID, actor?: ActorContext) {
    const gaps = await this.getCandidateRelationshipGaps(candidateEntityId, constituencyEntityId);
    const created = [];
    for (const g of gaps.slice(0, 10)) {
      created.push(await ActionService.createRecommendation({ title: `Build relationship: ${(g as { label?: string }).label ?? 'key stakeholder'}`, actionType: ActionType.STRENGTHEN_LOCAL_LINKS, priority: ActionPriority.MEDIUM, targetEntityId: candidateEntityId, sourceModule: 'candidate-intelligence', rationale: 'Relationship gap affecting stakeholder coverage / local association support.' }, actor));
    }
    return created;
  },
};
