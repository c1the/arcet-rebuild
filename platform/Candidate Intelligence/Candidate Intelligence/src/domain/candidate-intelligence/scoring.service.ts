// =============================================================================
// scoring.service.ts — dimension scoring (brief §10.2, §11)
// -----------------------------------------------------------------------------
// Derives structured signals from the ontology + temporal graph, runs the pure
// dimension scorers, and persists generic Score records. Each calculation
// returns score, confidence, rationale, evidence ids and missing-data warnings.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { CandidateContextService } from '../ontology/candidate-context.service.js';
import { RelationshipService } from '../ontology/relationship.service.js';
import { ScoreService } from '../ontology/score.service.js';
import { Attitude, Confidence, InfluenceLevel, ScoreType, Severity } from '../ontology/enums.js';
import * as rules from './rules.js';
import { CandidateDimensionType as D } from './enums.js';
import type {
  ActorContext,
  DimensionResult,
  DimensionScores,
  DimensionSignalBundle,
  EvidenceQuality,
  UUID,
} from './types.js';

const HOSTILE = new Set([Attitude.HOSTILE, Attitude.SCEPTICAL]);
const HIGH_INF = new Set([InfluenceLevel.HIGH, InfluenceLevel.CRITICAL]);

const DIMENSION_SCORE_TYPE: Record<string, ScoreType> = {
  POLITICAL_EXPERIENCE: ScoreType.CANDIDATE_READINESS,
  LOCAL_CONNECTION: ScoreType.LOCAL_CONNECTION,
  STAKEHOLDER_COVERAGE: ScoreType.STAKEHOLDER_STRENGTH,
  LOCAL_ASSOCIATION_SUPPORT: ScoreType.LOCAL_ASSOCIATION_SUPPORT,
  FACTION_ACCEPTABILITY: ScoreType.FACTION_ACCEPTABILITY,
  ISSUE_CREDIBILITY: ScoreType.ISSUE_CREDIBILITY,
  MEDIA_READINESS: ScoreType.MEDIA_READINESS,
  CAMPAIGN_CAPACITY: ScoreType.CAMPAIGN_CAPACITY,
  RISK_PROFILE: ScoreType.CANDIDATE_RISK,
  DEVELOPMENT_POTENTIAL: ScoreType.OTHER,
};

export const CandidateScoringService = {
  /**
   * Build the structured signal bundle for a candidate/seat from the ontology
   * profile + relationships + faction links + open risks. Where the ontology
   * carries a 0..100 sub-score, it is mapped to the matching signal; where it
   * does not, a conservative neutral default is used and flagged as missing.
   */
  async deriveSignals(candidateEntityId: UUID, constituencyEntityId?: UUID): Promise<{ bundle: DimensionSignalBundle; quality: EvidenceQuality }> {
    const ctx = constituencyEntityId
      ? await CandidateContextService.getCandidateSeatContext(candidateEntityId, constituencyEntityId)
      : { candidate: (await CandidateContextService.getCandidateProfile(candidateEntityId)).profile, constituency: null, relationships: [], factionLinks: [], risks: [] };
    const c = ctx.candidate;

    const constituencyTies = constituencyEntityId
      ? ctx.relationships.filter((r) => r.sourceEntityId === constituencyEntityId || r.targetEntityId === constituencyEntityId)
      : ctx.relationships;
    const highInfluenceCovered = constituencyTies.filter((r) => HIGH_INF.has(r.influenceLevel as never) && !HOSTILE.has(r.attitude as never)).length;
    const hostileStakeholders = ctx.relationships.filter((r) => HOSTILE.has(r.attitude as never)).length;
    const staleHighValue = ctx.relationships.filter((r) => (r.strength ?? 0) >= 4 && r.lastInteractionAt && Date.now() - new Date(r.lastInteractionAt).getTime() > 90 * 86400000).length;
    const openRiskSeverities = (ctx.risks ?? []).filter((r) => r && (r.status === 'OPEN' || r.status === 'MONITORING' || r.status === 'MITIGATING')).map((r) => r.severity as Severity);

    const bundle: DimensionSignalBundle = {
      experience: {
        priorElectedOffice: (c?.politicalExperienceScore ?? 0) >= 60,
        campaignLeadership: (c?.campaignCapacityScore ?? 0) >= 60,
        noPoliticalExperience: (c?.politicalExperienceScore ?? 50) < 20,
      },
      localConnection: {
        localStakeholderStrength: c?.localConnectionScore ?? undefined,
        localAssociationHostility: ctx.relationships.some((r) => HOSTILE.has(r.attitude as never) && HIGH_INF.has(r.influenceLevel as never)),
      },
      stakeholderCoverage: {
        keyStakeholderCount: Math.max(constituencyTies.length, highInfluenceCovered),
        highInfluenceCoveredCount: highInfluenceCovered,
        staleHighValue,
        hostileStakeholders,
      },
      localAssociation: {
        chairAttitudeScore: c?.localAssociationSupportScore ?? undefined,
      },
      faction: {
        factionMoodScore: c?.factionAcceptabilityScore ?? undefined,
        highInfluenceOpposition: ctx.factionLinks?.some((r) => HOSTILE.has(r.attitude as never)) ?? false,
      },
      issueCredibility: {
        demonstratedExpertise: (c?.issueCredibilityScore ?? 0) >= 60,
        clearPosition: (c?.issueCredibilityScore ?? 0) >= 50,
      },
      media: {
        successfulInterviews: (c?.mediaReadinessScore ?? 0) >= 60,
        unresolvedMediaVulnerability: (c?.mediaReadinessScore ?? 100) < 35,
      },
      campaign: {
        strongTeam: (c?.campaignCapacityScore ?? 0) >= 60,
        lowFundraising: (c?.campaignCapacityScore ?? 100) < 35,
      },
      risk: {
        openRiskSeverities,
        unresolvedVetting: c?.vettingStatus === 'IN_PROGRESS' || c?.vettingStatus === 'NOT_STARTED',
      },
      development: {
        weaknessesFixable: true,
        candidateResponsive: true,
        clearActionsExist: true,
        relationshipsCanBeBuilt: staleHighValue > 0 || highInfluenceCovered < constituencyTies.length,
        improvingTrend: (c?.developmentPotentialScore ?? 0) >= 55,
      },
    };

    const knownFields = [c?.politicalExperienceScore, c?.localConnectionScore, c?.localAssociationSupportScore, c?.factionAcceptabilityScore, c?.issueCredibilityScore, c?.mediaReadinessScore, c?.campaignCapacityScore, c?.riskScore, c?.developmentPotentialScore, c?.stakeholderStrengthScore];
    const quality: EvidenceQuality = {
      evidenceCount: ctx.relationships.length + (ctx.risks?.length ?? 0),
      confirmedRelationshipCount: ctx.relationships.filter((r) => r.isCurrent).length,
      missingFieldCount: knownFields.filter((f) => f == null).length,
      daysSinceLastAssessment: null,
      conflictingSources: false,
      staleEvidence: staleHighValue > 0,
    };
    return { bundle, quality };
  },

  scoreAll(bundle: DimensionSignalBundle, confidence: Confidence = Confidence.LOW): DimensionResult[] {
    return [
      rules.scorePoliticalExperience(bundle.experience, confidence),
      rules.scoreLocalConnection(bundle.localConnection, confidence),
      rules.scoreStakeholderCoverage(bundle.stakeholderCoverage, confidence),
      rules.scoreLocalAssociationSupport(bundle.localAssociation, confidence),
      rules.scoreFactionAcceptability(bundle.faction, confidence),
      rules.scoreIssueCredibility(bundle.issueCredibility, confidence),
      rules.scoreMediaReadiness(bundle.media, confidence),
      rules.scoreCampaignCapacity(bundle.campaign, confidence),
      rules.scoreRiskProfile(bundle.risk, confidence),
      rules.scoreDevelopmentPotential(bundle.development, confidence),
    ];
  },

  toScores(results: DimensionResult[]): DimensionScores {
    const out = {} as DimensionScores;
    for (const r of results) out[r.dimensionType] = r.score;
    return out;
  },

  async saveScores(candidateEntityId: UUID, constituencyEntityId: UUID | undefined, results: DimensionResult[], actor?: ActorContext) {
    for (const r of results) {
      await ScoreService.recordScore(
        {
          subjectEntityId: candidateEntityId,
          contextEntityId: constituencyEntityId,
          scoreType: DIMENSION_SCORE_TYPE[r.dimensionType] ?? ScoreType.OTHER,
          value: r.score,
          confidence: r.confidence,
          sourceModule: 'candidate-intelligence',
          rationale: r.rationale,
        },
        actor,
      );
    }
  },
};
