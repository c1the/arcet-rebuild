// =============================================================================
// war-room-temporal.service.ts — change-driven command centre (§14.1)
// -----------------------------------------------------------------------------
// Composes the other temporal services (change, trend, decay, commitment, fptp,
// action) into the war-room briefing sections. Not a static dashboard — every
// section answers "what changed / what needs attention now".
// =============================================================================
import { prisma } from '../ontology/db.js';
import { ChangeService } from './change.service.js';
import { TrendService } from './trend.service.js';
import { CommitmentService } from './commitment.service.js';
import { RelationshipTemporalService } from './relationship-temporal.service.js';
import { FPTPTemporalService } from './fptp-temporal.service.js';
import { ActionTemporalService } from './action-temporal.service.js';
import { ChangeType } from './enums.js';
import type { RecentChangesFilters, WarRoomTemporalBriefing } from './types.js';

async function withEntityLabels<T extends { subjectEntityId: string; slopePerDay?: number; magnitude?: number }>(
  items: T[],
): Promise<(T & { label: string; delta: number })[]> {
  const ids = [...new Set(items.map((i) => i.subjectEntityId))];
  const entities = await prisma.entity.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
  const nameMap = new Map(entities.map((e) => [e.id, e.displayName]));
  return items.map((i) => ({
    ...i,
    label: nameMap.get(i.subjectEntityId) ?? i.subjectEntityId,
    delta: Math.round(Math.abs(i.slopePerDay ?? i.magnitude ?? 0) * 10) / 10,
  }));
}

async function withRelationshipLabels(items: { relationship: { id: string; sourceEntityId: string; targetEntityId: string }; decay: unknown }[]) {
  const ids = [...new Set(items.flatMap((i) => [i.relationship.sourceEntityId, i.relationship.targetEntityId]))];
  const entities = await prisma.entity.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
  const nameMap = new Map(entities.map((e) => [e.id, e.displayName]));
  return items.map((i) => ({
    ...i,
    id: i.relationship.id,
    label: `${nameMap.get(i.relationship.sourceEntityId) ?? '?'} — ${nameMap.get(i.relationship.targetEntityId) ?? '?'}`,
  }));
}

function sinceFrom(filters: RecentChangesFilters): Date {
  if (filters.sinceDate) return filters.sinceDate;
  return new Date(Date.now() - (filters.sinceDays ?? 7) * 86400000);
}

export const WarRoomTemporalService = {
  async getRecentChangesSummary(filters: RecentChangesFilters = {}) {
    return ChangeService.getChangesSince(sinceFrom(filters), { significantOnly: filters.significantOnly ?? true, limit: filters.limit ?? 100 });
  },

  async getTopWorseningRisks(filters: { limit?: number } = {}) {
    const trends = await TrendService.getFastestRisingRisks({ limit: filters.limit ?? 10 });
    return withEntityLabels(trends);
  },

  async getTopImprovingCandidates(filters: { limit?: number } = {}) {
    return TrendService.getTopImprovingCandidates({ limit: filters.limit ?? 10 });
  },

  async getDeterioratingCandidates(filters: { limit?: number } = {}) {
    return TrendService.getTopDeterioratingCandidates({ limit: filters.limit ?? 10 });
  },

  async getStaleHighValueRelationships(filters: { staleDays?: number; minStrength?: number } = {}) {
    const items = await RelationshipTemporalService.getStaleHighValueRelationships(filters);
    return withRelationshipLabels(items as never);
  },

  async getOverdueCommitments(filters: { limit?: number } = {}) {
    return CommitmentService.getOverdueCommitments(filters);
  },

  async getNewFactionRiskAlerts(filters: RecentChangesFilters = {}) {
    return ChangeService.getChangesSince(sinceFrom(filters), { changeType: ChangeType.FACTION_BECAME_MORE_HOSTILE, limit: filters.limit ?? 50 });
  },

  async getNewPolicyRadiusAlerts(filters: RecentChangesFilters = {}) {
    return ChangeService.getChangesSince(sinceFrom(filters), { changeType: ChangeType.POLICY_RADIUS_EXPANDED, limit: filters.limit ?? 50 });
  },

  async getStaleFPTPScenarios(filters: { limit?: number } = {}) {
    return FPTPTemporalService.detectStaleFPTPScenarios(filters);
  },

  async getCandidateSelectionChanges(filters: RecentChangesFilters = {}) {
    return ChangeService.getChangesSince(sinceFrom(filters), { changeType: [ChangeType.CANDIDATE_IMPROVED, ChangeType.CANDIDATE_DETERIORATED], limit: filters.limit ?? 50 });
  },

  async getWarRoomBriefing(filters: RecentChangesFilters = {}): Promise<WarRoomTemporalBriefing> {
    const since = sinceFrom(filters);
    const [
      recentChanges, worseningRisks, improvingCandidates, deterioratingCandidates,
      staleRelationships, overdueCommitments, staleFptpScenarios,
      newFactionRiskAlerts, newPolicyRadiusAlerts, actionsCreated, actionsCompleted, actionsOverdue,
    ] = await Promise.all([
      this.getRecentChangesSummary(filters),
      this.getTopWorseningRisks(),
      this.getTopImprovingCandidates(),
      this.getDeterioratingCandidates(),
      this.getStaleHighValueRelationships(),
      this.getOverdueCommitments(),
      this.getStaleFPTPScenarios({ limit: 25 }),
      this.getNewFactionRiskAlerts(filters),
      this.getNewPolicyRadiusAlerts(filters),
      ActionTemporalService.getActionsCreatedSince(since),
      ActionTemporalService.getActionsCompletedSince(since),
      ActionTemporalService.detectOverdueActions(),
    ]);
    const [labelledImproving, labelledDeteriorating] = await Promise.all([
      withEntityLabels(improvingCandidates),
      withEntityLabels(deterioratingCandidates),
    ]);
    return {
      since,
      recentChanges,
      worseningRisks,
      improvingCandidates: labelledImproving,
      deterioratingCandidates: labelledDeteriorating,
      staleRelationships,
      overdueCommitments,
      staleFptpScenarios,
      newFactionRiskAlerts,
      newPolicyRadiusAlerts,
      actionsCreated,
      actionsCompleted,
      actionsOverdue,
    };
  },
};
