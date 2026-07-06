// =============================================================================
// compliance-temporal.service.ts — compliance auditability over time (§13.1)
// -----------------------------------------------------------------------------
// Answers: when was data added, what was known, who changed it, what evidence
// supported it, what compliance flags existed when an action was approved.
// Uses the ontology ComplianceService + AuditLog and the temporal change layer.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { ComplianceService } from '../ontology/compliance.service.js';
import { AuditService } from '../ontology/audit.service.js';
import { SnapshotService } from './snapshot.service.js';
import { ChangeService } from './change.service.js';
import { ChangeType, SnapshotType } from './enums.js';
import type { ActorContext, UUID } from './types.js';

export const ComplianceTemporalService = {
  async getComplianceTimeline(entityId: UUID) {
    const [flags, changes] = await Promise.all([
      ComplianceService.getFlagsForEntity(entityId),
      prisma.temporalChange.findMany({ where: { entityId, changeType: { in: [ChangeType.COMPLIANCE_FLAG_ADDED, ChangeType.COMPLIANCE_FLAG_RESOLVED] } }, orderBy: { changedAt: 'asc' } }),
    ]);
    return { flags, changes };
  },

  async getComplianceStateAsOf(entityId: UUID, asOfDate: Date) {
    // Flags created at-or-before the date and not resolved before it.
    const flags = await prisma.complianceFlag.findMany({ where: { entityId, createdAt: { lte: asOfDate } } });
    const activeAtDate = flags.filter((f) => f.status === 'OPEN' || (f.updatedAt && f.updatedAt > asOfDate));
    return { asOf: asOfDate, flagsActive: activeAtDate, allFlags: flags };
  },

  async recordComplianceFlagChange(flagId: UUID, oldStatus: string, newStatus: string, context: { entityId?: UUID } = {}, actor?: ActorContext) {
    const added = newStatus === 'OPEN';
    return ChangeService.recordChange(
      { entityId: context.entityId, changeType: added ? ChangeType.COMPLIANCE_FLAG_ADDED : ChangeType.COMPLIANCE_FLAG_RESOLVED, fieldName: 'complianceFlag.status', oldValue: oldStatus, newValue: newStatus, rationale: `Compliance flag ${oldStatus} → ${newStatus}`, significant: added, sourceModule: 'compliance' },
      actor,
    );
  },

  async getActionsUsingRestrictedData(entityId: UUID) {
    // Actions targeting an entity that currently carries a restrictive classification flag.
    const flags = await prisma.complianceFlag.findMany({ where: { entityId, status: 'OPEN' } });
    if (!flags.length) return [];
    return prisma.actionRecommendation.findMany({ where: { targetEntityId: entityId } });
  },

  async createComplianceSnapshot(entityId: UUID, actor?: ActorContext) {
    const state = await this.getComplianceStateAsOf(entityId, new Date());
    return SnapshotService.createEntitySnapshot({ entityId, snapshotType: SnapshotType.COMPLIANCE_CONTEXT, snapshotJson: state as never, sourceModule: 'compliance' }, actor);
  },

  /**
   * Audit trail for a decision object (e.g. an ActionRecommendation): the audit
   * log entries plus the compliance flags that were active when it was created.
   */
  async getAuditTrailForDecision(decisionObjectType: string, decisionObjectId: UUID) {
    const audit = await AuditService.getForObject(decisionObjectType, decisionObjectId);
    let complianceAtCreation: unknown[] = [];
    if (decisionObjectType === 'ActionRecommendation') {
      const action = await prisma.actionRecommendation.findUnique({ where: { id: decisionObjectId } });
      if (action?.targetEntityId) {
        complianceAtCreation = await prisma.complianceFlag.findMany({ where: { entityId: action.targetEntityId, createdAt: { lte: action.createdAt } } });
      }
    }
    return { decisionObjectType, decisionObjectId, audit, complianceAtCreation };
  },
};
