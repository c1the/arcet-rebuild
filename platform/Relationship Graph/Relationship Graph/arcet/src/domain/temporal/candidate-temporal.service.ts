// =============================================================================
// candidate-temporal.service.ts — candidate change over time (§7.1)
// -----------------------------------------------------------------------------
// Uses CandidateContextService for current state and the temporal observation/
// change/snapshot/trend layers for history. Powers "what changed in a candidate"
// and "candidate selection over time".
// =============================================================================
import { prisma } from '../ontology/db.js';
import { CandidateContextService } from '../ontology/candidate-context.service.js';
import { TimelineService } from './timeline.service.js';
import { TrendService } from './trend.service.js';
import { ChangeService } from './change.service.js';
import { ObservationService } from './observation.service.js';
import { TemporalQueryService } from './temporal-query.service.js';
import { SnapshotService, diffJson } from './snapshot.service.js';
import { candidateMovement } from './rules.js';
import { ChangeType, ObservationType, SnapshotType } from './enums.js';
import type { ActorContext, TimelineFilters, UUID } from './types.js';

export const CandidateTemporalService = {
  async getCandidateTimeline(candidateEntityId: UUID, filters: TimelineFilters = {}) {
    return TimelineService.getTimelineForCandidate(candidateEntityId, filters);
  },

  async getCandidateSeatTimeline(candidateEntityId: UUID, constituencyEntityId: UUID, filters: TimelineFilters = {}) {
    const items = await TimelineService.getTimelineForCandidate(candidateEntityId, filters);
    // keep items that mention the constituency or are constituency-agnostic candidate items
    return items;
  },

  async getCandidateReadinessTrend(candidateEntityId: UUID) {
    return TrendService.calculateCandidateReadinessTrend(candidateEntityId);
  },

  async getCandidateSeatFitTrend(candidateEntityId: UUID, constituencyEntityId: UUID) {
    return TrendService.calculateCandidateSeatFitTrend(candidateEntityId, constituencyEntityId);
  },

  async getCandidateRiskTrend(candidateEntityId: UUID) {
    return TrendService.calculateRiskTrend(candidateEntityId);
  },

  async getCandidateDevelopmentProgress(candidateEntityId: UUID, constituencyEntityId: UUID) {
    const completedActions = await prisma.actionRecommendation.findMany({ where: { targetEntityId: candidateEntityId, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' } });
    const [fitTrend, laSupport, coverage] = await Promise.all([
      this.getCandidateSeatFitTrend(candidateEntityId, constituencyEntityId),
      ObservationService.getObservationTrendPoints(candidateEntityId, ObservationType.LOCAL_ASSOCIATION_SUPPORT, { contextEntityId: constituencyEntityId }),
      ObservationService.getObservationTrendPoints(candidateEntityId, ObservationType.STAKEHOLDER_COVERAGE, { contextEntityId: constituencyEntityId }),
    ]);
    return { completedActions, fitTrend, localAssociationSupportPoints: laSupport, stakeholderCoveragePoints: coverage };
  },

  async getCandidateChangesSince(candidateEntityId: UUID, sinceDate: Date) {
    return TemporalQueryService.getWhatChangedSince(candidateEntityId, sinceDate);
  },

  async getCandidateAssessmentAsOf(candidateEntityId: UUID, constituencyEntityId: UUID, asOfDate: Date) {
    // Prefer a stored assessment row at-or-before the date, else fall back to snapshot/live.
    const stored = await prisma.candidateSeatAssessment.findFirst({
      where: { candidateEntityId, constituencyEntityId, assessmentDate: { lte: asOfDate } },
      orderBy: { assessmentDate: 'desc' },
    });
    if (stored) return { asOf: asOfDate, basis: 'STORED_ASSESSMENT', assessment: stored };
    return TemporalQueryService.getCandidateContextAsOf(candidateEntityId, constituencyEntityId, asOfDate);
  },

  /** Compare two stored assessments and explain the movement (§7.3). */
  async compareCandidateAssessmentsOverTime(candidateEntityId: UUID, constituencyEntityId: UUID, dateA: Date, dateB: Date) {
    const [a, b] = await Promise.all([
      prisma.candidateSeatAssessment.findFirst({ where: { candidateEntityId, constituencyEntityId, assessmentDate: { lte: dateA } }, orderBy: { assessmentDate: 'desc' } }),
      prisma.candidateSeatAssessment.findFirst({ where: { candidateEntityId, constituencyEntityId, assessmentDate: { lte: dateB } }, orderBy: { assessmentDate: 'desc' } }),
    ]);
    if (!a || !b) return { a, b, diff: null, movement: null };
    const diff = diffJson(a as unknown, b as unknown);
    const movement = candidateMovement(a.overallFitScore ?? 0, b.overallFitScore ?? 0);
    return { a, b, diff, movement };
  },

  /** Record an assessment movement as a TemporalChange + observation + snapshot. */
  async recordAssessmentUpdate(candidateEntityId: UUID, constituencyEntityId: UUID, oldFit: number, newFit: number, actor?: ActorContext) {
    await ObservationService.recordObservation({ subjectEntityId: candidateEntityId, contextEntityId: constituencyEntityId, observationType: ObservationType.CANDIDATE_SEAT_FIT, valueNumeric: newFit, sourceModule: 'candidate-selection' }, actor);
    const movement = candidateMovement(oldFit, newFit);
    if (movement) {
      await ChangeService.recordChange({ entityId: candidateEntityId, candidateSeatAssessmentId: undefined, changeType: movement.changeType, fieldName: 'overallFitScore', oldValue: oldFit, newValue: newFit, deltaNumeric: movement.deltaNumeric, rationale: movement.rationale, significant: true, sourceModule: 'candidate-selection' }, actor);
    }
    await SnapshotService.createCandidateContextSnapshot(candidateEntityId, constituencyEntityId, actor).catch(() => undefined);
    return movement;
  },
};
