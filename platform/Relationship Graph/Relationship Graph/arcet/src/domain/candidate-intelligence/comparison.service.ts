// =============================================================================
// comparison.service.ts — compare candidates for a constituency (brief §10.3)
// -----------------------------------------------------------------------------
// Runs a seat assessment for each candidate, ranks by overall fit, computes the
// superlatives (safest / highest-upside / best-local / most-factionally-
// acceptable / highest-risk), labels each entry, and records a
// CandidateComparisonRun (+ entries). createSelectionDecision records the human
// decision separately — the model recommends, it does not select.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { AuditService } from '../ontology/audit.service.js';
import { SnapshotService } from '../temporal/snapshot.service.js';
import { SnapshotType } from '../temporal/enums.js';
import { CandidateIntelligenceService } from './candidate-intelligence.service.js';
import * as rules from './rules.js';
import { CandidateDimensionType as D, CandidateSelectionDecisionStatus } from './enums.js';
import type { ActorContext, ComparisonEntryResult, ComparisonResult, UUID } from './types.js';

export const CandidateComparisonService = {
  async compareCandidatesForConstituency(candidateEntityIds: UUID[], constituencyEntityId: UUID, options: { weightConfigId?: UUID; title?: string; persistAssessments?: boolean } = {}, actor?: ActorContext): Promise<{ comparison: ComparisonResult; comparisonRunId: UUID }> {
    const persist = options.persistAssessments ?? true;

    // Assess each candidate.
    const assessed: { candidateEntityId: UUID; overall: number; scores: ReturnType<typeof rules.blendOverall> extends never ? never : Record<string, number>; recommendation: ReturnType<typeof rules.recommendationLabel>; seatAssessmentId?: UUID }[] = [];
    for (const cid of candidateEntityIds) {
      const res = await CandidateIntelligenceService.runCandidateSeatAssessment(cid, constituencyEntityId, { weightConfigId: options.weightConfigId, persist }, actor);
      assessed.push({ candidateEntityId: cid, overall: res.overall.overallScore, scores: res.scores as Record<string, number>, recommendation: res.recommendation, seatAssessmentId: 'seatAssessment' in res ? res.seatAssessment.id : undefined });
    }

    // Rank by overall fit (desc) and label.
    assessed.sort((a, b) => b.overall - a.overall);
    const entries: ComparisonEntryResult[] = assessed.map((a, i) => ({
      candidateEntityId: a.candidateEntityId,
      rankOverall: i + 1,
      overallFitScore: a.overall,
      dimensionScores: a.scores as never,
      recommendationLabel: rules.comparisonEntryLabel(i + 1, a.overall, a.recommendation),
      rationale: `Rank ${i + 1}: overall ${a.overall}, risk ${a.scores.RISK_PROFILE}, recommendation ${a.recommendation}.`,
    }));
    const sup = rules.computeSuperlatives(entries);

    const summary = entries.length
      ? `${entries[0].candidateEntityId} ranks first (${entries[0].overallFitScore}/100). Safest: ${sup.safest}. Highest upside: ${sup.highestUpside}. Highest risk: ${sup.highestRisk}.`
      : 'No candidates to compare.';

    const comparison: ComparisonResult = { constituencyEntityId, entries, winner: sup.winner, safest: sup.safest, highestUpside: sup.highestUpside, bestLocalFit: sup.bestLocalFit, mostFactionallyAcceptable: sup.mostFactionallyAcceptable, highestRisk: sup.highestRisk, summary };

    // Persist comparison run + entries + snapshot.
    const run = await prisma.candidateComparisonRun.create({
      data: {
        constituencyEntityId,
        title: options.title ?? `Comparison for ${constituencyEntityId}`,
        status: 'GENERATED',
        winnerCandidateEntityId: sup.winner,
        safestCandidateEntityId: sup.safest,
        highestUpsideCandidateEntityId: sup.highestUpside,
        bestLocalFitCandidateEntityId: sup.bestLocalFit,
        mostFactionallyAcceptableCandidateEntityId: sup.mostFactionallyAcceptable,
        highestRiskCandidateEntityId: sup.highestRisk,
        summary,
        createdByUserId: actor?.userId,
        entries: {
          create: entries.map((e, i) => ({
            candidateEntityId: e.candidateEntityId,
            candidateSeatAssessmentId: assessed[i]?.seatAssessmentId,
            rankOverall: e.rankOverall,
            overallFitScore: e.overallFitScore,
            riskScore: e.dimensionScores.RISK_PROFILE,
            localConnectionScore: e.dimensionScores.LOCAL_CONNECTION,
            stakeholderCoverageScore: e.dimensionScores.STAKEHOLDER_COVERAGE,
            localAssociationSupportScore: e.dimensionScores.LOCAL_ASSOCIATION_SUPPORT,
            factionAcceptabilityScore: e.dimensionScores.FACTION_ACCEPTABILITY,
            issueCredibilityScore: e.dimensionScores.ISSUE_CREDIBILITY,
            mediaReadinessScore: e.dimensionScores.MEDIA_READINESS,
            campaignCapacityScore: e.dimensionScores.CAMPAIGN_CAPACITY,
            developmentPotentialScore: e.dimensionScores.DEVELOPMENT_POTENTIAL,
            recommendationLabel: e.recommendationLabel,
            rationale: e.rationale,
          })),
        },
      },
      include: { entries: true },
    });
    const snapshot = await SnapshotService.createEntitySnapshot({ entityId: constituencyEntityId, snapshotType: SnapshotType.CANDIDATE_SELECTION_CONTEXT, snapshotJson: comparison as never, sourceModule: 'candidate-intelligence', summary }, actor).catch(() => null);
    if (snapshot) await prisma.candidateComparisonRun.update({ where: { id: run.id }, data: { snapshotId: snapshot.id } });
    await AuditService.record({ action: 'candidate-intelligence.compare', objectType: 'CandidateComparisonRun', objectId: run.id, entityId: constituencyEntityId, after: { winner: sup.winner } as never, actor });

    return { comparison, comparisonRunId: run.id };
  },

  async explainCandidateComparison(comparisonRunId: UUID) {
    const run = await prisma.candidateComparisonRun.findUnique({ where: { id: comparisonRunId }, include: { entries: { orderBy: { rankOverall: 'asc' } } } });
    if (!run) return null;
    const lines = run.entries.map((e) => `#${e.rankOverall} ${e.candidateEntityId}: fit ${e.overallFitScore}, risk ${e.riskScore}, label ${e.recommendationLabel}. ${e.rationale ?? ''}`);
    return { summary: run.summary, winner: run.winnerCandidateEntityId, safest: run.safestCandidateEntityId, highestRisk: run.highestRiskCandidateEntityId, entries: lines };
  },

  async createSelectionDecision(input: { constituencyEntityId: UUID; selectedCandidateEntityId?: UUID; comparisonRunId?: UUID; rationale?: string; conditions?: string[]; decisionStatus?: keyof typeof CandidateSelectionDecisionStatus }, actor?: ActorContext) {
    const decision = await prisma.candidateSelectionDecision.create({
      data: {
        constituencyEntityId: input.constituencyEntityId,
        selectedCandidateEntityId: input.selectedCandidateEntityId,
        comparisonRunId: input.comparisonRunId,
        decisionStatus: input.decisionStatus ?? CandidateSelectionDecisionStatus.PROPOSED,
        decisionMakerUserId: actor?.userId,
        rationale: input.rationale,
        conditions: input.conditions ?? [],
      },
    });
    await AuditService.record({ action: 'candidate-intelligence.decision', objectType: 'CandidateSelectionDecision', objectId: decision.id, entityId: input.constituencyEntityId, after: decision as never, actor });
    return decision;
  },
};
