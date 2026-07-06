// =============================================================================
// explanation.service.ts — human-readable explanations (brief §10.10, §21)
// -----------------------------------------------------------------------------
// Every explanation returns conclusion, top positive/negative factors,
// confidence, evidence references, missing-data warnings and next actions —
// grounded in stored assessment data, distinguishing fact from inference.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { CandidateScoringService } from './scoring.service.js';
import { CandidateIntelTemporalService } from './temporal.service.js';
import * as rules from './rules.js';
import type { UUID } from './types.js';

interface Explanation {
  conclusion: string;
  topPositiveFactors: string[];
  topNegativeFactors: string[];
  confidence: string;
  evidenceReferences: string[];
  missingData: string[];
  recommendedNextActions: string[];
}

export const CandidateExplanationService = {
  async explainCandidateScore(candidateEntityId: UUID, constituencyEntityId: UUID | undefined, scoreType: string): Promise<Explanation> {
    const { bundle, quality } = await CandidateScoringService.deriveSignals(candidateEntityId, constituencyEntityId);
    const confidence = rules.computeConfidence(quality);
    const results = CandidateScoringService.scoreAll(bundle, confidence);
    const dim = results.find((r) => r.dimensionType === scoreType) ?? results[0];
    return {
      conclusion: `${dim.dimensionType} = ${dim.score}/100.`,
      topPositiveFactors: dim.positiveDrivers,
      topNegativeFactors: dim.negativeDrivers,
      confidence,
      evidenceReferences: dim.evidenceIds,
      missingData: dim.missingData,
      recommendedNextActions: rules.developmentActions(CandidateScoringService.toScores(results), { dataThin: rules.isDataThin(quality) }).map((a) => a.title),
    };
  },

  async explainCandidateSeatAssessment(candidateSeatAssessmentId: UUID): Promise<Explanation | null> {
    const a = await prisma.candidateSeatAssessment.findUnique({ where: { id: candidateSeatAssessmentId } });
    if (!a) return null;
    return {
      conclusion: a.summary ?? `Candidate-seat fit ${a.overallFitScore}/100.`,
      topPositiveFactors: a.topStrengths ?? [],
      topNegativeFactors: a.topWeaknesses ?? [],
      confidence: a.confidence as string,
      evidenceReferences: a.evidenceSummary ? [a.evidenceSummary] : [],
      missingData: [],
      recommendedNextActions: a.recommendedActions ?? [],
    };
  },

  async explainCandidateComparison(comparisonRunId: UUID) {
    const run = await prisma.candidateComparisonRun.findUnique({ where: { id: comparisonRunId }, include: { entries: { orderBy: { rankOverall: 'asc' } } } });
    if (!run) return null;
    return {
      conclusion: run.summary ?? 'Comparison complete.',
      ranking: run.entries.map((e) => ({ rank: e.rankOverall, candidate: e.candidateEntityId, overall: e.overallFitScore, label: e.recommendationLabel, rationale: e.rationale })),
      winner: run.winnerCandidateEntityId,
      safest: run.safestCandidateEntityId,
      highestRisk: run.highestRiskCandidateEntityId,
      note: 'The model recommends; it does not make the final selection decision.',
    };
  },

  async explainCandidateRisk(riskId: UUID): Promise<Explanation | null> {
    const risk = await prisma.risk.findUnique({ where: { id: riskId }, include: { links: true } });
    if (!risk) return null;
    return {
      conclusion: `${risk.title} — severity ${risk.severity}, status ${risk.status}.`,
      topPositiveFactors: [],
      topNegativeFactors: [risk.rationale ?? risk.description ?? risk.title],
      confidence: risk.confidence as string,
      evidenceReferences: [],
      missingData: risk.confidence === 'LOW' ? ['risk is low-confidence / may be inferred'] : [],
      recommendedNextActions: risk.mitigation ? [risk.mitigation] : ['create mitigation plan'],
    };
  },

  async explainCandidateRecommendation(actionRecommendationId: UUID): Promise<Explanation | null> {
    const a = await prisma.actionRecommendation.findUnique({ where: { id: actionRecommendationId } });
    if (!a) return null;
    return {
      conclusion: `${a.title} (priority ${a.priority}).`,
      topPositiveFactors: a.expectedBenefit ? [a.expectedBenefit] : [],
      topNegativeFactors: a.downsideIfIgnored ? [a.downsideIfIgnored] : [],
      confidence: 'MEDIUM',
      evidenceReferences: [],
      missingData: [],
      recommendedNextActions: [a.title],
    };
  },

  async explainWhyCandidateRankingChanged(candidateEntityId: UUID, constituencyEntityId: UUID, dateA: Date, dateB: Date) {
    return CandidateIntelTemporalService.explainWhyCandidateRankingChanged(candidateEntityId, constituencyEntityId, dateA, dateB);
  },
};
