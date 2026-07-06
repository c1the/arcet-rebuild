// =============================================================================
// evidence.service.ts — source/evidence creation and linking
// =============================================================================
import { prisma, type Tx } from './db.js';
import { AuditService } from './audit.service.js';
import { createEvidenceSchema } from './validators.js';
import { EvidenceRole } from './enums.js';
import type { ActorContext, CreateEvidenceInput, UUID } from './types.js';

export const EvidenceService = {
  async createEvidence(input: CreateEvidenceInput, actor?: ActorContext, tx?: Tx) {
    const data = createEvidenceSchema.parse(input);
    const client = tx ?? prisma;
    const ev = await client.evidenceSource.create({
      data: { ...data, addedByUserId: actor?.userId },
    });
    await AuditService.record(
      { action: 'evidence.create', objectType: 'EvidenceSource', objectId: ev.id, after: ev as never, actor },
      tx,
    );
    return ev;
  },

  async attachEvidenceToEntity(
    entityId: UUID,
    evidenceId: UUID,
    role: EvidenceRole = EvidenceRole.SUPPORTS,
    actor?: ActorContext,
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const link = await client.entityEvidence.upsert({
      where: { entityId_evidenceId: { entityId, evidenceId } },
      update: { evidenceRole: role },
      create: { entityId, evidenceId, evidenceRole: role },
    });
    await AuditService.record(
      { action: 'evidence.attachToEntity', objectType: 'EntityEvidence', objectId: link.id, entityId, actor },
      tx,
    );
    return link;
  },

  async attachEvidenceToRelationship(
    relationshipId: UUID,
    evidenceId: UUID,
    role: EvidenceRole = EvidenceRole.SUPPORTS,
    actor?: ActorContext,
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const link = await client.relationshipEvidence.upsert({
      where: { relationshipId_evidenceId: { relationshipId, evidenceId } },
      update: { evidenceRole: role },
      create: { relationshipId, evidenceId, evidenceRole: role },
    });
    await AuditService.record(
      { action: 'evidence.attachToRelationship', objectType: 'RelationshipEvidence', objectId: link.id, actor },
      tx,
    );
    return link;
  },

  async getEvidence(id: UUID) {
    return prisma.evidenceSource.findUnique({
      where: { id },
      include: { entityLinks: true, relationshipLinks: true },
    });
  },

  async getEvidenceForEntity(entityId: UUID) {
    const links = await prisma.entityEvidence.findMany({
      where: { entityId },
      include: { evidence: true },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((l) => ({ role: l.evidenceRole, evidence: l.evidence }));
  },

  async getEvidenceForRelationship(relationshipId: UUID) {
    const links = await prisma.relationshipEvidence.findMany({
      where: { relationshipId },
      include: { evidence: true },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((l) => ({ role: l.evidenceRole, evidence: l.evidence }));
  },
};
