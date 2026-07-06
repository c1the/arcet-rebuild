// =============================================================================
// war-room-temporal.service.ts — change-driven command centre (§14.1)
// -----------------------------------------------------------------------------
// Composes the other temporal services (change, trend, decay, commitment, fptp,
// action) into the war-room briefing sections. Not a static dashboard — every
// section answers "what changed / what needs attention now".
// =============================================================================
import { ChangeService } from './change.service.js';
import { TrendService } from './trend.service.js';
import { CommitmentService } from './commitment.service.js';
import { RelationshipTemporalService } from './relationship-temporal.service.js';
import { FPTPTemporalService } from './fptp-temporal.service.js';
import { ActionTemporalService } from './action-temporal.service.js';
import { ChangeType } from './enums.js';
import type { RecentChangesFilters, WarRoomTemporalBriefing } from './types.js';

function sinceFrom(filters: RecentChangesFilters): Date {
  if (filters.sinceDate) return filters.sinceDate;
  return new Date(Date.now() - (filters.sinceDays ?? 7) * 86400000);
}

export const WarRoomTemporalService = {
  async getRecentChangesSummary(filters: RecentChangesFilters = {}) {
    return ChangeService.getChangesSince(sinceFrom(filters), { significantOnly: filters.significantOnly ?? true, limit: filters.limit ?? 100 });
  },

  async getTopWorseningRisks(filters: { limit?: number } = {}) {
    return TrendService.getFastestRisingRisks({ limit: filters.limit ?? 10 });
  },

  async getTopImprovingCandidates(filters: { limit?: number } = {}) {
    return TrendService.getTopImprovingCandidates({ limit: filters.limit ?? 10 });
  },

  async getDeterioratingCandidates(filters: { limit?: number } = {}) {
    return TrendService.getTopDeterioratingCandidates({ limit: filters.limit ?? 10 });
  },

  async getStaleHighValueRelationships(filters: { staleDays?: number; minStrength?: number } = {}) {
    return RelationshipTemporalService.getStaleHighValueRelationships(filters);
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
    return {
      since,
      recentChanges,
      worseningRisks,
      improvingCandidates,
      deterioratingCandidates,
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
