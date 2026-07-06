// =============================================================================
// entity.service.ts
// =============================================================================
import { prisma, slugify, type Tx } from './db.js';
import { AuditService } from './audit.service.js';
import {
  createEntitySchema,
  updateEntitySchema,
  entitySearchSchema,
  personProfileSchema,
  organisationProfileSchema,
  constituencyProfileSchema,
  candidateProfileSchema,
  factionProfileSchema,
  issueProfileSchema,
  policyProfileSchema,
} from './validators.js';
import { EntityType, EntityStatus } from './enums.js';
import type {
  ActorContext,
  CreateEntityInput,
  UpdateEntityInput,
  EntitySearchFilters,
  UUID,
} from './types.js';
import type { z } from 'zod';

function arr<T>(v: T | T[] | undefined): T[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

export const EntityService = {
  async createEntity(input: CreateEntityInput, actor?: ActorContext, tx?: Tx) {
    const data = createEntitySchema.parse(input);
    const client = tx ?? prisma;
    const entity = await client.entity.create({
      data: {
        type: data.type,
        displayName: data.displayName,
        canonicalName: data.canonicalName ?? data.displayName,
        slug: data.slug ?? slugify(data.displayName),
        description: data.description,
        status: data.status ?? EntityStatus.ACTIVE,
        visibility: data.visibility,
        metadata: (data.metadata ?? undefined) as never,
        createdByUserId: actor?.userId,
        updatedByUserId: actor?.userId,
      },
    });
    await AuditService.record(
      { action: 'entity.create', objectType: 'Entity', objectId: entity.id, entityId: entity.id, after: entity as never, actor },
      tx,
    );
    return entity;
  },

  async updateEntity(id: UUID, input: UpdateEntityInput, actor?: ActorContext) {
    const data = updateEntitySchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const before = await tx.entity.findUniqueOrThrow({ where: { id } });
      const after = await tx.entity.update({
        where: { id },
        data: { ...data, metadata: (data.metadata ?? undefined) as never, updatedByUserId: actor?.userId },
      });
      await AuditService.record(
        { action: 'entity.update', objectType: 'Entity', objectId: id, entityId: id, before: before as never, after: after as never, actor },
        tx,
      );
      return after;
    });
  },

  async archiveEntity(id: UUID, actor?: ActorContext) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.entity.findUniqueOrThrow({ where: { id } });
      const after = await tx.entity.update({
        where: { id },
        data: { status: EntityStatus.ARCHIVED, archivedAt: new Date(), updatedByUserId: actor?.userId },
      });
      await AuditService.record(
        { action: 'entity.archive', objectType: 'Entity', objectId: id, entityId: id, before: before as never, after: after as never, actor },
        tx,
      );
      return after;
    });
  },

  async getEntity(id: UUID) {
    return prisma.entity.findUnique({
      where: { id },
      include: {
        personProfile: true,
        organisationProfile: true,
        constituencyProfile: true,
        candidateProfile: true,
        factionProfile: true,
        issueProfile: true,
        policyProfile: true,
        eventProfile: true,
        riskProfile: true,
      },
    });
  },

  async searchEntities(input: EntitySearchFilters & { query?: string }) {
    const f = entitySearchSchema.parse(input);
    return prisma.entity.findMany({
      where: {
        type: f.type ? { in: arr(f.type) } : undefined,
        status: f.status ? { in: arr(f.status) } : { not: EntityStatus.ARCHIVED },
        visibility: f.visibility ? { in: arr(f.visibility) } : undefined,
        OR: f.query
          ? [
              { displayName: { contains: f.query, mode: 'insensitive' } },
              { canonicalName: { contains: f.query, mode: 'insensitive' } },
              { description: { contains: f.query, mode: 'insensitive' } },
            ]
          : undefined,
      },
      take: f.limit ?? 50,
      skip: f.offset ?? 0,
      orderBy: { displayName: 'asc' },
    });
  },

  /**
   * Merge a duplicate entity into a primary entity: repoint graph edges, join
   * tables, and the common soft-pointer columns, then archive the duplicate.
   * Soft pointers stored in metadata are not swept and may need reconciliation.
   */
  async mergeEntities(primaryId: UUID, duplicateId: UUID, actor?: ActorContext) {
    if (primaryId === duplicateId) throw new Error('Cannot merge an entity into itself');
    return prisma.$transaction(async (tx) => {
      await tx.relationship.updateMany({ where: { sourceEntityId: duplicateId }, data: { sourceEntityId: primaryId } });
      await tx.relationship.updateMany({ where: { targetEntityId: duplicateId }, data: { targetEntityId: primaryId } });
      await tx.entityEvidence.updateMany({ where: { entityId: duplicateId }, data: { entityId: primaryId } }).catch(() => {});
      await tx.riskLink.updateMany({ where: { entityId: duplicateId }, data: { entityId: primaryId } }).catch(() => {});
      await tx.eventParticipant.updateMany({ where: { entityId: duplicateId }, data: { entityId: primaryId } }).catch(() => {});
      await tx.complianceFlag.updateMany({ where: { entityId: duplicateId }, data: { entityId: primaryId } });
      await tx.score.updateMany({ where: { subjectEntityId: duplicateId }, data: { subjectEntityId: primaryId } });
      await tx.score.updateMany({ where: { contextEntityId: duplicateId }, data: { contextEntityId: primaryId } });
      await tx.actionRecommendation.updateMany({ where: { targetEntityId: duplicateId }, data: { targetEntityId: primaryId } });

      const archived = await tx.entity.update({
        where: { id: duplicateId },
        data: {
          status: EntityStatus.ARCHIVED,
          archivedAt: new Date(),
          metadata: { mergedInto: primaryId } as never,
          updatedByUserId: actor?.userId,
        },
      });
      await AuditService.record(
        { action: 'entity.merge', objectType: 'Entity', objectId: duplicateId, entityId: primaryId, after: { mergedInto: primaryId } as never, actor },
        tx,
      );
      return archived;
    });
  },

  // ---- cross-cutting reads -------------------------------------------------

  async getEntitySummary(id: UUID) {
    const [entity, relCount, riskCount, actionCount, evidenceCount] = await Promise.all([
      this.getEntity(id),
      prisma.relationship.count({ where: { OR: [{ sourceEntityId: id }, { targetEntityId: id }], isCurrent: true } }),
      prisma.riskLink.count({ where: { entityId: id } }),
      prisma.actionRecommendation.count({ where: { targetEntityId: id } }),
      prisma.entityEvidence.count({ where: { entityId: id } }),
    ]);
    return { entity, counts: { relationships: relCount, risks: riskCount, actions: actionCount, evidence: evidenceCount } };
  },

  async getEntityTimeline(id: UUID) {
    return prisma.politicalEvent.findMany({
      where: { OR: [{ participants: { some: { entityId: id } } }, { constituencyEntityId: id }, { issueEntityId: id }] },
      orderBy: { occurredAt: 'desc' },
      include: { participants: true },
    });
  },

  async getEntityEvidence(id: UUID) {
    return prisma.entityEvidence.findMany({ where: { entityId: id }, include: { evidence: true } });
  },

  async getEntityRisks(id: UUID) {
    const links = await prisma.riskLink.findMany({ where: { entityId: id }, include: { risk: true } });
    return links.map((l) => ({ role: l.role, risk: l.risk }));
  },

  async getEntityActions(id: UUID) {
    return prisma.actionRecommendation.findMany({ where: { targetEntityId: id }, orderBy: { createdAt: 'desc' } });
  },

  // ---- typed-profile creation ---------------------------------------------
  // Each creates the base Entity (correct type) and the 1:1 profile atomically.

  async createPerson(
    entity: Omit<CreateEntityInput, 'type'>,
    profile: z.input<typeof personProfileSchema>,
    actor?: ActorContext,
  ) {
    const p = personProfileSchema.parse(profile);
    return prisma.$transaction(async (tx) => {
      const e = await this.createEntity({ ...entity, type: EntityType.PERSON }, actor, tx);
      const prof = await tx.personProfile.create({ data: { entityId: e.id, ...p } });
      return { entity: e, profile: prof };
    });
  },

  async createOrganisation(
    entity: Omit<CreateEntityInput, 'type'>,
    profile: z.input<typeof organisationProfileSchema>,
    actor?: ActorContext,
  ) {
    const p = organisationProfileSchema.parse(profile);
    return prisma.$transaction(async (tx) => {
      const e = await this.createEntity({ ...entity, type: EntityType.ORGANISATION }, actor, tx);
      const prof = await tx.organisationProfile.create({ data: { entityId: e.id, ...p } });
      return { entity: e, profile: prof };
    });
  },

  async createConstituency(
    entity: Omit<CreateEntityInput, 'type'>,
    profile: z.input<typeof constituencyProfileSchema>,
    actor?: ActorContext,
  ) {
    const p = constituencyProfileSchema.parse(profile);
    return prisma.$transaction(async (tx) => {
      const e = await this.createEntity({ ...entity, type: EntityType.CONSTITUENCY }, actor, tx);
      const prof = await tx.constituencyProfile.create({ data: { entityId: e.id, ...p } });
      return { entity: e, profile: prof };
    });
  },

  async createCandidate(
    entity: Omit<CreateEntityInput, 'type'>,
    profile: z.input<typeof candidateProfileSchema>,
    actor?: ActorContext,
  ) {
    const p = candidateProfileSchema.parse(profile);
    return prisma.$transaction(async (tx) => {
      const e = await this.createEntity({ ...entity, type: EntityType.CANDIDATE }, actor, tx);
      const prof = await tx.candidateProfile.create({ data: { entityId: e.id, ...p } });
      return { entity: e, profile: prof };
    });
  },

  async createFaction(
    entity: Omit<CreateEntityInput, 'type'>,
    profile: z.input<typeof factionProfileSchema>,
    actor?: ActorContext,
  ) {
    const p = factionProfileSchema.parse(profile);
    return prisma.$transaction(async (tx) => {
      const e = await this.createEntity({ ...entity, type: EntityType.FACTION }, actor, tx);
      const prof = await tx.factionProfile.create({ data: { entityId: e.id, ...p } });
      return { entity: e, profile: prof };
    });
  },

  async createIssue(
    entity: Omit<CreateEntityInput, 'type'>,
    profile: z.input<typeof issueProfileSchema>,
    actor?: ActorContext,
  ) {
    const p = issueProfileSchema.parse(profile);
    return prisma.$transaction(async (tx) => {
      const e = await this.createEntity({ ...entity, type: EntityType.ISSUE }, actor, tx);
      const prof = await tx.issueProfile.create({ data: { entityId: e.id, ...p } });
      return { entity: e, profile: prof };
    });
  },

  async createPolicy(
    entity: Omit<CreateEntityInput, 'type'>,
    profile: z.input<typeof policyProfileSchema>,
    actor?: ActorContext,
  ) {
    const p = policyProfileSchema.parse(profile);
    return prisma.$transaction(async (tx) => {
      const e = await this.createEntity({ ...entity, type: EntityType.POLICY }, actor, tx);
      const prof = await tx.policyProfile.create({
        data: { entityId: e.id, ...p, issueEntityIds: p.issueEntityIds ?? [] },
      });
      return { entity: e, profile: prof };
    });
  },
};
