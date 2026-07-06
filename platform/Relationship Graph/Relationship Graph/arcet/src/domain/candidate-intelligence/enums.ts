// =============================================================================
// enums.ts — candidate-intelligence enums mirroring the CI section of
// schema.prisma. Defined independently of the generated Prisma client so the
// domain layer (types, validators, rules) typechecks before `prisma generate`.
// =============================================================================

export const CandidateAssessmentType = {
  GENERAL_CANDIDATE_ASSESSMENT: 'GENERAL_CANDIDATE_ASSESSMENT',
  CANDIDATE_SEAT_FIT: 'CANDIDATE_SEAT_FIT',
  SELECTION_COMPARISON: 'SELECTION_COMPARISON',
  DEVELOPMENT_REVIEW: 'DEVELOPMENT_REVIEW',
  RISK_REVIEW: 'RISK_REVIEW',
  FPTP_INPUT_REVIEW: 'FPTP_INPUT_REVIEW',
} as const;
export type CandidateAssessmentType = (typeof CandidateAssessmentType)[keyof typeof CandidateAssessmentType];

export const CandidateAssessmentStatus = {
  DRAFT: 'DRAFT',
  GENERATED: 'GENERATED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  ARCHIVED: 'ARCHIVED',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type CandidateAssessmentStatus = (typeof CandidateAssessmentStatus)[keyof typeof CandidateAssessmentStatus];

export const CandidateOverallRecommendation = {
  STRONG_FIT: 'STRONG_FIT',
  VIABLE_WITH_ACTIONS: 'VIABLE_WITH_ACTIONS',
  HIGH_UPSIDE_HIGH_RISK: 'HIGH_UPSIDE_HIGH_RISK',
  DEVELOP_BEFORE_SELECTION: 'DEVELOP_BEFORE_SELECTION',
  WEAK_FIT: 'WEAK_FIT',
  DO_NOT_SELECT: 'DO_NOT_SELECT',
  NEEDS_MORE_DATA: 'NEEDS_MORE_DATA',
} as const;
export type CandidateOverallRecommendation = (typeof CandidateOverallRecommendation)[keyof typeof CandidateOverallRecommendation];

export const CandidateDimensionType = {
  POLITICAL_EXPERIENCE: 'POLITICAL_EXPERIENCE',
  LOCAL_CONNECTION: 'LOCAL_CONNECTION',
  STAKEHOLDER_COVERAGE: 'STAKEHOLDER_COVERAGE',
  LOCAL_ASSOCIATION_SUPPORT: 'LOCAL_ASSOCIATION_SUPPORT',
  FACTION_ACCEPTABILITY: 'FACTION_ACCEPTABILITY',
  ISSUE_CREDIBILITY: 'ISSUE_CREDIBILITY',
  MEDIA_READINESS: 'MEDIA_READINESS',
  CAMPAIGN_CAPACITY: 'CAMPAIGN_CAPACITY',
  RISK_PROFILE: 'RISK_PROFILE',
  DEVELOPMENT_POTENTIAL: 'DEVELOPMENT_POTENTIAL',
} as const;
export type CandidateDimensionType = (typeof CandidateDimensionType)[keyof typeof CandidateDimensionType];

export const CandidateVulnerabilityType = {
  MEDIA: 'MEDIA',
  POLICY_CONTRADICTION: 'POLICY_CONTRADICTION',
  LOCAL_CREDIBILITY: 'LOCAL_CREDIBILITY',
  FACTIONAL: 'FACTIONAL',
  RELATIONSHIP: 'RELATIONSHIP',
  VETTING: 'VETTING',
  COMPLIANCE: 'COMPLIANCE',
  CAMPAIGN_CAPACITY: 'CAMPAIGN_CAPACITY',
  PUBLIC_STATEMENT: 'PUBLIC_STATEMENT',
  OPPOSITION_ATTACK: 'OPPOSITION_ATTACK',
  OTHER: 'OTHER',
} as const;
export type CandidateVulnerabilityType = (typeof CandidateVulnerabilityType)[keyof typeof CandidateVulnerabilityType];

export const CandidateVulnerabilityStatus = {
  OPEN: 'OPEN',
  MITIGATING: 'MITIGATING',
  MITIGATED: 'MITIGATED',
  DISMISSED: 'DISMISSED',
  ESCALATED: 'ESCALATED',
} as const;
export type CandidateVulnerabilityStatus = (typeof CandidateVulnerabilityStatus)[keyof typeof CandidateVulnerabilityStatus];

export const CandidateDevelopmentPlanStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type CandidateDevelopmentPlanStatus = (typeof CandidateDevelopmentPlanStatus)[keyof typeof CandidateDevelopmentPlanStatus];

export const CandidateDevelopmentActionStatus = {
  PROPOSED: 'PROPOSED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type CandidateDevelopmentActionStatus = (typeof CandidateDevelopmentActionStatus)[keyof typeof CandidateDevelopmentActionStatus];

export const CandidateComparisonRecommendationLabel = {
  SELECT: 'SELECT',
  SHORTLIST: 'SHORTLIST',
  DEVELOP: 'DEVELOP',
  HOLD: 'HOLD',
  REJECT: 'REJECT',
  NEEDS_MORE_DATA: 'NEEDS_MORE_DATA',
} as const;
export type CandidateComparisonRecommendationLabel = (typeof CandidateComparisonRecommendationLabel)[keyof typeof CandidateComparisonRecommendationLabel];

export const CandidateSelectionDecisionStatus = {
  PROPOSED: 'PROPOSED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DEFERRED: 'DEFERRED',
  OVERRIDDEN: 'OVERRIDDEN',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type CandidateSelectionDecisionStatus = (typeof CandidateSelectionDecisionStatus)[keyof typeof CandidateSelectionDecisionStatus];
