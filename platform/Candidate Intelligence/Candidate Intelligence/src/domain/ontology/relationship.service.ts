// =============================================================================
// relationship.service.ts
// =============================================================================
import { prisma, type Tx } from './db.js';
import { AuditService } from './audit.service.js';
import { createRelationshipSchema, updateRelationshipSchema } from './validators.js';
import { RelationshipType, InfluenceLevel, EvidenceRole } from './enums.js';
import type {
  ActorContext,
  CreateRelationshipInput,
  UpdateRelationshipInput,
  RelationshipFilters,
  RelationshipGraph,
  GraphNode,
  GraphEdge,
  RelationshipGap,
  UUID,
} from './types.js';

const DAY = 24 * 60 * 60 * 1000;

function inArr<T>(v: T | T[] | undefined) {
  if (v === undefined) return undefined;
  return { in: Array.isArray(v) ? v : [v] };
}

export const RelationshipService = {
  async createRelationship(input: CreateRelationshipInput, actor?: ActorContext, tx?: Tx) {
    const data = createRelationshipSchema.parse(input);
    const client = tx ?? prisma;
    const rel = await client.relationship.create({
      data: { ...data, createdByUserId: actor?.userId, updatedByUserId: actor?.userId },
    });
    await AuditService.record(
      { action: 'relationship.create', objectType: 'Relationship', objectId: rel.id, after: rel as never, actor },
      tx,
    );
    return rel;
  },

  async updateRelationship(id: UUID, input: UpdateRelationshipInput, actor?: ActorContext) {
    const data = updateRelationshipSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const before = await tx.relationship.findUniqueOrThrow({ where: { id } });
      const after = await tx.relationship.update({ where: { id }, data: { ...data, updatedByUserId: actor?.userId } });
      await AuditService.record(
        { action: 'relationship.update', objectType: 'Relationship', objectId: id, before: before as never, after: after as never, actor },
        tx,
      );
      return after;
    });
  },

  async archiveRelationship(id: UUID, actor?: ActorContext) {
    return prisma.$transaction(async (tx) => {
      const after = await tx.relationship.update({ where: { id }, data: { isCurrent: false, validTo: new Date() } });
      await AuditService.record(
        { action: 'relationship.archive', objectType: 'Relationship', objectId: id, after: after as never, actor },
        tx,
      );
      return after;
    });
  },

  async getRelationship(id: UUID) {
    return prisma.relationship.findUnique({ where: { id }, include: { evidenceLinks: { include: { evidence: true } } } });
  },

  async getRelationshipsForEntity(entityId: UUID, filters: RelationshipFilters = {}) {
    const dir = filters.direction ?? 'any';
    const endpoint =
      dir === 'out'
        ? { sourceEntityId: entityId }
        : dir === 'in'
          ? { targetEntityId: entityId }
          : { OR: [{ sourceEntityId: entityId }, { targetEntityId: entityId }] };
    return prisma.relationship.findMany({
      where: {
        ...endpoint,
        type: inArr(filters.type),
        attitude: inArr(filters.attitude),
        confidence: inArr(filters.confidence),
        influenceLevel: inArr(filters.influenceLevel),
        isCurrent: filters.isCurrent,
        lastInteractionAt: filters.staleBeforeDays
          ? { lt: new Date(Date.now() - filters.staleBeforeDays * DAY) }
          : undefined,
      },
      orderBy: { strength: 'desc' },
    });
  },

  /** Breadth-first neighbourhood around an entity, bounded by depth. */
  async getRelationshipGraph(entityId: UUID, depth = 1, filters: RelationshipFilters = {}): Promise<RelationshipGraph> {
    const nodes = new Map<string, GraphNode>();
    const edges = new Map<string, GraphEdge>();
    let frontier = new Set<string>([entityId]);
    const visited = new Set<string>();

    for (let d = 0; d <= depth; d++) {
      const ids = [...frontier].filter((id) => !visited.has(id));
      ids.forEach((id) => visited.add(id));
      if (ids.length === 0) break;

      const rels = await prisma.relationship.findMany({
        where: {
          OR: [{ sourceEntityId: { in: ids } }, { targetEntityId: { in: ids } }],
          type: inArr(filters.type),
          attitude: inArr(filters.attitude),
          confidence: inArr(filters.confidence),
          isCurrent: filters.isCurrent ?? true,
        },
      });

      const next = new Set<string>();
      for (const r of rels) {
        edges.set(r.id, {
          id: r.id,
          sourceEntityId: r.sourceEntityId,
          targetEntityId: r.targetEntityId,
          type: r.type as RelationshipType,
          strength: r.strength,
          attitude: r.attitude as never,
          influenceLevel: r.influenceLevel as never,
          isCurrent: r.isCurrent,
          lastInteractionAt: r.lastInteractionAt,
        });
        for (const nid of [r.sourceEntityId, r.targetEntityId]) if (!visited.has(nid)) next.add(nid);
      }
      frontier = next;
    }

    const entityIds = new Set<string>([entityId, ...[...edges.values()].flatMap((e) => [e.sourceEntityId, e.targetEntityId])]);
    const entities = await prisma.entity.findMany({ where: { id: { in: [...entityIds] } }, select: { id: true, type: true, displayName: true } });
    const depthOf = (id: string) => (id === entityId ? 0 : 1); // simplified depth attribution
    for (const e of entities) nodes.set(e.id, { entityId: e.id, type: e.type as never, displayName: e.displayName, depth: depthOf(e.id) });

    return { rootEntityId: entityId, nodes: [...nodes.values()], edges: [...edges.values()] };
  },

  /** Relationships that are valuable (strong/influential) but have gone cold. */
  async getStaleRelationships(filters: { staleDays?: number; minStrength?: number } = {}) {
    const staleDays = filters.staleDays ?? 90;
    const minStrength = filters.minStrength ?? 4;
    return prisma.relationship.findMany({
      where: {
        isCurrent: true,
        strength: { gte: minStrength },
        OR: [{ lastInteractionAt: { lt: new Date(Date.now() - staleDays * DAY) } }, { lastInteractionAt: null }],
      },
      orderBy: [{ influenceLevel: 'desc' }, { strength: 'desc' }],
    });
  },

  /**
   * Detect actionable relationship gaps. `context` is a constituency or
   * candidate entity id; the relevant checks run for whichever is supplied.
   */
  async getRelationshipGaps(context: { constituencyEntityId?: UUID; candidateEntityId?: UUID; staleDays?: number }): Promise<RelationshipGap[]> {
    const gaps: RelationshipGap[] = [];
    const staleDays = context.staleDays ?? 90;

    if (context.constituencyEntityId) {
      const cid = context.constituencyEntityId;
      // Stakeholders that matter to this constituency but lack a relationship owner.
      const mattering = await prisma.relationship.findMany({
        where: { targetEntityId: cid, type: RelationshipType.MATTERS_TO_CONSTITUENCY, isCurrent: true },
      });
      for (const r of mattering) {
        const owned = await prisma.relationship.count({
          where: { sourceEntityId: r.sourceEntityId, type: RelationshipType.OWNS_RELATIONSHIP_WITH, isCurrent: true },
        });
        const hasOwnerField = !!r.relationshipOwnerUserId || !!r.relationshipOwnerEntityId;
        if (owned === 0 && !hasOwnerField) {
          gaps.push({
            kind: 'STAKEHOLDER_NO_OWNER',
            subjectEntityId: r.sourceEntityId,
            relatedEntityId: cid,
            description: 'Stakeholder matters to the constituency but has no relationship owner assigned.',
          });
        }
      }
      // High-influence connections to the constituency not contacted recently.
      const highInfluence = await prisma.relationship.findMany({
        where: {
          OR: [{ sourceEntityId: cid }, { targetEntityId: cid }],
          influenceLevel: { in: [InfluenceLevel.HIGH, InfluenceLevel.CRITICAL] },
          isCurrent: true,
        },
      });
      for (const r of highInfluence) {
        const cold = !r.lastInteractionAt || r.lastInteractionAt.getTime() < Date.now() - staleDays * DAY;
        if (cold) {
          gaps.push({
            kind: 'HIGH_INFLUENCE_NOT_CONTACTED',
            subjectEntityId: r.sourceEntityId === cid ? r.targetEntityId : r.sourceEntityId,
            relatedEntityId: cid,
            description: 'High-influence stakeholder has not been contacted within the staleness window.',
          });
        }
      }
    }

    if (context.candidateEntityId) {
      const candId = context.candidateEntityId;
      const cand = await prisma.candidateProfile.findFirst({ where: { entityId: candId } });
      const targetConstituency = cand?.currentTargetConstituencyId;

      // Candidate has no link to a local association in the target constituency.
      if (targetConstituency) {
        const assocOrgs = await prisma.organisationProfile.findMany({
          where: { organisationType: 'LOCAL_PARTY_ASSOCIATION', primaryConstituencyId: targetConstituency },
          select: { entityId: true },
        });
        const assocIds = assocOrgs.map((o) => o.entityId);
        const linkedToAssoc = assocIds.length
          ? await prisma.relationship.count({
              where: { sourceEntityId: candId, targetEntityId: { in: assocIds }, isCurrent: true },
            })
          : 0;
        if (assocIds.length > 0 && linkedToAssoc === 0) {
          gaps.push({
            kind: 'CANDIDATE_NO_LOCAL_ASSOCIATION_LINK',
            subjectEntityId: candId,
            relatedEntityId: assocIds[0],
            description: 'Candidate has no relationship with the local party association in the target seat.',
          });
        }
      }

      // Weak stakeholder coverage in the target seat.
      if (cand && (cand.stakeholderStrengthScore ?? 0) < 40) {
        gaps.push({
          kind: 'CANDIDATE_WEAK_STAKEHOLDER_COVERAGE',
          subjectEntityId: candId,
          relatedEntityId: targetConstituency ?? undefined,
          description: 'Candidate stakeholder strength score is below threshold for the target seat.',
        });
      }
    }

    return gaps;
  },

  async attachEvidence(relationshipId: UUID, evidenceId: UUID, evidenceRole: EvidenceRole = EvidenceRole.SUPPORTS, actor?: ActorContext) {
    const link = await prisma.relationshipEvidence.upsert({
      where: { relationshipId_evidenceId: { relationshipId, evidenceId } },
      update: { evidenceRole },
      create: { relationshipId, evidenceId, evidenceRole },
    });
    await AuditService.record({ action: 'relationship.attachEvidence', objectType: 'RelationshipEvidence', objectId: link.id, actor });
    return link;
  },

  /** When an interaction event occurs, bump lastInteractionAt on edges between participants. */
  async updateRelationshipFromEvent(eventId: UUID, actor?: ActorContext) {
    const event = await prisma.politicalEvent.findUniqueOrThrow({ where: { id: eventId }, include: { participants: true } });
    const ids = event.participants.map((p) => p.entityId);
    if (ids.length < 2) return { updated: 0 };
    const res = await prisma.relationship.updateMany({
      where: { sourceEntityId: { in: ids }, targetEntityId: { in: ids }, isCurrent: true },
      data: { lastInteractionAt: event.occurredAt },
    });
    await AuditService.record({ action: 'relationship.updateFromEvent', objectType: 'PoliticalEvent', objectId: eventId, after: { updated: res.count } as never, actor });
    return { updated: res.count };
  },
};
