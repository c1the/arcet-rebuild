// =============================================================================
// trend.service.ts — explainable trends over observations (§6.6)
// =============================================================================
import { prisma } from '../ontology/db.js';
import { Confidence } from '../ontology/enums.js';
import { ObservationService } from './observation.service.js';
import { ChangeService } from './change.service.js';
import { computeTrend } from './rules.js';
import { ObservationType, TrendDirection } from './enums.js';
import type { ObservationFilters, TrendResult, UUID } from './types.js';

// Observation types where a higher value is *worse* (so rising = worsening).
const HIGHER_IS_WORSE = new Set<string>([
  ObservationType.CANDIDATE_RISK, ObservationType.FACTION_RISK, ObservationType.SPOILER_RISK,
  ObservationType.TACTICAL_VOTING_RISK, ObservationType.COMPLIANCE_RISK, ObservationType.RELATIONSHIP_DECAY,
  ObservationType.POLICY_BLAST_RADIUS, ObservationType.POLICY_STAKEHOLDER_RISK, ObservationType.POLICY_FACTION_RISK,
  ObservationType.POLICY_MEDIA_RISK, ObservationType.POLICY_COMPLIANCE_RISK,
]);

export const TrendService = {
  async calculateTrend(entityId: UUID, observationType: ObservationType, filters: ObservationFilters = {}): Promise<TrendResult> {
    const points = await ObservationService.getObservationTrendPoints(entityId, observationType, filters);
    const t = computeTrend(points, { higherIsBetter: !HIGHER_IS_WORSE.has(observationType) });
    const confidence = t.n >= 5 ? Confidence.MEDIUM : t.n >= 2 ? Confidence.LOW : Confidence.LOW;

    // Top contributing changes for the subject in the window.
    const changes = await ChangeService.getChangesForEntity(entityId, { startDate: filters.startDate, endDate: filters.endDate, limit: 50 });
    const topContributingChanges = changes
      .filter((c) => c.deltaNumeric != null)
      .sort((a, b) => Math.abs((b.deltaNumeric as number)) - Math.abs((a.deltaNumeric as number)))
      .slice(0, 3)
      .map((c) => ({ changedAt: c.changedAt, deltaNumeric: c.deltaNumeric, rationale: c.rationale ?? undefined }));

    let recommendedAction: string | undefined;
    if (t.direction === TrendDirection.WORSENING) recommendedAction = 'Investigate drivers and intervene';
    else if (t.direction === TrendDirection.VOLATILE) recommendedAction = 'Gather more observations before acting';

    return { subjectEntityId: entityId, observationType, direction: t.direction, magnitude: t.magnitude, slopePerDay: t.slopePerDay, volatility: t.volatility, first: t.first, last: t.last, n: t.n, confidence, topContributingChanges, recommendedAction };
  },

  async calculateCandidateSeatFitTrend(candidateEntityId: UUID, constituencyEntityId: UUID) {
    return this.calculateTrend(candidateEntityId, ObservationType.CANDIDATE_SEAT_FIT, { contextEntityId: constituencyEntityId });
  },
  async calculateCandidateReadinessTrend(candidateEntityId: UUID) {
    return this.calculateTrend(candidateEntityId, ObservationType.CANDIDATE_READINESS);
  },
  async calculateRiskTrend(entityId: UUID) {
    return this.calculateTrend(entityId, ObservationType.CANDIDATE_RISK);
  },
  async calculateIssueMomentum(issueEntityId: UUID, constituencyEntityId?: UUID) {
    return this.calculateTrend(issueEntityId, ObservationType.ISSUE_MOMENTUM, constituencyEntityId ? { contextEntityId: constituencyEntityId } : {});
  },
  async calculateFactionMoodTrend(factionEntityId: UUID) {
    return this.calculateTrend(factionEntityId, ObservationType.FACTION_MOOD);
  },

  /** Rank subjects by trend direction/magnitude for a given observation type. */
  async rankBySlope(observationType: ObservationType, opts: { worst?: boolean; sinceDays?: number; limit?: number } = {}) {
    const since = new Date(Date.now() - (opts.sinceDays ?? 90) * 86400000);
    const rows = await prisma.temporalObservation.findMany({
      where: { observationType, valueNumeric: { not: null }, observedAt: { gte: since } },
      orderBy: { observedAt: 'asc' },
    });
    const bySubject = new Map<string, { observedAt: Date; value: number }[]>();
    for (const r of rows) {
      if (r.valueNumeric == null) continue;
      const arr = bySubject.get(r.subjectEntityId) ?? [];
      arr.push({ observedAt: r.observedAt, value: r.valueNumeric });
      bySubject.set(r.subjectEntityId, arr);
    }
    const trends = [...bySubject.entries()].map(([subjectEntityId, pts]) => ({ subjectEntityId, ...computeTrend(pts, { higherIsBetter: !HIGHER_IS_WORSE.has(observationType) }) }));
    trends.sort((a, b) => (opts.worst ? a.magnitude - b.magnitude : b.magnitude - a.magnitude));
    return trends.slice(0, opts.limit ?? 10);
  },

  getTopImprovingCandidates(filters: { limit?: number } = {}) {
    return this.rankBySlope(ObservationType.CANDIDATE_SEAT_FIT, { worst: false, limit: filters.limit });
  },
  getTopDeterioratingCandidates(filters: { limit?: number } = {}) {
    return this.rankBySlope(ObservationType.CANDIDATE_SEAT_FIT, { worst: true, limit: filters.limit });
  },
  getFastestRisingRisks(filters: { limit?: number } = {}) {
    return this.rankBySlope(ObservationType.CANDIDATE_RISK, { worst: false, limit: filters.limit });
  },
  getFastestDecayingRelationships(filters: { limit?: number } = {}) {
    return this.rankBySlope(ObservationType.RELATIONSHIP_DECAY, { worst: false, limit: filters.limit });
  },
};
