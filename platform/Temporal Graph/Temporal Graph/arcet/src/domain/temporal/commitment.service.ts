// =============================================================================
// commitment.service.ts — commitments (promises) with lifecycle + urgency (§5.7)
// =============================================================================
import { prisma } from '../ontology/db.js';
import { AuditService } from '../ontology/audit.service.js';
import { Confidence, Visibility } from '../ontology/enums.js';
import { CommitmentStatus, CommitmentType, Sensitivity } from './enums.js';
import { createCommitmentSchema, updateCommitmentSchema } from './validators.js';
import { commitmentUrgency } from './rules.js';
import type { ActorContext, CreateCommitmentInput, UpdateCommitmentInput, UUID } from './types.js';

export const CommitmentService = {
  async createCommitment(input: CreateCommitmentInput, actor?: ActorContext) {
    const data = createCommitmentSchema.parse(input);
    const c = await prisma.commitment.create({
      data: {
        fromEntityId: data.fromEntityId,
        toEntityId: data.toEntityId,
        relatedIssueEntityId: data.relatedIssueEntityId,
        relatedConstituencyEntityId: data.relatedConstituencyEntityId,
        relatedPolicyEntityId: data.relatedPolicyEntityId,
        relatedCandidateEntityId: data.relatedCandidateEntityId,
        title: data.title,
        description: data.description,
        commitmentType: data.commitmentType ?? CommitmentType.OTHER,
        status: data.status ?? CommitmentStatus.OPEN,
        createdFromEventId: data.createdFromEventId,
        createdFromEvidenceId: data.createdFromEvidenceId,
        promisedAt: data.promisedAt,
        dueAt: data.dueAt,
        sensitivity: data.sensitivity ?? Sensitivity.NORMAL,
        visibility: data.visibility ?? Visibility.CLIENT_PRIVATE,
        confidence: data.confidence ?? Confidence.LOW,
        ownerUserId: data.ownerUserId,
      },
    });
    await AuditService.record({ action: 'commitment.create', objectType: 'Commitment', objectId: c.id, after: c as never, actor });
    return c;
  },

  async updateCommitment(id: UUID, input: UpdateCommitmentInput, actor?: ActorContext) {
    const data = updateCommitmentSchema.parse(input);
    const before = await prisma.commitment.findUnique({ where: { id } });
    const c = await prisma.commitment.update({ where: { id }, data: { ...data } as never });
    await AuditService.record({ action: 'commitment.update', objectType: 'Commitment', objectId: id, before: before as never, after: c as never, actor });
    return c;
  },

  async completeCommitment(id: UUID, actor?: ActorContext) {
    const c = await prisma.commitment.update({ where: { id }, data: { status: CommitmentStatus.COMPLETED, completedAt: new Date() } });
    await AuditService.record({ action: 'commitment.complete', objectType: 'Commitment', objectId: id, after: c as never, actor });
    return c;
  },

  async getCommitment(id: UUID) {
    return prisma.commitment.findUnique({ where: { id } });
  },

  async getCommitmentsForEntity(entityId: UUID) {
    return prisma.commitment.findMany({
      where: { OR: [{ fromEntityId: entityId }, { toEntityId: entityId }, { relatedCandidateEntityId: entityId }, { relatedConstituencyEntityId: entityId }] },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    });
  },

  async getOverdueCommitments(filters: { asOfDate?: Date; limit?: number } = {}) {
    const asOf = filters.asOfDate ?? new Date();
    const open = await prisma.commitment.findMany({
      where: { status: { in: [CommitmentStatus.OPEN, CommitmentStatus.IN_PROGRESS, CommitmentStatus.OVERDUE] }, dueAt: { lt: asOf } },
      orderBy: { dueAt: 'asc' },
      take: filters.limit ?? 100,
    });
    return open.map((c) => ({ commitment: c, urgency: commitmentUrgency({ commitmentId: c.id, status: c.status, dueAt: c.dueAt }, asOf.getTime()) }));
  },

  /** Mark open/in-progress commitments past due as OVERDUE (scheduled sweep). */
  async markOverdue(asOfDate?: Date, actor?: ActorContext) {
    const asOf = asOfDate ?? new Date();
    const due = await prisma.commitment.findMany({ where: { status: { in: [CommitmentStatus.OPEN, CommitmentStatus.IN_PROGRESS] }, dueAt: { lt: asOf } } });
    for (const c of due) {
      await prisma.commitment.update({ where: { id: c.id }, data: { status: CommitmentStatus.OVERDUE } });
      await AuditService.record({ action: 'commitment.overdue', objectType: 'Commitment', objectId: c.id, actor });
    }
    return due.length;
  },
};
