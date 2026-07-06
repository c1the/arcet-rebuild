// =============================================================================
// constituency-temporal.service.ts — constituency change over time
// =============================================================================
import { ConstituencyContextService } from '../ontology/constituency-context.service.js';
import { TimelineService } from './timeline.service.js';
import { TrendService } from './trend.service.js';
import { TemporalQueryService } from './temporal-query.service.js';
import { ObservationType } from './enums.js';
import type { TimelineFilters, UUID } from './types.js';

export const ConstituencyTemporalService = {
  async getConstituencyTimeline(constituencyEntityId: UUID, filters: TimelineFilters = {}) {
    return TimelineService.getTimelineForConstituency(constituencyEntityId, filters);
  },
  async getConstituencyCompetitivenessTrend(constituencyEntityId: UUID) {
    return TrendService.calculateTrend(constituencyEntityId, ObservationType.CONSTITUENCY_COMPETITIVENESS);
  },
  async getLocalPartyStrengthTrend(constituencyEntityId: UUID) {
    return TrendService.calculateTrend(constituencyEntityId, ObservationType.LOCAL_PARTY_STRENGTH);
  },
  async getConstituencyChangesSince(constituencyEntityId: UUID, sinceDate: Date) {
    return TemporalQueryService.getWhatChangedSince(constituencyEntityId, sinceDate);
  },
  async getConstituencyContextAsOf(constituencyEntityId: UUID, asOfDate: Date) {
    return TemporalQueryService.getConstituencyContextAsOf(constituencyEntityId, asOfDate);
  },
  async getCurrentContext(constituencyEntityId: UUID) {
    return ConstituencyContextService.getConstituencyContext(constituencyEntityId);
  },
};
