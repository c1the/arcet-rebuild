// =============================================================================
// types.ts — candidate-intelligence domain + service I/O shapes
// =============================================================================
import type { ActorContext, UUID, JsonValue } from '../ontology/types.js';
import type { Confidence, Severity, Likelihood } from '../ontology/enums.js';
import type {
  CandidateAssessmentType,
  CandidateOverallRecommendation,
  CandidateDimensionType,
  CandidateVulnerabilityType,
  CandidateComparisonRecommendationLabel,
} from './enums.js';

export type { ActorContext, UUID, JsonValue };

// -----------------------------------------------------------------------------
// Weights (mirrors CandidateScoreWeightConfig). Risk weight is negative.
// -----------------------------------------------------------------------------
export interface WeightConfig {
  politicalExperienceWeight: number;
  localConnectionWeight: number;
  stakeholderCoverageWeight: number;
  localAssociationSupportWeight: number;
  factionAcceptabilityWeight: number;
  issueCredibilityWeight: number;
  mediaReadinessWeight: number;
  campaignCapacityWeight: number;
  riskProfileWeight: number; // negative
  developmentPotentialWeight: number;
}

// -----------------------------------------------------------------------------
// A single dimension's computed result.
// -----------------------------------------------------------------------------
export interface DimensionResult {
  dimensionType: CandidateDimensionType;
  score: number; // 0..100
  confidence: Confidence;
  rationale: string;
  positiveDrivers: string[];
  negativeDrivers: string[];
  evidenceIds: UUID[];
  missingData: string[];
}

// The ten dimension scores keyed by dimension (0..100). RISK_PROFILE is a risk
// score (higher = worse); all others are higher = better.
export type DimensionScores = Record<CandidateDimensionType, number>;

// -----------------------------------------------------------------------------
// Evidence-quality signal used for confidence (brief §7.3).
// -----------------------------------------------------------------------------
export interface EvidenceQuality {
  evidenceCount: number;
  confirmedRelationshipCount: number;
  missingFieldCount: number;
  daysSinceLastAssessment: number | null;
  conflictingSources: boolean;
  staleEvidence: boolean;
}

// -----------------------------------------------------------------------------
// Per-dimension signal inputs (already fetched by the services). All booleans
// default to false / undefined; numeric 0..100 sub-signals are optional.
// -----------------------------------------------------------------------------
export interface ExperienceSignals {
  priorElectedOffice?: boolean;
  partyRole?: boolean;
  councilExperience?: boolean;
  parliamentaryExperience?: boolean;
  campaignLeadership?: boolean;
  publicSectorExperience?: boolean;
  leadershipExperience?: boolean;
  strongPublicSpeaking?: boolean;
  previousCandidacy?: boolean;
  noPoliticalExperience?: boolean;
  failedPriorCampaignUnmitigated?: boolean;
  poorOperationalReliability?: boolean;
}

export interface LocalConnectionSignals {
  livesInConstituency?: boolean;
  workedInConstituency?: boolean;
  localRoots?: boolean;
  previousLocalCampaigning?: boolean;
  localEndorsementCount?: number;
  localStakeholderStrength?: number; // 0..100
  relevantIssueWork?: boolean;
  parachuteRisk?: boolean;
  localAssociationHostility?: boolean;
  localMediaAuthenticityCriticism?: boolean;
  weakLocalIssueKnowledge?: boolean;
}

export interface StakeholderCoverageSignals {
  keyStakeholderCount: number;
  highInfluenceCoveredCount: number;
  recentPositiveInteractions?: number;
  ownersAssignedCount?: number;
  completedFollowups?: number;
  endorsements?: number;
  keyGaps?: number;
  staleHighValue?: number;
  hostileStakeholders?: number;
  overdueCommitments?: number;
}

export interface LocalAssociationSignals {
  chairAttitudeScore?: number; // 0..100
  councillorSupport?: boolean;
  activistSupport?: boolean;
  selectionCommitteeSupport?: boolean;
  completedMeetings?: number;
  fulfilledCommitments?: number;
  opposition?: boolean;
  unresolvedGrievance?: boolean;
  factionalSelectionRisk?: boolean;
  imposedWithoutConsultation?: boolean;
  missedMeetingOrCommitment?: boolean;
}

export interface FactionSignals {
  brokerSupport?: boolean;
  factionMoodScore?: number; // 0..100 (higher = calmer/friendlier)
  crossFactionAcceptability?: boolean;
  highInfluenceOpposition?: boolean;
  linkedToHostileFaction?: boolean;
  policyFactionDispute?: boolean;
  proxyFightRisk?: boolean;
  missedCommitmentToFactionFigure?: boolean;
}

export interface IssueCredibilitySignals {
  demonstratedExpertise?: boolean;
  consistentStatements?: boolean;
  localIssueInvolvement?: boolean;
  stakeholderSupportOnIssue?: boolean;
  clearPosition?: boolean;
  contradictoryStatements?: boolean;
  lackOfKnowledge?: boolean;
  highSalienceNoCredibility?: boolean;
  policyRadiusRisk?: boolean;
  vulnerableToAttack?: boolean;
}

export interface MediaSignals {
  successfulInterviews?: boolean;
  disciplinedMessaging?: boolean;
  goodPublicSpeaking?: boolean;
  lowAttackSurface?: boolean;
  preparedLines?: boolean;
  hostileInterviewFailures?: boolean;
  riskyOldPosts?: boolean;
  unresolvedMediaVulnerability?: boolean;
  poorMessageDiscipline?: boolean;
  noTrainingInHighRiskSeat?: boolean;
}

export interface CampaignCapacitySignals {
  strongTeam?: boolean;
  volunteerAppeal?: boolean;
  fundraisingAbility?: boolean;
  localInfrastructure?: boolean;
  operationalReliability?: boolean;
  weakAvailability?: boolean;
  weakVolunteerBase?: boolean;
  noCampaignTeam?: boolean;
  lowFundraising?: boolean;
  repeatedMissedDeadlines?: boolean;
}

export interface RiskSignals {
  openRiskSeverities: Severity[]; // current open candidate risks
  unresolvedVetting?: boolean;
  mediaVulnerability?: boolean;
  factionHostility?: boolean;
  localBacklash?: boolean;
  policyContradiction?: boolean;
  complianceFlag?: boolean;
  donorReputationConcern?: boolean;
  unresolvedCommitment?: boolean;
  hostileHighProfileStakeholder?: boolean;
}

export interface DevelopmentSignals {
  weaknessesFixable?: boolean;
  daysUntilSelection?: number | null;
  candidateResponsive?: boolean;
  clearActionsExist?: boolean;
  relationshipsCanBeBuilt?: boolean;
  improvingTrend?: boolean;
  fatalOrStructuralWeakness?: boolean;
  candidateUnwilling?: boolean;
  noPathToLocalLegitimacy?: boolean;
  unresolvedHighSeverityRisk?: boolean;
}

// -----------------------------------------------------------------------------
// Overall assessment result (drives CandidateSeatAssessment + CandidateAssessmentRun).
// -----------------------------------------------------------------------------
export interface OverallAssessment {
  overallScore: number; // 0..100, risk-discounted
  recommendation: CandidateOverallRecommendation;
  confidence: Confidence;
  positiveDrivers: string[];
  negativeDrivers: string[];
  summary: string;
}

export interface RunAssessmentOptions {
  assessmentType?: CandidateAssessmentType;
  weightConfigId?: UUID;
  persist?: boolean;
  signals?: Partial<DimensionSignalBundle>;
}

export interface DimensionSignalBundle {
  experience: ExperienceSignals;
  localConnection: LocalConnectionSignals;
  stakeholderCoverage: StakeholderCoverageSignals;
  localAssociation: LocalAssociationSignals;
  faction: FactionSignals;
  issueCredibility: IssueCredibilitySignals;
  media: MediaSignals;
  campaign: CampaignCapacitySignals;
  risk: RiskSignals;
  development: DevelopmentSignals;
}

// -----------------------------------------------------------------------------
// Comparison
// -----------------------------------------------------------------------------
export interface ComparisonEntryResult {
  candidateEntityId: UUID;
  rankOverall: number;
  overallFitScore: number;
  dimensionScores: DimensionScores;
  recommendationLabel: CandidateComparisonRecommendationLabel;
  rationale: string;
}

export interface ComparisonResult {
  constituencyEntityId: UUID;
  entries: ComparisonEntryResult[];
  winner?: UUID;
  safest?: UUID;
  highestUpside?: UUID;
  bestLocalFit?: UUID;
  mostFactionallyAcceptable?: UUID;
  highestRisk?: UUID;
  summary: string;
}

// -----------------------------------------------------------------------------
// FPTP input object (brief §15.1)
// -----------------------------------------------------------------------------
export interface CandidateFPTPInput {
  candidateEntityId: UUID;
  constituencyEntityId: UUID;
  candidateSeatFitScore: number;
  localConnectionScore: number;
  stakeholderCoverageScore: number;
  localAssociationSupportScore: number;
  factionAcceptabilityScore: number;
  mediaReadinessScore: number;
  issueCredibilityScore: number;
  riskScore: number;
  developmentPotentialScore: number;
  confidence: Confidence;
  topRisks: string[];
  topStrengths: string[];
  candidateAssumptions: string[];
  staleDataWarnings: string[];
  evidenceSummary: string;
}

// -----------------------------------------------------------------------------
// Vulnerability detection input
// -----------------------------------------------------------------------------
export interface DetectedVulnerability {
  vulnerabilityType: CandidateVulnerabilityType;
  title: string;
  description: string;
  severity: Severity;
  likelihood: Likelihood;
  rationale: string;
}
