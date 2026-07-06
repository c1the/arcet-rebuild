// =============================================================================
// policy-radius-context.service.ts — policy blast-radius support (§15.8)
// -----------------------------------------------------------------------------
// Assembles affected entities for a policy and persists PolicyImpact records.
// The full blast-radius scoring model lives in a later module; here we provide
// the structured read/write surface it depends on.
// =============================================================================
import { prisma } from './db.js';
import { AuditService } from './audit.service.js';
import { savePolicyImpactSchema } from './validators.js';
import { EntityType, RelationshipType, PolicyImpactType } from './enums.js';
import type { ActorContext, SavePolicyImpactInput, UUID } from './types.js';

export const PolicyRadiusContextService = {
  async getPolicyContext(policyEntityId: UUID) {
    const [entity, profile, impacts] = await Promise.all([
      prisma.entity.findUnique({ where: { id: policyEntityId } }),
      prisma.policyProfile.findFirst({ where: { entityId: policyEntityId } }),
      prisma.policyImpact.findMany({ where: { policyEntityId } }),
    ]);
    return { entity, profile, impacts };
  },

  /** Issue entity ids this policy is linked to (soft pointer array). */
  async _policyIssueIds(policyEntityId: UUID): Promise<string[]> {
    const policy = await prisma.policyProfile.findFirst({ where: { entityId: policyEntityId } });
    return policy?.issueEntityIds ?? [];
  },

  /**
   * Entities associated with the policy's issues, narrowed to a target entity
   * type. Walks ISSUE -> (INTERESTED_IN | AFFECTED_BY | MATTERS_TO_CONSTITUENCY
   * | ASSOCIATED_WITH_ISSUE) -> entity, then filters by type.
   */
  async _affectedByType(policyEntityId: UUID, type: EntityType) {
    const issueIds = await this._policyIssueIds(policyEntityId);
    if (!issueIds.length) return [];
    const rels = await prisma.relationship.findMany({
      where: {
        OR: [{ sourceEntityId: { in: issueIds } }, { targetEntityId: { in: issueIds } }],
        type: { in: [RelationshipType.INTERESTED_IN, RelationshipType.AFFECTED_BY, RelationshipType.MATTERS_TO_CONSTITUENCY, RelationshipType.ASSOCIATED_WITH_ISSUE] },
        isCurrent: true,
      },
    });
    const candidateIds = new Set<string>();
    for (const r of rels) {
      if (issueIds.includes(r.sourceEntityId)) candidateIds.add(r.targetEntityId);
      if (issueIds.includes(r.targetEntityId)) candidateIds.add(r.sourceEntityId);
    }
    issueIds.forEach((i) => candidateIds.delete(i));
    if (!candidateIds.size) return [];
    return prisma.entity.findMany({ where: { id: { in: [...candidateIds] }, type } });
  },

  async getAffectedConstituencies(policyEntityId: UUID) {
    return this._affectedByType(policyEntityId, EntityType.CONSTITUENCY);
  },
  async getAffectedCandidates(policyEntityId: UUID) {
    return this._affectedByType(policyEntityId, EntityType.CANDIDATE);
  },
  async getAffectedStakeholders(policyEntityId: UUID) {
    return this._affectedByType(policyEntityId, EntityType.PERSON);
  },
  async getAffectedFactions(policyEntityId: UUID) {
    return this._affectedByType(policyEntityId, EntityType.FACTION);
  },

  async savePolicyImpact(input: SavePolicyImpactInput, actor?: ActorContext) {
    const data = savePolicyImpactSchema.parse(input);
    const impact = await prisma.policyImpact.create({ data });
    await AuditService.record(
      { action: 'policy.saveImpact', objectType: 'PolicyImpact', objectId: impact.id, entityId: impact.affectedEntityId, after: impact as never, actor },
    );
    return impact;
  },

  /**
   * Convenience: compute affected entities of every kind and persist a
   * PolicyImpact row for each. Direction/severity default to UNKNOWN/MEDIUM and
   * are expected to be refined by the scoring module later.
   */
  async materialiseImpacts(policyEntityId: UUID, actor?: ActorContext) {
    const groups: { type: PolicyImpactType; entities: { id: string }[] }[] = [
      { type: PolicyImpactType.AFFECTS_CONSTITUENCY, entities: await this.getAffectedConstituencies(policyEntityId) },
      { type: PolicyImpactType.AFFECTS_CANDIDATE, entities: await this.getAffectedCandidates(policyEntityId) },
      { type: PolicyImpactType.AFFECTS_STAKEHOLDER, entities: await this.getAffectedStakeholders(policyEntityId) },
      { type: PolicyImpactType.AFFECTS_FACTION, entities: await this.getAffectedFactions(policyEntityId) },
    ];
    const created = [];
    for (const g of groups) {
      for (const e of g.entities) {
        const exists = await prisma.policyImpact.count({ where: { policyEntityId, affectedEntityId: e.id, impactType: g.type } });
        if (exists === 0) {
          created.push(await this.savePolicyImpact({ policyEntityId, affectedEntityId: e.id, impactType: g.type }, actor));
        }
      }
    }
    return created;
  },

  async getPolicyActions(policyEntityId: UUID) {
    const impacts = await prisma.policyImpact.findMany({ where: { policyEntityId } });
    const impactIds = impacts.map((i) => i.id);
    return prisma.actionRecommendation.findMany({
      where: { OR: [{ relatedPolicyImpactId: { in: impactIds } }, { targetEntityId: policyEntityId }] },
      orderBy: [{ priority: 'desc' }],
    });
  },
};
