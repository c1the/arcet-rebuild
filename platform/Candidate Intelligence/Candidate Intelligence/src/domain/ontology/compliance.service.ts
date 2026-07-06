// =============================================================================
// compliance.service.ts — compliance flags, visibility restriction, action gating
// =============================================================================
import { prisma, type Tx } from './db.js';
import { AuditService } from './audit.service.js';
import { createComplianceFlagSchema } from './validators.js';
import {
  ComplianceFlagStatus,
  ActionStatus,
  ApprovalRequirement,
  DataClassification,
  Severity,
} from './enums.js';
import { complianceVisibilityFor, complianceFlagFor } from './rules.js';
import type { ActorContext, CreateComplianceFlagInput, UUID } from './types.js';

export const ComplianceService = {
  async createFlag(input: CreateComplianceFlagInput, actor?: ActorContext, tx?: Tx) {
    const data = createComplianceFlagSchema.parse(input);
    const client = tx ?? prisma;
    const flag = await client.complianceFlag.create({ data });
    await AuditService.record(
      { action: 'compliance.flag', objectType: 'ComplianceFlag', objectId: flag.id, entityId: flag.entityId, after: flag as never, actor },
      tx,
    );
    return flag;
  },

  /**
   * Apply the deterministic data-classification rules to a piece of evidence:
   * force visibility down where the classification is sensitive. Returns the
   * (possibly updated) evidence and the visibility that was enforced, if any.
   */
  async classifyEvidence(evidenceId: UUID, actor?: ActorContext) {
    const ev = await prisma.evidenceSource.findUniqueOrThrow({ where: { id: evidenceId } });
    const enforced = complianceVisibilityFor(ev.dataClassification as DataClassification);
    if (enforced && enforced !== ev.visibility) {
      const updated = await prisma.evidenceSource.update({ where: { id: evidenceId }, data: { visibility: enforced } });
      await AuditService.record(
        { action: 'compliance.restrict', objectType: 'EvidenceSource', objectId: evidenceId, before: { visibility: ev.visibility } as never, after: { visibility: enforced } as never, actor },
      );
      return { evidence: updated, enforcedVisibility: enforced };
    }
    return { evidence: ev, enforcedVisibility: null };
  },

  /**
   * Raise a compliance flag against an entity for a given data classification,
   * if the classification warrants one. Idempotent per (entity, flagType).
   */
  async flagEntityForClassification(entityId: UUID, classification: DataClassification, actor?: ActorContext) {
    const flagType = complianceFlagFor(classification);
    if (!flagType) return null;
    const existing = await prisma.complianceFlag.findFirst({ where: { entityId, flagType, status: { not: ComplianceFlagStatus.RESOLVED } } });
    if (existing) return existing;
    return this.createFlag(
      {
        entityId,
        flagType,
        severity: classification === DataClassification.SPECIAL_CATEGORY_RISK ? Severity.HIGH : Severity.MEDIUM,
        description: `Auto-flagged from data classification ${classification}.`,
      },
      actor,
    );
  },

  /** Gate an action behind compliance review if it relies on restricted data. */
  async gateActionForReview(actionId: UUID, actor?: ActorContext) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.actionRecommendation.findUniqueOrThrow({ where: { id: actionId } });
      const after = await tx.actionRecommendation.update({
        where: { id: actionId },
        data: { status: ActionStatus.BLOCKED, approvalRequirement: ApprovalRequirement.COMPLIANCE_REVIEW },
      });
      await AuditService.record(
        { action: 'compliance.gateAction', objectType: 'ActionRecommendation', objectId: actionId, before: before as never, after: after as never, actor },
        tx,
      );
      return after;
    });
  },

  async getAllFlags(limit = 50) {
    return prisma.complianceFlag.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  },

  async getFlagsForEntity(entityId: UUID) {
    return prisma.complianceFlag.findMany({ where: { entityId }, orderBy: { createdAt: 'desc' } });
  },

  async updateFlagStatus(flagId: UUID, status: ComplianceFlagStatus, actor?: ActorContext) {
    const after = await prisma.complianceFlag.update({ where: { id: flagId }, data: { status } });
    await AuditService.record({ action: 'compliance.flagStatus', objectType: 'ComplianceFlag', objectId: flagId, after: after as never, actor });
    return after;
  },
};
