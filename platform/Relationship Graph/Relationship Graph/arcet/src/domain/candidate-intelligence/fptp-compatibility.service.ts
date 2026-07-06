// =============================================================================
// fptp-compatibility.service.ts — feeds the FPTP simulator (brief §10.8, §15)
// -----------------------------------------------------------------------------
// Produces the structured FPTP input object from the latest candidate-seat
// assessment, flags FPTP scenarios that have gone stale because candidate
// intelligence changed, and assembles candidate-swap context.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { ActionService } from '../ontology/action.service.js';
import { FPTPTemporalService } from '../temporal/fptp-temporal.service.js';
import { ActionType, ActionPriority, Confidence } from '../ontology/enums.js';
import { CandidateIntelligenceService } from './candidate-intelligence.service.js';
import type { ActorContext, CandidateFPTPInput, UUID } from './types.js';

export const CandidateFPTPCompatibilityService = {
  /** Build the FPTP input object (brief §15.1). Uses the latest seat assessment, else runs one. */
  async getCandidateFPTPInputs(candidateEntityId: UUID, constituencyEntityId: UUID): Promise<CandidateFPTPInput> {
    const latest = await prisma.candidateSeatAssessment.findFirst({ where: { candidateEntityId, constituencyEntityId }, orderBy: { assessmentDate: 'desc' } });
    const a = latest ?? (await CandidateIntelligenceService.runCandidateSeatAssessment(candidateEntityId, constituencyEntityId, { persist: true })).seatAssessment;

    const staleDataWarnings: string[] = [];
    if (a.assessmentDate && Date.now() - new Date(a.assessmentDate).getTime() > 60 * 86400000) staleDataWarnings.push('assessment older than 60 days');
    if (a.confidence === Confidence.LOW) staleDataWarnings.push('low-confidence assessment');

    return {
      candidateEntityId,
      constituencyEntityId,
      candidateSeatFitScore: a.overallFitScore ?? 0,
      localConnectionScore: a.localConnectionScore ?? 0,
      stakeholderCoverageScore: a.stakeholderCoverageScore ?? 0,
      localAssociationSupportScore: a.localAssociationSupportScore ?? 0,
      factionAcceptabilityScore: a.factionAcceptabilityScore ?? 0,
      mediaReadinessScore: a.mediaReadinessScore ?? 0,
      issueCredibilityScore: a.issueCredibilityScore ?? 0,
      riskScore: a.riskScore ?? 0,
      developmentPotentialScore: a.developmentPotentialScore ?? 0,
      confidence: a.confidence as Confidence,
      topRisks: a.topWeaknesses ?? [],
      topStrengths: a.topStrengths ?? [],
      candidateAssumptions: [`candidate-seat fit ${a.overallFitScore}`, `risk ${a.riskScore}`],
      staleDataWarnings,
      evidenceSummary: a.evidenceSummary ?? '',
    };
  },

  /** Flag FPTP scenarios for this candidate's seats that are now stale (brief §15.2). */
  async flagFPTPScenariosAffectedByCandidateChange(candidateEntityId: UUID) {
    const scenarios = await prisma.fPTPScenario.findMany({ where: { candidateEntityId } });
    const out = [];
    for (const s of scenarios) {
      const staleness = await FPTPTemporalService.recheckFPTPScenarioIfContextChanged(s.id).catch(() => null);
      if (staleness?.stale) out.push({ scenarioId: s.id, ...staleness });
    }
    return out;
  },

  /** Create a "rerun FPTP" action if the candidate materially changed (brief §12.3). */
  async createFPTPReviewActionIfCandidateChanged(candidateEntityId: UUID, constituencyEntityId: UUID, actor?: ActorContext) {
    const affected = await this.flagFPTPScenariosAffectedByCandidateChange(candidateEntityId);
    if (!affected.length) return null;
    return ActionService.createRecommendation(
      { title: 'Rerun FPTP scenario (candidate assessment changed)', actionType: ActionType.GATHER_LOCAL_DATA, priority: ActionPriority.HIGH, targetEntityId: constituencyEntityId, sourceModule: 'candidate-intelligence', rationale: `${affected.length} FPTP scenario(s) now stale after candidate intelligence change.` },
      actor,
    );
  },

  /** Compare two candidates as an FPTP swap (brief §10.8 last method). */
  async getCandidateSwapContext(currentCandidateId: UUID, alternativeCandidateId: UUID, constituencyEntityId: UUID) {
    const [current, alternative] = await Promise.all([
      this.getCandidateFPTPInputs(currentCandidateId, constituencyEntityId),
      this.getCandidateFPTPInputs(alternativeCandidateId, constituencyEntityId),
    ]);
    const fitDelta = alternative.candidateSeatFitScore - current.candidateSeatFitScore;
    const riskDelta = alternative.riskScore - current.riskScore;
    return {
      constituencyEntityId,
      current,
      alternative,
      fitDelta,
      riskDelta,
      recommendation: fitDelta >= 8 && riskDelta <= 10 ? 'alternative is a materially stronger fit — consider swap' : fitDelta <= -8 ? 'current candidate is stronger — retain' : 'no decisive difference — gather more data',
    };
  },
};
