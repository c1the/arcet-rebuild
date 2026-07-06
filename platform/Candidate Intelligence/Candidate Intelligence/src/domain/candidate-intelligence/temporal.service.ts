// =============================================================================
// temporal.service.ts — candidate-intelligence temporal views (brief §10.7)
// -----------------------------------------------------------------------------
// Wraps the temporal graph's CandidateTemporalService and adds
// CandidateAssessmentRun history queries specific to this module.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { CandidateTemporalService } from '../temporal/candidate-temporal.service.js';
import { SnapshotService } from '../temporal/snapshot.service.js';
import type { UUID } from './types.js';

export const CandidateIntelTemporalService = {
  getCandidateTimeline(candidateEntityId: UUID) {
    return CandidateTemporalService.getCandidateTimeline(candidateEntityId);
  },
  getCandidateSeatTimeline(candidateEntityId: UUID, constituencyEntityId: UUID) {
    return CandidateTemporalService.getCandidateSeatTimeline(candidateEntityId, constituencyEntityId);
  },
  getCandidateTrend(candidateEntityId: UUID, constituencyEntityId?: UUID) {
    return constituencyEntityId
      ? CandidateTemporalService.getCandidateSeatFitTrend(candidateEntityId, constituencyEntityId)
      : CandidateTemporalService.getCandidateReadinessTrend(candidateEntityId);
  },
  getCandidateChangesSince(candidateEntityId: UUID, sinceDate: Date) {
    return CandidateTemporalService.getCandidateChangesSince(candidateEntityId, sinceDate);
  },
  getCandidateAssessmentAsOf(candidateEntityId: UUID, constituencyEntityId: UUID, asOfDate: Date) {
    return CandidateTemporalService.getCandidateAssessmentAsOf(candidateEntityId, constituencyEntityId, asOfDate);
  },
  compareCandidateAssessmentSnapshots(snapshotIdA: UUID, snapshotIdB: UUID) {
    return SnapshotService.compareSnapshots(snapshotIdA, snapshotIdB);
  },

  /** History of CandidateAssessmentRun rows (this module's own assessments). */
  async getCandidateAssessmentHistory(candidateEntityId: UUID, constituencyEntityId?: UUID) {
    return prisma.candidateAssessmentRun.findMany({
      where: { candidateEntityId, ...(constituencyEntityId ? { constituencyEntityId } : {}) },
      orderBy: { assessmentDate: 'desc' },
      include: { dimensions: true },
    });
  },

  /** Explain why ranking changed between two dates (brief §10.10 last method). */
  async explainWhyCandidateRankingChanged(candidateEntityId: UUID, constituencyEntityId: UUID, dateA: Date, dateB: Date) {
    const cmp = await CandidateTemporalService.compareCandidateAssessmentsOverTime(candidateEntityId, constituencyEntityId, dateA, dateB);
    return {
      candidateEntityId,
      constituencyEntityId,
      from: dateA,
      to: dateB,
      movement: cmp.movement,
      diff: cmp.diff,
      conclusion: cmp.movement?.rationale ?? 'No material change between the two assessments.',
    };
  },
};
