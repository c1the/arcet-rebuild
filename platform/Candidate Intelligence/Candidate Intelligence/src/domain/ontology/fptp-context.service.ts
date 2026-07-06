// =============================================================================
// fptp-context.service.ts — read context for the FPTP simulator; persist scenarios
// -----------------------------------------------------------------------------
// This module ONLY assembles ontology data and writes back FPTPScenario / Score
// records. It does not compute a forecast — the simulator owns that. The bridge
// between candidate selection and FPTP is CandidateSeatAssessment.
// =============================================================================
import { prisma } from './db.js';
import { ordinalToScore } from './db.js';
import { AuditService } from './audit.service.js';
import { CandidateContextService } from './candidate-context.service.js';
import { saveFptpScenarioSchema } from './validators.js';
import { RelationshipType } from './enums.js';
import type { ActorContext, FPTPContext, SaveFPTPScenarioInput, CandidateSeatAssessmentResult, UUID } from './types.js';

function int1to5ToScore(v: number | null | undefined): number | null {
  if (v == null) return null;
  return ordinalToScore(String(v), ['1', '2', '3', '4', '5']);
}

export const FPTPContextService = {
  async getFPTPContext(constituencyEntityId: UUID, candidateEntityId?: UUID): Promise<FPTPContext> {
    const [profile, history, seatAssessment, coverage] = await Promise.all([
      prisma.constituencyProfile.findFirst({ where: { entityId: constituencyEntityId } }),
      this.getElectionHistory(constituencyEntityId),
      candidateEntityId ? this.getCandidateSeatAssessment(candidateEntityId, constituencyEntityId) : Promise.resolve(null),
      this.getLocalStakeholderCoverage(constituencyEntityId, candidateEntityId),
    ]);

    return {
      constituencyEntityId,
      candidateEntityId,
      electionHistory: history.map((h) => ({
        electionDate: h.electionDate,
        partyEntityId: h.partyEntityId,
        candidateEntityId: h.candidateEntityId,
        votes: h.votes,
        voteShare: h.voteShare,
        position: h.position,
      })),
      seatAssessment,
      localPartyStrength: int1to5ToScore(profile?.localPartyStrength),
      stakeholderCoverageScore: profile?.stakeholderCoverageScore ?? coverage,
      issueVolatility: int1to5ToScore(profile?.localIssueVolatility),
      tacticalVotingRisk: int1to5ToScore(profile?.tacticalVotingRisk),
      spoilerRisk: int1to5ToScore(profile?.spoilerRisk),
      targetStatus: (profile?.targetStatus as FPTPContext['targetStatus']) ?? null,
      strategicPriority: (profile?.strategicPriority as FPTPContext['strategicPriority']) ?? null,
    };
  },

  async getElectionHistory(constituencyEntityId: UUID) {
    return prisma.electionResult.findMany({ where: { constituencyEntityId }, orderBy: { electionDate: 'desc' } });
  },

  /** Returns the most recent stored seat assessment, or computes a fresh one (unpersisted). */
  async getCandidateSeatAssessment(candidateEntityId: UUID, constituencyEntityId: UUID) {
    const stored = await prisma.candidateSeatAssessment.findFirst({
      where: { candidateEntityId, constituencyEntityId },
      orderBy: { assessmentDate: 'desc' },
    });
    if (stored) {
      return {
        candidateEntityId,
        constituencyEntityId,
        overallFitScore: stored.overallFitScore ?? 0,
        readinessScore: stored.readinessScore ?? 0,
        localConnectionScore: stored.localConnectionScore ?? 0,
        stakeholderCoverageScore: stored.stakeholderCoverageScore ?? 0,
        localAssociationSupportScore: stored.localAssociationSupportScore ?? 0,
        factionAcceptabilityScore: stored.factionAcceptabilityScore ?? 0,
        mediaReadinessScore: stored.mediaReadinessScore ?? 0,
        issueCredibilityScore: stored.issueCredibilityScore ?? 0,
        riskScore: stored.riskScore ?? 0,
        developmentPotentialScore: stored.developmentPotentialScore ?? 0,
        summary: stored.summary ?? '',
        topStrengths: stored.topStrengths,
        topWeaknesses: stored.topWeaknesses,
        recommendedActions: stored.recommendedActions,
        evidenceSummary: stored.evidenceSummary ?? '',
        confidence: stored.confidence as CandidateSeatAssessmentResult['confidence'],
      };
    }
    return CandidateContextService.calculateCandidateSeatAssessment(candidateEntityId, constituencyEntityId, undefined, false);
  },

  async getLocalStakeholderCoverage(constituencyEntityId: UUID, _candidateEntityId?: UUID): Promise<number | null> {
    const profile = await prisma.constituencyProfile.findFirst({ where: { entityId: constituencyEntityId } });
    if (profile?.stakeholderCoverageScore != null) return profile.stakeholderCoverageScore;
    const count = await prisma.relationship.count({
      where: { targetEntityId: constituencyEntityId, type: RelationshipType.MATTERS_TO_CONSTITUENCY, isCurrent: true },
    });
    return count === 0 ? 0 : Math.min(100, count * 10);
  },

  async getLocalPartyStrength(constituencyEntityId: UUID): Promise<number | null> {
    const profile = await prisma.constituencyProfile.findFirst({ where: { entityId: constituencyEntityId } });
    return int1to5ToScore(profile?.localPartyStrength);
  },

  async getIssueVolatility(constituencyEntityId: UUID): Promise<number | null> {
    const profile = await prisma.constituencyProfile.findFirst({ where: { entityId: constituencyEntityId } });
    return int1to5ToScore(profile?.localIssueVolatility);
  },

  async saveFPTPScenario(input: SaveFPTPScenarioInput, actor?: ActorContext) {
    const data = saveFptpScenarioSchema.parse(input);
    const scenario = await prisma.fPTPScenario.create({ data: { ...data, assumptions: (data.assumptions ?? undefined) as never } });
    await AuditService.record(
      { action: 'fptp.saveScenario', objectType: 'FPTPScenario', objectId: scenario.id, entityId: scenario.constituencyEntityId, after: scenario as never, actor },
    );
    return scenario;
  },

  async getFPTPScenarios(constituencyEntityId: UUID) {
    return prisma.fPTPScenario.findMany({ where: { constituencyEntityId }, orderBy: { createdAt: 'desc' } });
  },

  async getAllFPTPScenarios(limit = 50) {
    return prisma.fPTPScenario.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  },
};
