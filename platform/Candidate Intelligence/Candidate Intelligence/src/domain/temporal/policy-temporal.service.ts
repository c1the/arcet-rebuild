// =============================================================================
// policy-temporal.service.ts — policy radius over time (§11.1)
// =============================================================================
import { prisma } from '../ontology/db.js';
import { PolicyRadiusContextService } from '../ontology/policy-radius-context.service.js';
import { TimelineService } from './timeline.service.js';
import { TrendService } from './trend.service.js';
import { ChangeService } from './change.service.js';
import { ObservationService } from './observation.service.js';
import { TemporalQueryService } from './temporal-query.service.js';
import { policyRadiusMovement } from './rules.js';
import { ChangeType, ObservationType } from './enums.js';
import type { ActorContext, TimelineFilters, UUID } from './types.js';

export const PolicyTemporalService = {
  async getPolicyTimeline(policyEntityId: UUID, filters: TimelineFilters = {}) {
    return TimelineService.getTimelineForPolicy(policyEntityId, filters);
  },
  async getPolicyImpactTimeline(policyEntityId: UUID) {
    const impacts = await prisma.policyImpact.findMany({ where: { policyEntityId }, orderBy: { createdAt: 'asc' } });
    return impacts;
  },
  async getPolicyRadiusAsOf(policyEntityId: UUID, asOfDate: Date) {
    return TemporalQueryService.getPolicyContextAsOf(policyEntityId, asOfDate);
  },
  async getPolicyRadiusChanges(policyEntityId: UUID, dateA: Date, dateB: Date) {
    return prisma.temporalChange.findMany({
      where: { entityId: policyEntityId, changeType: { in: [ChangeType.POLICY_RADIUS_EXPANDED, ChangeType.POLICY_RADIUS_REDUCED] }, changedAt: { gte: dateA, lte: dateB } },
      orderBy: { changedAt: 'asc' },
    });
  },
  async getPolicyLaunchReadinessTrend(policyEntityId: UUID) {
    return TrendService.calculateTrend(policyEntityId, ObservationType.POLICY_BLAST_RADIUS);
  },

  /** Apply the policy-radius rule and persist resulting changes/observations. */
  async applyPolicyRadiusRule(policyEntityId: UUID, input: { stakeholderAttitudeWorsened?: boolean; briefingCompleted?: boolean; complianceFlagAdded?: boolean; localIssueSalienceIncreased?: boolean; constituencyEntityId?: UUID }, actor?: ActorContext) {
    const changes = policyRadiusMovement(input);
    for (const ch of changes) {
      await ChangeService.recordChange({ entityId: policyEntityId, changeType: ch.changeType, rationale: ch.rationale, significant: ch.significant, sourceModule: 'policy' }, actor);
    }
    if (input.localIssueSalienceIncreased && input.constituencyEntityId) {
      await ObservationService.recordObservation({ subjectEntityId: policyEntityId, contextEntityId: input.constituencyEntityId, observationType: ObservationType.POLICY_BLAST_RADIUS, valueNumeric: 1, sourceModule: 'policy' }, actor);
    }
    return changes;
  },

  async detectPolicyRadiusExpansion(policyEntityId: UUID, sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 86400000);
    return prisma.temporalChange.findMany({ where: { entityId: policyEntityId, changeType: ChangeType.POLICY_RADIUS_EXPANDED, changedAt: { gte: since } }, orderBy: { changedAt: 'desc' } });
  },

  async getCurrentContext(policyEntityId: UUID) {
    return PolicyRadiusContextService.getPolicyContext(policyEntityId);
  },
};
