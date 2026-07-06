// =============================================================================
// constituency-context.service.ts — constituency page + selection context (§15)
// =============================================================================
import { prisma } from './db.js';
import { RelationshipType } from './enums.js';
import type { UUID } from './types.js';

export const ConstituencyContextService = {
  async getConstituencyContext(constituencyEntityId: UUID) {
    const [entity, profile, electionHistory, candidates, stakeholders, actions] = await Promise.all([
      prisma.entity.findUnique({ where: { id: constituencyEntityId } }),
      prisma.constituencyProfile.findFirst({ where: { entityId: constituencyEntityId } }),
      prisma.electionResult.findMany({ where: { constituencyEntityId }, orderBy: { electionDate: 'desc' } }),
      this.getCandidates(constituencyEntityId),
      this.getStakeholders(constituencyEntityId),
      prisma.actionRecommendation.findMany({ where: { targetEntityId: constituencyEntityId }, orderBy: [{ priority: 'desc' }] }),
    ]);
    return { entity, profile, electionHistory, candidates, stakeholders, actions };
  },

  /** Candidates whose target seat is this constituency. */
  async getCandidates(constituencyEntityId: UUID) {
    const profiles = await prisma.candidateProfile.findMany({ where: { currentTargetConstituencyId: constituencyEntityId } });
    const ids = profiles.map((p) => p.entityId);
    const entities = ids.length ? await prisma.entity.findMany({ where: { id: { in: ids } } }) : [];
    const byId = new Map(entities.map((e) => [e.id, e]));
    return profiles.map((p) => ({ entity: byId.get(p.entityId) ?? null, profile: p }));
  },

  /** Entities that MATTER_TO_CONSTITUENCY this seat (stakeholders/issues). */
  async getStakeholders(constituencyEntityId: UUID) {
    const rels = await prisma.relationship.findMany({
      where: { targetEntityId: constituencyEntityId, type: RelationshipType.MATTERS_TO_CONSTITUENCY, isCurrent: true },
      orderBy: [{ influenceLevel: 'desc' }, { strength: 'desc' }],
    });
    const ids = [...new Set(rels.map((r) => r.sourceEntityId))];
    const entities = ids.length ? await prisma.entity.findMany({ where: { id: { in: ids } } }) : [];
    const byId = new Map(entities.map((e) => [e.id, e]));
    return rels.map((r) => ({
      entity: byId.get(r.sourceEntityId) ?? null,
      influenceLevel: r.influenceLevel,
      attitude: r.attitude,
      strength: r.strength,
      hasOwner: !!r.relationshipOwnerUserId || !!r.relationshipOwnerEntityId,
      lastInteractionAt: r.lastInteractionAt,
    }));
  },
};
