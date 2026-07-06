// =============================================================================
// crud.service.ts — relationship create/update/confirm/merge + tags/notes (§8.2)
// -----------------------------------------------------------------------------
// Wraps the ontology RelationshipService for the base edge, adds the graph
// extensions (tags, notes, confirm, merge). Every change writes AuditLog;
// meaningful updates write a TemporalChange.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { AuditService } from '../ontology/audit.service.js';
import { RelationshipService } from '../ontology/relationship.service.js';
import { EvidenceRole } from '../ontology/enums.js';
import { ChangeService } from '../temporal/change.service.js';
import { ChangeType } from '../temporal/enums.js';
import { RelationshipNoteType } from './enums.js';
import type { ActorContext, AddNoteInput, UUID } from './types.js';
import type { CreateRelationshipInput, UpdateRelationshipInput } from '../ontology/types.js';

export const RelationshipCrudService = {
  async createRelationship(input: CreateRelationshipInput, actor?: ActorContext) {
    return RelationshipService.createRelationship(input, actor);
  },

  async updateRelationship(relationshipId: UUID, input: UpdateRelationshipInput, actor?: ActorContext) {
    const before = await prisma.relationship.findUnique({ where: { id: relationshipId } });
    const rel = await RelationshipService.updateRelationship(relationshipId, input, actor);
    // Meaningful change records (strength / attitude) for the temporal graph.
    if (before && input.strength != null && input.strength !== before.strength) {
      await ChangeService.recordChange({ relationshipId, entityId: before.targetEntityId, changeType: input.strength >= before.strength ? ChangeType.RELATIONSHIP_STRENGTHENED : ChangeType.RELATIONSHIP_WEAKENED, fieldName: 'strength', oldValue: before.strength, newValue: input.strength, deltaNumeric: input.strength - before.strength, rationale: `Strength ${before.strength} → ${input.strength}`, sourceModule: 'relationship-graph', significant: Math.abs(input.strength - before.strength) >= 2 }, actor);
    }
    if (before && input.attitude && input.attitude !== before.attitude) {
      await ChangeService.recordChange({ relationshipId, entityId: before.targetEntityId, changeType: ChangeType.ATTITUDE_WORSENED, fieldName: 'attitude', oldValue: before.attitude, newValue: input.attitude, rationale: `Attitude ${before.attitude} → ${input.attitude}`, sourceModule: 'relationship-graph', significant: true }, actor);
    }
    return rel;
  },

  async archiveRelationship(relationshipId: UUID, actor?: ActorContext) {
    return RelationshipService.archiveRelationship(relationshipId, actor);
  },

  async confirmRelationship(relationshipId: UUID, evidenceId: UUID | undefined, actor?: ActorContext) {
    if (evidenceId) await RelationshipService.attachEvidence(relationshipId, evidenceId, EvidenceRole.SUPPORTS, actor).catch(() => undefined);
    const rel = await prisma.relationship.update({ where: { id: relationshipId }, data: { lastConfirmedAt: new Date(), lastConfirmedByUserId: actor?.userId } });
    await AuditService.record({ action: 'relationship.confirm', objectType: 'Relationship', objectId: relationshipId, after: { lastConfirmedAt: rel.lastConfirmedAt } as never, actor });
    return rel;
  },

  /** Merge a duplicate edge into a primary: move tags/notes/evidence, archive the duplicate. */
  async mergeDuplicateRelationships(primaryRelationshipId: UUID, duplicateRelationshipId: UUID, actor?: ActorContext) {
    await prisma.$transaction(async (tx) => {
      await tx.relationshipTag.updateMany({ where: { relationshipId: duplicateRelationshipId }, data: { relationshipId: primaryRelationshipId } }).catch(() => undefined);
      await tx.relationshipNote.updateMany({ where: { relationshipId: duplicateRelationshipId }, data: { relationshipId: primaryRelationshipId } });
      await tx.relationshipEvidence.updateMany({ where: { relationshipId: duplicateRelationshipId }, data: { relationshipId: primaryRelationshipId } }).catch(() => undefined);
      await tx.relationship.update({ where: { id: duplicateRelationshipId }, data: { isCurrent: false, validTo: new Date(), status: 'ARCHIVED' } });
    });
    await AuditService.record({ action: 'relationship.merge', objectType: 'Relationship', objectId: primaryRelationshipId, before: { duplicateRelationshipId } as never, actor });
    return prisma.relationship.findUnique({ where: { id: primaryRelationshipId }, include: { tags: true, notes: true } });
  },

  async attachEvidence(relationshipId: UUID, evidenceId: UUID, role: EvidenceRole = EvidenceRole.SUPPORTS, actor?: ActorContext) {
    return RelationshipService.attachEvidence(relationshipId, evidenceId, role, actor);
  },

  async addRelationshipNote(relationshipId: UUID, input: AddNoteInput, actor?: ActorContext) {
    const note = await prisma.relationshipNote.create({
      data: { relationshipId, noteType: (input.noteType ?? RelationshipNoteType.GENERAL) as never, body: input.body, visibility: (input.visibility ?? undefined) as never, dataClassification: (input.dataClassification ?? undefined) as never, createdByUserId: actor?.userId },
    });
    await AuditService.record({ action: 'relationship.note.create', objectType: 'RelationshipNote', objectId: note.id, entityId: relationshipId, actor });
    return note;
  },

  async getRelationshipNotes(relationshipId: UUID) {
    return prisma.relationshipNote.findMany({ where: { relationshipId }, orderBy: { createdAt: 'desc' } });
  },

  async addRelationshipTag(relationshipId: UUID, tag: string, actor?: ActorContext) {
    const t = await prisma.relationshipTag.upsert({ where: { relationshipId_tag: { relationshipId, tag } }, create: { relationshipId, tag, createdByUserId: actor?.userId }, update: {} });
    await AuditService.record({ action: 'relationship.tag.add', objectType: 'RelationshipTag', objectId: t.id, entityId: relationshipId, actor });
    return t;
  },

  async removeRelationshipTag(relationshipId: UUID, tag: string, actor?: ActorContext) {
    await prisma.relationshipTag.deleteMany({ where: { relationshipId, tag } });
    await AuditService.record({ action: 'relationship.tag.remove', objectType: 'RelationshipTag', objectId: tag, entityId: relationshipId, actor });
    return { relationshipId, tag, removed: true };
  },
};
