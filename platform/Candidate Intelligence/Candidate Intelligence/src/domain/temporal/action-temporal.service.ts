// =============================================================================
// action-temporal.service.ts — action lifecycle + outcomes over time (§12.1)
// -----------------------------------------------------------------------------
// Recommendations are not static: they expire, become urgent, or get replaced.
// Records status changes as temporal events + changes, detects overdue/stale
// recommendations, and feeds completed-action outcomes back into the graph.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { ActionService } from '../ontology/action.service.js';
import { TemporalEventService } from './temporal-event.service.js';
import { ChangeService } from './change.service.js';
import { ObservationService } from './observation.service.js';
import { ChangeType, ObservationType, TemporalEventType } from './enums.js';
import type { ActorContext, UUID } from './types.js';

export type ActionOutcome = 'SUCCESSFUL' | 'UNSUCCESSFUL' | 'PARTIAL' | 'NO_RESPONSE' | 'RELATIONSHIP_IMPROVED' | 'RELATIONSHIP_WORSENED' | 'RISK_MITIGATED' | 'NEW_RISK_CREATED' | 'FOLLOW_UP_REQUIRED';

export const ActionTemporalService = {
  async getActionTimeline(actionRecommendationId: UUID) {
    return prisma.temporalChange.findMany({ where: { actionRecommendationId }, orderBy: { changedAt: 'asc' } });
  },

  async recordActionStatusChange(actionId: UUID, oldStatus: string, newStatus: string, actor?: ActorContext) {
    const eventType = newStatus === 'COMPLETED' ? TemporalEventType.ACTION_COMPLETED : newStatus === 'ASSIGNED' ? TemporalEventType.ACTION_ASSIGNED : TemporalEventType.ACTION_RECOMMENDED;
    const event = await TemporalEventService.createEventFromAction(actionId, eventType, actor);
    await ChangeService.recordChange({ actionRecommendationId: actionId, changeType: ChangeType.STATUS_CHANGED, fieldName: 'status', oldValue: oldStatus, newValue: newStatus, sourceTemporalEventId: event.id, sourceModule: 'action', rationale: `Action status ${oldStatus} → ${newStatus}` }, actor);
    return event;
  },

  async detectOverdueActions(filters: { limit?: number } = {}) {
    return prisma.actionRecommendation.findMany({
      where: { status: { in: ['RECOMMENDED', 'ASSIGNED', 'IN_PROGRESS'] }, dueDate: { lt: new Date() } },
      orderBy: { dueDate: 'asc' },
      take: filters.limit ?? 100,
    });
  },

  /** Stale if the due date passed or the linked risk is resolved. */
  async detectStaleRecommendations(filters: { limit?: number } = {}) {
    const open = await prisma.actionRecommendation.findMany({ where: { status: { in: ['RECOMMENDED', 'ASSIGNED'] } }, take: filters.limit ?? 200 });
    const out = [];
    for (const a of open) {
      const reasons: string[] = [];
      if (a.dueDate && a.dueDate < new Date()) reasons.push('due date passed');
      if (a.relatedRiskId) {
        const risk = await prisma.risk.findUnique({ where: { id: a.relatedRiskId } });
        if (risk && (risk.status === 'RESOLVED' || risk.status === 'DISMISSED')) reasons.push('underlying risk resolved');
      }
      if (reasons.length) out.push({ action: a, reasons });
    }
    return out;
  },

  async getActionsCreatedSince(date: Date, filters: { limit?: number } = {}) {
    return prisma.actionRecommendation.findMany({ where: { createdAt: { gte: date } }, orderBy: { createdAt: 'desc' }, take: filters.limit ?? 200 });
  },

  async getActionsCompletedSince(date: Date, filters: { limit?: number } = {}) {
    return prisma.actionRecommendation.findMany({ where: { completedAt: { gte: date } }, orderBy: { completedAt: 'desc' }, take: filters.limit ?? 200 });
  },

  /**
   * Outcome learning (§12.3): a completed action feeds back into the graph.
   * Records the outcome as an observation + change on the target entity.
   */
  async linkActionOutcomeToGraph(actionId: UUID, outcome: ActionOutcome, actor?: ActorContext) {
    const action = await prisma.actionRecommendation.findUnique({ where: { id: actionId } });
    if (!action) throw new Error('ActionRecommendation not found');
    const target = action.targetEntityId;
    if (target) {
      if (outcome === 'RELATIONSHIP_IMPROVED') {
        await ChangeService.recordChange({ entityId: target, changeType: ChangeType.RELATIONSHIP_STRENGTHENED, rationale: `Action "${action.title}" improved the relationship.`, sourceModule: 'action', significant: false }, actor);
      } else if (outcome === 'RISK_MITIGATED') {
        await ChangeService.recordChange({ entityId: target, changeType: ChangeType.RISK_DEESCALATED, rationale: `Action "${action.title}" mitigated a risk.`, sourceModule: 'action', significant: true }, actor);
      } else if (outcome === 'RELATIONSHIP_WORSENED' || outcome === 'NEW_RISK_CREATED') {
        await ChangeService.recordChange({ entityId: target, changeType: ChangeType.ATTITUDE_WORSENED, rationale: `Action "${action.title}" had a negative outcome (${outcome}).`, sourceModule: 'action', significant: true }, actor);
      }
      await ObservationService.recordObservation({ subjectEntityId: target, actionRecommendationId: actionId, observationType: ObservationType.ACTION_PRIORITY, valueText: outcome, sourceModule: 'action' }, actor);
    }
    return { actionId, outcome };
  },
};
