// =============================================================================
// change.service.ts — meaningful before/after political changes (§6.4)
// -----------------------------------------------------------------------------
// AuditLog records every edit; TemporalChange records meaningful product/
// political change. Significance is decided by the pure rules engine.
// =============================================================================
import { prisma, type Tx } from '../ontology/db.js';
import { Confidence, ScoreType } from '../ontology/enums.js';
import { ChangeType } from './enums.js';
import { recordChangeSchema } from './validators.js';
import { isSignificantChange } from './rules.js';
import type { ActorContext, ChangeFilters, RecordChangeInput, UUID } from './types.js';

export const ChangeService = {
  async recordChange(input: RecordChangeInput, actor?: ActorContext, tx?: Tx) {
    const data = recordChangeSchema.parse(input);
    const client = tx ?? prisma;
    const significant = data.significant ?? isSignificantChange(data.changeType, data.deltaNumeric);
    return client.temporalChange.create({
      data: {
        entityId: data.entityId,
        relationshipId: data.relationshipId,
        riskId: data.riskId,
        scoreId: data.scoreId,
        actionRecommendationId: data.actionRecommendationId,
        candidateSeatAssessmentId: data.candidateSeatAssessmentId,
        fptpScenarioId: data.fptpScenarioId,
        policyImpactId: data.policyImpactId,
        changeType: data.changeType,
        fieldName: data.fieldName,
        oldValue: (data.oldValue ?? undefined) as never,
        newValue: (data.newValue ?? undefined) as never,
        deltaNumeric: data.deltaNumeric,
        changedAt: data.changedAt ?? new Date(),
        effectiveAt: data.effectiveAt,
        sourceModule: data.sourceModule,
        sourceTemporalEventId: data.sourceTemporalEventId,
        sourceEvidenceId: data.sourceEvidenceId,
        changedByUserId: actor?.userId,
        rationale: data.rationale,
        confidence: data.confidence ?? Confidence.LOW,
        significant,
      },
    });
  },

  async recordScoreChange(scoreId: UUID, oldValue: number, newValue: number, context: { entityId?: UUID; contextEntityId?: UUID; scoreType?: ScoreType; sourceModule?: string } = {}, actor?: ActorContext) {
    const delta = newValue - oldValue;
    return this.recordChange(
      {
        scoreId,
        entityId: context.entityId,
        changeType: delta >= 0 ? ChangeType.SCORE_INCREASED : ChangeType.SCORE_DECREASED,
        fieldName: context.scoreType,
        oldValue,
        newValue,
        deltaNumeric: delta,
        sourceModule: context.sourceModule,
        rationale: `${context.scoreType ?? 'score'} changed ${delta >= 0 ? '+' : ''}${delta}`,
      },
      actor,
    );
  },

  async recordRiskChange(riskId: UUID, oldSeverity: string, newSeverity: string, context: { entityId?: UUID } = {}, actor?: ActorContext) {
    const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const escalated = order.indexOf(newSeverity) > order.indexOf(oldSeverity);
    return this.recordChange(
      { riskId, entityId: context.entityId, changeType: escalated ? ChangeType.RISK_ESCALATED : ChangeType.RISK_DEESCALATED, fieldName: 'severity', oldValue: oldSeverity, newValue: newSeverity, rationale: `Risk severity ${oldSeverity} → ${newSeverity}`, significant: escalated },
      actor,
    );
  },

  async recordFPTPRecommendationChange(fptpScenarioId: UUID, oldLabel: string, newLabel: string, actor?: ActorContext) {
    return this.recordChange(
      { fptpScenarioId, changeType: ChangeType.FPTP_RECOMMENDATION_CHANGED, fieldName: 'recommendationLabel', oldValue: oldLabel, newValue: newLabel, rationale: `FPTP recommendation ${oldLabel} → ${newLabel}`, significant: true },
      actor,
    );
  },

  async getChangesForEntity(entityId: UUID, filters: ChangeFilters = {}) {
    return prisma.temporalChange.findMany({ where: { entityId, ...this._where(filters) }, orderBy: { changedAt: 'desc' }, take: filters.limit ?? 100 });
  },

  async getChangesSince(date: Date, filters: ChangeFilters = {}) {
    return prisma.temporalChange.findMany({ where: { changedAt: { gte: date }, ...this._where(filters) }, orderBy: { changedAt: 'desc' }, take: filters.limit ?? 200 });
  },

  async getSignificantChanges(filters: ChangeFilters = {}) {
    return prisma.temporalChange.findMany({ where: { significant: true, ...this._where(filters) }, orderBy: { changedAt: 'desc' }, take: filters.limit ?? 100 });
  },

  async explainChange(changeId: UUID) {
    const change = await prisma.temporalChange.findUnique({ where: { id: changeId } });
    if (!change) return null;
    const sourceEvent = change.sourceTemporalEventId ? await prisma.temporalEvent.findUnique({ where: { id: change.sourceTemporalEventId } }) : null;
    return { change, sourceEvent, rationale: change.rationale, evidenceId: change.sourceEvidenceId };
  },

  _where(filters: ChangeFilters) {
    const where: Record<string, unknown> = {};
    if (filters.changeType) where.changeType = Array.isArray(filters.changeType) ? { in: filters.changeType } : filters.changeType;
    if (filters.significantOnly) where.significant = true;
    if (filters.sourceModule) where.sourceModule = filters.sourceModule;
    if (filters.startDate || filters.endDate) where.changedAt = { ...(filters.startDate ? { gte: filters.startDate } : {}), ...(filters.endDate ? { lte: filters.endDate } : {}) };
    return where;
  },
};
