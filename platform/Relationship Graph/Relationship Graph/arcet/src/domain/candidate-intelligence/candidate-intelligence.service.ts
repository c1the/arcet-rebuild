// =============================================================================
// candidate-intelligence.service.ts — primary orchestration (brief §10.1)
// -----------------------------------------------------------------------------
// runCandidateSeatAssessment is the spine: derive signals → score dimensions →
// blend → confidence → recommendation → persist CandidateAssessmentRun +
// dimensions + CandidateSeatAssessment + Score + TemporalObservation +
// TemporalChange (material) + EntitySnapshot + ActionRecommendation.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { AuditService } from '../ontology/audit.service.js';
import { CandidateContextService } from '../ontology/candidate-context.service.js';
import { ActionService } from '../ontology/action.service.js';
import { Confidence } from '../ontology/enums.js';
import { ObservationService } from '../temporal/observation.service.js';
import { ChangeService } from '../temporal/change.service.js';
import { SnapshotService } from '../temporal/snapshot.service.js';
import { ObservationType, SnapshotType } from '../temporal/enums.js';
import { CandidateScoringService } from './scoring.service.js';
import * as rules from './rules.js';
import {
  CandidateAssessmentType,
  CandidateDimensionType as D,
  CandidateOverallRecommendation,
} from './enums.js';
import type { ActorContext, OverallAssessment, RunAssessmentOptions, UUID, WeightConfig, DimensionResult } from './types.js';

const MODEL_VERSION = '0.1.0';

async function getWeights(weightConfigId?: UUID): Promise<WeightConfig> {
  if (weightConfigId) {
    const cfg = await prisma.candidateScoreWeightConfig.findUnique({ where: { id: weightConfigId } });
    if (cfg) return cfg as unknown as WeightConfig;
  }
  const def = await prisma.candidateScoreWeightConfig.findFirst({ where: { isDefault: true } });
  return (def as unknown as WeightConfig) ?? rules.DEFAULT_WEIGHTS;
}

function dimScore(results: DimensionResult[], d: DimensionResult['dimensionType']): number {
  return results.find((r) => r.dimensionType === d)?.score ?? 0;
}

export const CandidateIntelligenceService = {
  async getCandidateContext(candidateEntityId: UUID) {
    return CandidateContextService.getCandidateProfile(candidateEntityId);
  },

  async getCandidateSeatContext(candidateEntityId: UUID, constituencyEntityId: UUID) {
    return CandidateContextService.getCandidateSeatContext(candidateEntityId, constituencyEntityId);
  },

  async getCandidateOverview(candidateEntityId: UUID) {
    const { entity, profile } = await CandidateContextService.getCandidateProfile(candidateEntityId);
    const [runs, risks, actions] = await Promise.all([
      prisma.candidateAssessmentRun.findMany({ where: { candidateEntityId }, orderBy: { assessmentDate: 'desc' }, take: 5, include: { dimensions: true } }),
      prisma.riskLink.findMany({ where: { entityId: candidateEntityId }, include: { risk: true } }),
      prisma.actionRecommendation.findMany({ where: { targetEntityId: candidateEntityId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return { entity, profile, latestAssessment: runs[0] ?? null, assessmentHistory: runs, risks: risks.map((r) => r.risk), actions };
  },

  /**
   * Run a full candidate-seat assessment. Persists by default.
   */
  async runCandidateSeatAssessment(candidateEntityId: UUID, constituencyEntityId: UUID, options: RunAssessmentOptions = {}, actor?: ActorContext) {
    const persist = options.persist ?? true;
    const weights = await getWeights(options.weightConfigId);

    const { bundle, quality } = await CandidateScoringService.deriveSignals(candidateEntityId, constituencyEntityId);
    if (options.signals) Object.assign(bundle, options.signals);

    const confidence = rules.computeConfidence(quality);
    const dataThin = rules.isDataThin(quality);
    const results = CandidateScoringService.scoreAll(bundle, confidence);
    const scores = CandidateScoringService.toScores(results);
    const blend = rules.blendOverall(scores, weights);
    const riskScore = scores.RISK_PROFILE;
    const recommendation = rules.recommendationLabel({ overall: blend.overall, riskScore, developmentPotential: scores.DEVELOPMENT_POTENTIAL, dataThin });

    const positives = results.flatMap((r) => r.positiveDrivers).slice(0, 5);
    const negatives = results.flatMap((r) => r.negativeDrivers).slice(0, 5);
    const overall: OverallAssessment = {
      overallScore: blend.overall,
      recommendation,
      confidence,
      positiveDrivers: positives,
      negativeDrivers: negatives,
      summary: `Candidate-seat fit ${blend.overall}/100 (risk ${riskScore}). Recommendation: ${recommendation}. Confidence: ${confidence}.`,
    };

    const proposedActions = rules.developmentActions(scores, { dataThin });

    if (!persist) {
      return { overall, results, scores, recommendation, proposedActions, readinessScore: dimScore(results, D.POLITICAL_EXPERIENCE) };
    }

    // ---- persist: assessment run + dimensions -------------------------------
    const run = await prisma.candidateAssessmentRun.create({
      data: {
        candidateEntityId,
        constituencyEntityId,
        assessmentType: options.assessmentType ?? CandidateAssessmentType.CANDIDATE_SEAT_FIT,
        status: 'GENERATED',
        sourceModule: 'candidate-intelligence',
        modelVersion: MODEL_VERSION,
        weightConfigId: options.weightConfigId,
        overallScore: blend.overall,
        overallRecommendation: recommendation,
        confidence,
        summary: overall.summary,
        topStrengths: positives,
        topWeaknesses: negatives,
        topRisks: results.find((r) => r.dimensionType === D.RISK_PROFILE)?.negativeDrivers ?? [],
        recommendedActions: proposedActions.map((a) => a.title),
        createdByUserId: actor?.userId,
        dimensions: {
          create: results.map((r) => ({
            candidateEntityId,
            constituencyEntityId,
            dimensionType: r.dimensionType,
            score: r.score,
            confidence: r.confidence,
            rationale: r.rationale,
            evidenceSummary: [...r.positiveDrivers, ...r.negativeDrivers].join('; ') || undefined,
          })),
        },
      },
      include: { dimensions: true },
    });

    // ---- generic Score records ---------------------------------------------
    await CandidateScoringService.saveScores(candidateEntityId, constituencyEntityId, results, actor);

    // ---- CandidateSeatAssessment (the ontology bridge) ----------------------
    const readiness = dimScore(results, D.POLITICAL_EXPERIENCE);
    const seatAssessment = await prisma.candidateSeatAssessment.create({
      data: {
        candidateEntityId,
        constituencyEntityId,
        overallFitScore: blend.overall,
        readinessScore: readiness,
        localConnectionScore: scores.LOCAL_CONNECTION,
        stakeholderCoverageScore: scores.STAKEHOLDER_COVERAGE,
        localAssociationSupportScore: scores.LOCAL_ASSOCIATION_SUPPORT,
        factionAcceptabilityScore: scores.FACTION_ACCEPTABILITY,
        mediaReadinessScore: scores.MEDIA_READINESS,
        issueCredibilityScore: scores.ISSUE_CREDIBILITY,
        riskScore,
        developmentPotentialScore: scores.DEVELOPMENT_POTENTIAL,
        summary: overall.summary,
        topStrengths: positives,
        topWeaknesses: negatives,
        recommendedActions: proposedActions.map((a) => a.title),
        evidenceSummary: `${quality.evidenceCount} evidence items, ${quality.confirmedRelationshipCount} confirmed relationships, ${quality.missingFieldCount} missing fields.`,
        confidence,
      },
    });

    // ---- temporal observation + snapshot ------------------------------------
    await ObservationService.recordObservation({ subjectEntityId: candidateEntityId, contextEntityId: constituencyEntityId, observationType: ObservationType.CANDIDATE_SEAT_FIT, valueNumeric: blend.overall, sourceModule: 'candidate-intelligence' }, actor);
    const snapshot = await SnapshotService.createEntitySnapshot({ entityId: candidateEntityId, snapshotType: SnapshotType.CANDIDATE_CONTEXT, snapshotJson: { assessmentRunId: run.id, scores, overall: blend.overall, riskScore, recommendation } as never, sourceModule: 'candidate-intelligence', summary: overall.summary }, actor);
    await prisma.candidateAssessmentRun.update({ where: { id: run.id }, data: { snapshotId: snapshot.id } });

    // ---- material changes vs the previous assessment ------------------------
    const prev = await prisma.candidateAssessmentRun.findFirst({
      where: { candidateEntityId, constituencyEntityId, id: { not: run.id } },
      orderBy: { assessmentDate: 'desc' },
      include: { dimensions: true },
    });
    if (prev) {
      const prevScore = (t: string) => prev.dimensions.find((d) => d.dimensionType === t)?.score ?? 50;
      const changes = rules.detectMaterialChanges(
        { overall: prev.overallScore ?? 50, risk: prevScore(D.RISK_PROFILE), localAssociation: prevScore(D.LOCAL_ASSOCIATION_SUPPORT), faction: prevScore(D.FACTION_ACCEPTABILITY), recommendation: (prev.overallRecommendation ?? CandidateOverallRecommendation.NEEDS_MORE_DATA) as never, viable: rules.isViable(prev.overallScore ?? 0, prevScore(D.RISK_PROFILE)) },
        { overall: blend.overall, risk: riskScore, localAssociation: scores.LOCAL_ASSOCIATION_SUPPORT, faction: scores.FACTION_ACCEPTABILITY, recommendation, viable: rules.isViable(blend.overall, riskScore) },
      );
      for (const ch of changes) {
        await ChangeService.recordChange({ entityId: candidateEntityId, candidateSeatAssessmentId: seatAssessment.id, changeType: ch.changeType, fieldName: ch.fieldName, deltaNumeric: ch.deltaNumeric, rationale: ch.rationale, significant: ch.significant, sourceModule: 'candidate-intelligence' }, actor);
      }
    }

    // ---- action recommendations --------------------------------------------
    for (const a of proposedActions) {
      await ActionService.createRecommendation({ title: a.title, actionType: a.actionType, priority: a.priority, targetEntityId: candidateEntityId, sourceModule: 'candidate-intelligence', rationale: a.rationale }, actor);
    }

    await AuditService.record({ action: 'candidate-intelligence.assess', objectType: 'CandidateAssessmentRun', objectId: run.id, entityId: candidateEntityId, after: { overall: blend.overall, recommendation } as never, actor });

    return { run, seatAssessment, snapshot, overall, results, scores, recommendation, proposedActions };
  },

  async getCandidateStrengths(candidateEntityId: UUID, constituencyEntityId?: UUID) {
    const { bundle, quality } = await CandidateScoringService.deriveSignals(candidateEntityId, constituencyEntityId);
    const results = CandidateScoringService.scoreAll(bundle, rules.computeConfidence(quality));
    return results.filter((r) => r.dimensionType !== D.RISK_PROFILE && r.score >= 60).map((r) => ({ dimension: r.dimensionType, score: r.score, drivers: r.positiveDrivers }));
  },

  async getCandidateWeaknesses(candidateEntityId: UUID, constituencyEntityId?: UUID) {
    const { bundle, quality } = await CandidateScoringService.deriveSignals(candidateEntityId, constituencyEntityId);
    const results = CandidateScoringService.scoreAll(bundle, rules.computeConfidence(quality));
    return results.filter((r) => r.dimensionType !== D.RISK_PROFILE && r.score < 45).map((r) => ({ dimension: r.dimensionType, score: r.score, drivers: r.negativeDrivers }));
  },

  async getCandidateRecommendedActions(candidateEntityId: UUID, constituencyEntityId?: UUID) {
    const { bundle, quality } = await CandidateScoringService.deriveSignals(candidateEntityId, constituencyEntityId);
    const results = CandidateScoringService.scoreAll(bundle, rules.computeConfidence(quality));
    return rules.developmentActions(CandidateScoringService.toScores(results), { dataThin: rules.isDataThin(quality) });
  },

  async getCandidateConfidence(candidateEntityId: UUID, constituencyEntityId?: UUID) {
    const { quality } = await CandidateScoringService.deriveSignals(candidateEntityId, constituencyEntityId);
    return { confidence: rules.computeConfidence(quality), dataThin: rules.isDataThin(quality), quality };
  },
};
