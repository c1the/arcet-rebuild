// =============================================================================
// faction-temporal.service.ts — faction-risk over time (§10.1)
// -----------------------------------------------------------------------------
// Faction risk is highly temporal. Uses FactionContextService for current state
// and the temporal layer + faction escalation rule for movement and triggers.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { FactionContextService } from '../ontology/faction-context.service.js';
import { RiskService } from '../ontology/risk.service.js';
import { TimelineService } from './timeline.service.js';
import { TrendService } from './trend.service.js';
import { ChangeService } from './change.service.js';
import { ObservationService } from './observation.service.js';
import { factionEscalation } from './rules.js';
import { ObservationType, TemporalEntityRole } from './enums.js';
import type { ActorContext, TimelineFilters, UUID } from './types.js';

export const FactionTemporalService = {
  async getFactionTimeline(factionEntityId: UUID, filters: TimelineFilters = {}) {
    return TimelineService.getTimelineForFaction(factionEntityId, filters);
  },
  async getFactionMoodTrend(factionEntityId: UUID) {
    return TrendService.calculateFactionMoodTrend(factionEntityId);
  },
  async getFactionRiskTrend(factionEntityId: UUID) {
    return TrendService.calculateTrend(factionEntityId, ObservationType.FACTION_RISK);
  },
  async getFactionActivitySince(factionEntityId: UUID, sinceDate: Date) {
    const links = await prisma.temporalEventEntity.findMany({ where: { entityId: factionEntityId, role: TemporalEntityRole.FACTION_CONTEXT }, select: { temporalEventId: true } });
    const ids = links.map((l) => l.temporalEventId);
    return prisma.temporalEvent.findMany({ where: { id: { in: ids }, occurredAt: { gte: sinceDate } }, orderBy: { occurredAt: 'desc' } });
  },

  /**
   * Detect faction escalation: ≥2 high-influence faction figures opposing the
   * same candidate within a window, or an overdue commitment to a faction
   * member. Persists a TemporalChange + Risk via the rules engine.
   */
  async detectFactionEscalation(input: { subjectEntityId: UUID; factionEntityId: UUID; factionName: string; hostileHighInfluenceOpponentsInWindow: number; overdueCommitmentToFactionMember: boolean }, actor?: ActorContext) {
    const { risks, changes } = factionEscalation(input);
    for (const ch of changes) {
      await ChangeService.recordChange({ entityId: input.subjectEntityId, changeType: ch.changeType, rationale: ch.rationale, significant: ch.significant, sourceModule: 'faction' }, actor);
      await ObservationService.recordObservation({ subjectEntityId: input.factionEntityId, contextEntityId: input.subjectEntityId, observationType: ObservationType.FACTION_RISK, valueNumeric: 70, sourceModule: 'faction' }, actor);
    }
    for (const r of risks) {
      await RiskService.createRisk({ riskType: r.riskType, title: r.title, severity: r.severity, likelihood: r.likelihood, urgency: r.urgency, sourceModule: 'faction', rationale: r.rationale, links: r.links }, actor);
    }
    return { risks, changes };
  },

  async getFactionEventsLinkedToCandidate(candidateEntityId: UUID) {
    const links = await prisma.temporalEventEntity.findMany({ where: { entityId: candidateEntityId }, select: { temporalEventId: true } });
    const ids = links.map((l) => l.temporalEventId);
    return prisma.temporalEvent.findMany({ where: { id: { in: ids }, eventType: 'FACTION_MOOD_CHANGED' }, orderBy: { occurredAt: 'desc' } });
  },

  async getCurrentFactionMap(factionEntityId: UUID) {
    return FactionContextService.getFactionMap(factionEntityId);
  },
};
