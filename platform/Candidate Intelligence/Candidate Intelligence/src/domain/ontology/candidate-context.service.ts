// =============================================================================
// candidate-context.service.ts — candidate intelligence + selection (§15.5)
// -----------------------------------------------------------------------------
// Consumes the shared ontology only (CandidateProfile, ConstituencyProfile,
// relationships, faction/issue links, risks, scores). Writes back
// CandidateSeatAssessment, Score and ActionRecommendation records. It does NOT
// define a separate candidate model — everything is keyed on shared Entity ids.
// =============================================================================
import { prisma } from './db.js';
import { avg, weightedAvg, clamp, ordinalToScore } from './db.js';
import { AuditService } from './audit.service.js';
import { ActionService } from './action.service.js';
import { ScoreService } from './score.service.js';
import {
  Attitude,
  Confidence,
  InfluenceLevel,
  RelationshipType,
  ScoreType,
} from './enums.js';
import type {
  ActorContext,
  CandidateSeatAssessmentResult,
  CandidateComparison,
  CandidateComparisonRow,
  UUID,
} from './types.js';

const ATTITUDE_ORDER = ['HOSTILE', 'SCEPTICAL', 'MIXED', 'NEUTRAL', 'SUPPORTIVE'] as const;
const INFLUENCE_ORDER = ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

// Weights for the overall fit blend. Risk is inverted (high risk lowers fit).
const FIT_WEIGHTS = {
  readiness: 0.18,
  localConnection: 0.16,
  stakeholderCoverage: 0.14,
  localAssociationSupport: 0.12,
  factionAcceptability: 0.12,
  mediaReadiness: 0.1,
  issueCredibility: 0.1,
  developmentPotential: 0.08,
};

export const CandidateContextService = {
  async getCandidateProfile(candidateEntityId: UUID) {
    const profile = await prisma.candidateProfile.findFirst({ where: { entityId: candidateEntityId } });
    const entity = await prisma.entity.findUnique({ where: { id: candidateEntityId } });
    return { entity, profile };
  },

  async getCandidateSeatContext(candidateEntityId: UUID, constituencyEntityId: UUID) {
    const [candidate, constituency, relationships, factionLinks, risks] = await Promise.all([
      prisma.candidateProfile.findFirst({ where: { entityId: candidateEntityId } }),
      prisma.constituencyProfile.findFirst({ where: { entityId: constituencyEntityId } }),
      prisma.relationship.findMany({
        where: { OR: [{ sourceEntityId: candidateEntityId }, { targetEntityId: candidateEntityId }], isCurrent: true },
      }),
      prisma.relationship.findMany({
        where: { sourceEntityId: candidateEntityId, type: { in: [RelationshipType.MEMBER_OF_FACTION, RelationshipType.LEANING_TOWARD_FACTION] }, isCurrent: true },
      }),
      prisma.riskLink.findMany({ where: { entityId: candidateEntityId }, include: { risk: true } }),
    ]);
    return { candidate, constituency, relationships, factionLinks, risks: risks.map((r) => r.risk) };
  },

  /**
   * Deterministic candidate-seat assessment. Blends candidate profile scores
   * with live relationship/faction signal. Every component is explainable.
   */
  async calculateCandidateSeatAssessment(
    candidateEntityId: UUID,
    constituencyEntityId: UUID,
    actor?: ActorContext,
    persist = true,
  ): Promise<CandidateSeatAssessmentResult> {
    const ctx = await this.getCandidateSeatContext(candidateEntityId, constituencyEntityId);
    const c = ctx.candidate;
    if (!c) throw new Error('Candidate profile not found');

    // --- component scores (0..100), falling back to neutral 50 when unknown ---
    const readiness = c.overallReadinessScore ?? avg([c.politicalExperienceScore, c.campaignCapacityScore, c.mediaReadinessScore], 50);
    const localConnection = c.localConnectionScore ?? 50;
    const localAssociationSupport = c.localAssociationSupportScore ?? 50;
    const mediaReadiness = c.mediaReadinessScore ?? 50;
    const issueCredibility = c.issueCredibilityScore ?? 50;
    const developmentPotential = c.developmentPotentialScore ?? 50;

    // stakeholder coverage: blend stored score with live count of supportive,
    // influential ties touching the target constituency.
    const constituencyTies = ctx.relationships.filter(
      (r) => r.sourceEntityId === constituencyEntityId || r.targetEntityId === constituencyEntityId,
    );
    const liveCoverage = clamp(
      avg(
        constituencyTies.map((r) =>
          (ordinalToScore(r.attitude, ATTITUDE_ORDER) + ordinalToScore(r.influenceLevel, INFLUENCE_ORDER) + r.strength * 20) / 3,
        ),
        c.stakeholderStrengthScore ?? 50,
      ),
    );
    const stakeholderCoverage = c.stakeholderStrengthScore != null ? avg([c.stakeholderStrengthScore, liveCoverage], liveCoverage) : liveCoverage;

    // faction acceptability: penalise hostile/sceptical faction ties.
    const factionAcceptability = c.factionAcceptabilityScore ?? (ctx.factionLinks.length
      ? clamp(avg(ctx.factionLinks.map((r) => ordinalToScore(r.attitude, ATTITUDE_ORDER)), 50))
      : 50);

    // risk: prefer stored riskScore, otherwise derive from linked open risks.
    const openRiskCount = ctx.risks.filter((r) => r.status === 'OPEN' || r.status === 'MONITORING' || r.status === 'MITIGATING').length;
    const riskScore = c.riskScore ?? clamp(openRiskCount * 20);

    const overallFit = clamp(
      weightedAvg([
        { value: readiness, weight: FIT_WEIGHTS.readiness },
        { value: localConnection, weight: FIT_WEIGHTS.localConnection },
        { value: stakeholderCoverage, weight: FIT_WEIGHTS.stakeholderCoverage },
        { value: localAssociationSupport, weight: FIT_WEIGHTS.localAssociationSupport },
        { value: factionAcceptability, weight: FIT_WEIGHTS.factionAcceptability },
        { value: mediaReadiness, weight: FIT_WEIGHTS.mediaReadiness },
        { value: issueCredibility, weight: FIT_WEIGHTS.issueCredibility },
        { value: developmentPotential, weight: FIT_WEIGHTS.developmentPotential },
      ]) - riskScore * 0.15,
    );

    // strengths / weaknesses from the component spread
    const components: Record<string, number> = {
      'readiness': readiness,
      'local connection': localConnection,
      'stakeholder coverage': stakeholderCoverage,
      'local association support': localAssociationSupport,
      'faction acceptability': factionAcceptability,
      'media readiness': mediaReadiness,
      'issue credibility': issueCredibility,
      'development potential': developmentPotential,
    };
    const sorted = Object.entries(components).sort((a, b) => b[1] - a[1]);
    const topStrengths = sorted.slice(0, 3).filter(([, v]) => v >= 55).map(([k, v]) => `${k} (${Math.round(v)})`);
    const topWeaknesses = sorted.slice(-3).filter(([, v]) => v < 50).map(([k, v]) => `${k} (${Math.round(v)})`);

    const recommendedActions: string[] = [];
    if (localConnection < 40) recommendedActions.push('Strengthen local links');
    if (localAssociationSupport < 40) recommendedActions.push('Meet local association leadership');
    if (riskScore >= 60) recommendedActions.push('Conduct vetting / mitigation');
    if (mediaReadiness < 40) recommendedActions.push('Prepare media training');

    const confidence: Confidence =
      ctx.relationships.length >= 5 ? Confidence.MEDIUM : ctx.relationships.length >= 1 ? Confidence.LOW : Confidence.LOW;

    const result: CandidateSeatAssessmentResult = {
      candidateEntityId,
      constituencyEntityId,
      overallFitScore: Math.round(overallFit),
      readinessScore: Math.round(readiness),
      localConnectionScore: Math.round(localConnection),
      stakeholderCoverageScore: Math.round(stakeholderCoverage),
      localAssociationSupportScore: Math.round(localAssociationSupport),
      factionAcceptabilityScore: Math.round(factionAcceptability),
      mediaReadinessScore: Math.round(mediaReadiness),
      issueCredibilityScore: Math.round(issueCredibility),
      riskScore: Math.round(riskScore),
      developmentPotentialScore: Math.round(developmentPotential),
      summary: `Overall fit ${Math.round(overallFit)}/100 for the target seat. ${topStrengths.length ? 'Strengths: ' + topStrengths.join(', ') + '. ' : ''}${topWeaknesses.length ? 'Watch: ' + topWeaknesses.join(', ') + '.' : ''}`.trim(),
      topStrengths,
      topWeaknesses,
      recommendedActions,
      evidenceSummary: `${ctx.relationships.length} current relationships, ${ctx.factionLinks.length} faction links, ${openRiskCount} open risks considered.`,
      confidence,
    };

    if (persist) {
      await prisma.candidateSeatAssessment.create({
        data: {
          candidateEntityId,
          constituencyEntityId,
          overallFitScore: result.overallFitScore,
          readinessScore: result.readinessScore,
          localConnectionScore: result.localConnectionScore,
          stakeholderCoverageScore: result.stakeholderCoverageScore,
          localAssociationSupportScore: result.localAssociationSupportScore,
          factionAcceptabilityScore: result.factionAcceptabilityScore,
          mediaReadinessScore: result.mediaReadinessScore,
          issueCredibilityScore: result.issueCredibilityScore,
          riskScore: result.riskScore,
          developmentPotentialScore: result.developmentPotentialScore,
          summary: result.summary,
          topStrengths: result.topStrengths,
          topWeaknesses: result.topWeaknesses,
          recommendedActions: result.recommendedActions,
          evidenceSummary: result.evidenceSummary,
          confidence: result.confidence,
        },
      });
      await ScoreService.recordScore(
        { subjectEntityId: candidateEntityId, contextEntityId: constituencyEntityId, scoreType: ScoreType.CANDIDATE_SEAT_FIT, value: result.overallFitScore, confidence: result.confidence, sourceModule: 'candidate-selection', rationale: result.summary },
        actor,
      );
      await AuditService.record(
        { action: 'candidate.assess', objectType: 'CandidateSeatAssessment', objectId: candidateEntityId, entityId: candidateEntityId, after: result as never, actor },
      );
    }

    return result;
  },

  async compareCandidatesForSeat(candidateEntityIds: UUID[], constituencyEntityId: UUID, actor?: ActorContext): Promise<CandidateComparison> {
    const rows: CandidateComparisonRow[] = [];
    for (const id of candidateEntityIds) {
      const entity = await prisma.entity.findUnique({ where: { id }, select: { displayName: true } });
      const assessment = await this.calculateCandidateSeatAssessment(id, constituencyEntityId, actor, false);
      rows.push({ candidateEntityId: id, displayName: entity?.displayName ?? id, assessment });
    }
    const best = (sel: (a: CandidateSeatAssessmentResult) => number) =>
      rows.length ? [...rows].sort((a, b) => sel(b.assessment) - sel(a.assessment))[0].candidateEntityId : undefined;

    return {
      constituencyEntityId,
      rows,
      strongest: best((a) => a.overallFitScore),
      safest: best((a) => -a.riskScore),
      mostLocallyCredible: best((a) => a.localConnectionScore),
      mostFactionallyAcceptable: best((a) => a.factionAcceptabilityScore),
      highestRisk: best((a) => a.riskScore),
      mostDevelopable: best((a) => a.developmentPotentialScore),
    };
  },

  async getCandidateRisks(candidateEntityId: UUID) {
    const links = await prisma.riskLink.findMany({ where: { entityId: candidateEntityId }, include: { risk: true } });
    return links.map((l) => ({ role: l.role, risk: l.risk }));
  },

  /** Generate (and persist) development actions for the candidate via the rules engine. */
  async getCandidateDevelopmentActions(candidateEntityId: UUID, constituencyEntityId?: UUID, actor?: ActorContext) {
    return ActionService.generateCandidateActions(candidateEntityId, constituencyEntityId, actor);
  },

  // expose for callers that want the attitude/influence helpers
  _enums: { Attitude, InfluenceLevel },
};
