// =============================================================================
// enums.ts — canonical TypeScript enums mirroring prisma/schema.prisma
// -----------------------------------------------------------------------------
// These are defined independently of the generated Prisma client so the domain
// layer (types, validators, rules) can be typechecked and used before
// `prisma generate` has run. Member names are identical to the Prisma enums, so
// values are string-compatible at the database boundary.
// =============================================================================

export const EntityType = {
  PERSON: 'PERSON',
  ORGANISATION: 'ORGANISATION',
  CONSTITUENCY: 'CONSTITUENCY',
  CANDIDATE: 'CANDIDATE',
  FACTION: 'FACTION',
  ISSUE: 'ISSUE',
  POLICY: 'POLICY',
  EVENT: 'EVENT',
  ACTION: 'ACTION',
  RISK: 'RISK',
  SOURCE: 'SOURCE',
  ELECTION: 'ELECTION',
  SCENARIO: 'SCENARIO',
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const EntityStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  DRAFT: 'DRAFT',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
} as const;
export type EntityStatus = (typeof EntityStatus)[keyof typeof EntityStatus];

export const Visibility = {
  PUBLIC_CONTEXT: 'PUBLIC_CONTEXT',
  CLIENT_PRIVATE: 'CLIENT_PRIVATE',
  RESTRICTED: 'RESTRICTED',
  COMPLIANCE_ONLY: 'COMPLIANCE_ONLY',
} as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const PersonType = {
  POLITICIAN: 'POLITICIAN',
  CANDIDATE: 'CANDIDATE',
  ADVISER: 'ADVISER',
  STAFF: 'STAFF',
  STAKEHOLDER: 'STAKEHOLDER',
  JOURNALIST: 'JOURNALIST',
  DONOR: 'DONOR',
  LOCAL_PARTY_OFFICER: 'LOCAL_PARTY_OFFICER',
  ACTIVIST: 'ACTIVIST',
  CAMPAIGN_TEAM: 'CAMPAIGN_TEAM',
  PUBLIC_OFFICIAL: 'PUBLIC_OFFICIAL',
  OTHER: 'OTHER',
} as const;
export type PersonType = (typeof PersonType)[keyof typeof PersonType];

export const OrganisationType = {
  POLITICAL_PARTY: 'POLITICAL_PARTY',
  LOCAL_PARTY_ASSOCIATION: 'LOCAL_PARTY_ASSOCIATION',
  CAMPAIGN_GROUP: 'CAMPAIGN_GROUP',
  CHARITY: 'CHARITY',
  UNION: 'UNION',
  BUSINESS: 'BUSINESS',
  MEDIA_OUTLET: 'MEDIA_OUTLET',
  THINK_TANK: 'THINK_TANK',
  LOCAL_AUTHORITY: 'LOCAL_AUTHORITY',
  PUBLIC_BODY: 'PUBLIC_BODY',
  COMMUNITY_ORGANISATION: 'COMMUNITY_ORGANISATION',
  DONOR_ORGANISATION: 'DONOR_ORGANISATION',
  OTHER: 'OTHER',
} as const;
export type OrganisationType = (typeof OrganisationType)[keyof typeof OrganisationType];

export const TargetStatus = {
  SAFE: 'SAFE',
  LIKELY: 'LIKELY',
  LEAN: 'LEAN',
  MARGINAL: 'MARGINAL',
  TARGET: 'TARGET',
  LONG_SHOT: 'LONG_SHOT',
  UNWINNABLE: 'UNWINNABLE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type TargetStatus = (typeof TargetStatus)[keyof typeof TargetStatus];

export const StrategicPriority = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  MONITOR_ONLY: 'MONITOR_ONLY',
} as const;
export type StrategicPriority = (typeof StrategicPriority)[keyof typeof StrategicPriority];

export const CandidateStatus = {
  PROSPECTIVE: 'PROSPECTIVE',
  LONG_LISTED: 'LONG_LISTED',
  SHORT_LISTED: 'SHORT_LISTED',
  SELECTED: 'SELECTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  INCUMBENT: 'INCUMBENT',
  UNDER_REVIEW: 'UNDER_REVIEW',
} as const;
export type CandidateStatus = (typeof CandidateStatus)[keyof typeof CandidateStatus];

export const VettingStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  CLEARED: 'CLEARED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type VettingStatus = (typeof VettingStatus)[keyof typeof VettingStatus];

export const FactionType = {
  IDEOLOGICAL: 'IDEOLOGICAL',
  REGIONAL: 'REGIONAL',
  LOCAL_ASSOCIATION: 'LOCAL_ASSOCIATION',
  LEADERSHIP_CAMP: 'LEADERSHIP_CAMP',
  CANDIDATE_SELECTION_BLOC: 'CANDIDATE_SELECTION_BLOC',
  DONOR_NETWORK: 'DONOR_NETWORK',
  ISSUE_BASED: 'ISSUE_BASED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type FactionType = (typeof FactionType)[keyof typeof FactionType];

export const LeadershipAlignment = {
  SUPPORTIVE: 'SUPPORTIVE',
  NEUTRAL: 'NEUTRAL',
  SCEPTICAL: 'SCEPTICAL',
  HOSTILE: 'HOSTILE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type LeadershipAlignment = (typeof LeadershipAlignment)[keyof typeof LeadershipAlignment];

export const FactionMood = {
  CALM: 'CALM',
  WATCHING: 'WATCHING',
  AGITATED: 'AGITATED',
  HOSTILE: 'HOSTILE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type FactionMood = (typeof FactionMood)[keyof typeof FactionMood];

export const IssueCategory = {
  ECONOMY: 'ECONOMY',
  HEALTH: 'HEALTH',
  HOUSING: 'HOUSING',
  TRANSPORT: 'TRANSPORT',
  EDUCATION: 'EDUCATION',
  IMMIGRATION: 'IMMIGRATION',
  CRIME: 'CRIME',
  ENVIRONMENT: 'ENVIRONMENT',
  DEFENCE: 'DEFENCE',
  LOCAL_SERVICES: 'LOCAL_SERVICES',
  PLANNING: 'PLANNING',
  TAX: 'TAX',
  WELFARE: 'WELFARE',
  CONSTITUTIONAL: 'CONSTITUTIONAL',
  OTHER: 'OTHER',
} as const;
export type IssueCategory = (typeof IssueCategory)[keyof typeof IssueCategory];

export const PolicyStatus = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  ANNOUNCED: 'ANNOUNCED',
  WITHDRAWN: 'WITHDRAWN',
  ARCHIVED: 'ARCHIVED',
} as const;
export type PolicyStatus = (typeof PolicyStatus)[keyof typeof PolicyStatus];

export const RelationshipType = {
  KNOWS: 'KNOWS',
  INFLUENCES: 'INFLUENCES',
  SUPPORTS: 'SUPPORTS',
  OPPOSES: 'OPPOSES',
  ADVISES: 'ADVISES',
  WORKS_FOR: 'WORKS_FOR',
  REPRESENTS: 'REPRESENTS',
  BELONGS_TO: 'BELONGS_TO',
  FUNDS: 'FUNDS',
  OWES_COMMITMENT_TO: 'OWES_COMMITMENT_TO',
  HAS_ACCESS_TO: 'HAS_ACCESS_TO',
  CONTROLS_ACCESS_TO: 'CONTROLS_ACCESS_TO',
  ALLY_OF: 'ALLY_OF',
  RIVAL_OF: 'RIVAL_OF',
  HOSTILE_TO: 'HOSTILE_TO',
  INTERESTED_IN: 'INTERESTED_IN',
  AFFECTED_BY: 'AFFECTED_BY',
  RESPONSIBLE_FOR: 'RESPONSIBLE_FOR',
  OWNS_RELATIONSHIP_WITH: 'OWNS_RELATIONSHIP_WITH',
  MATTERS_TO_CONSTITUENCY: 'MATTERS_TO_CONSTITUENCY',
  ASSOCIATED_WITH_ISSUE: 'ASSOCIATED_WITH_ISSUE',
  SUPPORTS_POLICY: 'SUPPORTS_POLICY',
  OPPOSES_POLICY: 'OPPOSES_POLICY',
  MEMBER_OF_FACTION: 'MEMBER_OF_FACTION',
  LEANING_TOWARD_FACTION: 'LEANING_TOWARD_FACTION',
  BROKER_FOR: 'BROKER_FOR',
  EVIDENCED_BY: 'EVIDENCED_BY',
  OTHER: 'OTHER',
} as const;
export type RelationshipType = (typeof RelationshipType)[keyof typeof RelationshipType];

export const RelationshipDirection = {
  DIRECTED: 'DIRECTED',
  UNDIRECTED: 'UNDIRECTED',
} as const;
export type RelationshipDirection = (typeof RelationshipDirection)[keyof typeof RelationshipDirection];

export const Attitude = {
  SUPPORTIVE: 'SUPPORTIVE',
  NEUTRAL: 'NEUTRAL',
  MIXED: 'MIXED',
  SCEPTICAL: 'SCEPTICAL',
  HOSTILE: 'HOSTILE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type Attitude = (typeof Attitude)[keyof typeof Attitude];

export const InfluenceLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
  UNKNOWN: 'UNKNOWN',
} as const;
export type InfluenceLevel = (typeof InfluenceLevel)[keyof typeof InfluenceLevel];

export const Confidence = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CONFIRMED: 'CONFIRMED',
} as const;
export type Confidence = (typeof Confidence)[keyof typeof Confidence];

export const EvidenceRole = {
  SUPPORTS: 'SUPPORTS',
  CONTRADICTS: 'CONTRADICTS',
  UPDATES: 'UPDATES',
  WEAK_SIGNAL: 'WEAK_SIGNAL',
  HUMAN_CONFIRMED: 'HUMAN_CONFIRMED',
} as const;
export type EvidenceRole = (typeof EvidenceRole)[keyof typeof EvidenceRole];

export const SourceType = {
  PUBLIC_ARTICLE: 'PUBLIC_ARTICLE',
  MEETING_NOTE: 'MEETING_NOTE',
  EMAIL: 'EMAIL',
  CALL_NOTE: 'CALL_NOTE',
  USER_NOTE: 'USER_NOTE',
  PUBLIC_RECORD: 'PUBLIC_RECORD',
  ELECTION_RESULT: 'ELECTION_RESULT',
  POLLING: 'POLLING',
  SOCIAL_POST: 'SOCIAL_POST',
  DOCUMENT: 'DOCUMENT',
  MANUAL_ENTRY: 'MANUAL_ENTRY',
  MODEL_INFERENCE: 'MODEL_INFERENCE',
  OTHER: 'OTHER',
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

export const Reliability = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  OFFICIAL: 'OFFICIAL',
  UNKNOWN: 'UNKNOWN',
} as const;
export type Reliability = (typeof Reliability)[keyof typeof Reliability];

export const DataClassification = {
  PUBLIC: 'PUBLIC',
  CLIENT_PRIVATE: 'CLIENT_PRIVATE',
  PERSONAL_DATA: 'PERSONAL_DATA',
  SENSITIVE_PERSONAL_DATA: 'SENSITIVE_PERSONAL_DATA',
  SPECIAL_CATEGORY_RISK: 'SPECIAL_CATEGORY_RISK',
  INFERRED_DATA: 'INFERRED_DATA',
  RESTRICTED: 'RESTRICTED',
  COMPLIANCE_ONLY: 'COMPLIANCE_ONLY',
} as const;
export type DataClassification = (typeof DataClassification)[keyof typeof DataClassification];

export const EventType = {
  MEETING: 'MEETING',
  CALL: 'CALL',
  EMAIL: 'EMAIL',
  PUBLIC_STATEMENT: 'PUBLIC_STATEMENT',
  ENDORSEMENT: 'ENDORSEMENT',
  DONATION: 'DONATION',
  PRESS_ARTICLE: 'PRESS_ARTICLE',
  SELECTION_EVENT: 'SELECTION_EVENT',
  POLICY_ANNOUNCEMENT: 'POLICY_ANNOUNCEMENT',
  CAMPAIGN_VISIT: 'CAMPAIGN_VISIT',
  CONTROVERSY: 'CONTROVERSY',
  VOTE: 'VOTE',
  DEBATE: 'DEBATE',
  LOCAL_INCIDENT: 'LOCAL_INCIDENT',
  RELATIONSHIP_UPDATE: 'RELATIONSHIP_UPDATE',
  RISK_UPDATE: 'RISK_UPDATE',
  ACTION_COMPLETED: 'ACTION_COMPLETED',
  OTHER: 'OTHER',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const ParticipantRole = {
  ATTENDEE: 'ATTENDEE',
  HOST: 'HOST',
  SUBJECT: 'SUBJECT',
  MENTIONED: 'MENTIONED',
  AUTHOR: 'AUTHOR',
  TARGET: 'TARGET',
  DECISION_MAKER: 'DECISION_MAKER',
  OBSERVER: 'OBSERVER',
  OTHER: 'OTHER',
} as const;
export type ParticipantRole = (typeof ParticipantRole)[keyof typeof ParticipantRole];

export const RiskType = {
  CANDIDATE_RISK: 'CANDIDATE_RISK',
  CONSTITUENCY_RISK: 'CONSTITUENCY_RISK',
  FACTION_RISK: 'FACTION_RISK',
  RELATIONSHIP_RISK: 'RELATIONSHIP_RISK',
  POLICY_RISK: 'POLICY_RISK',
  MEDIA_RISK: 'MEDIA_RISK',
  COMPLIANCE_RISK: 'COMPLIANCE_RISK',
  DONOR_RISK: 'DONOR_RISK',
  LOCAL_ASSOCIATION_RISK: 'LOCAL_ASSOCIATION_RISK',
  FPTP_STRATEGY_RISK: 'FPTP_STRATEGY_RISK',
  DATA_QUALITY_RISK: 'DATA_QUALITY_RISK',
  OTHER: 'OTHER',
} as const;
export type RiskType = (typeof RiskType)[keyof typeof RiskType];

export const Severity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

export const Likelihood = {
  UNLIKELY: 'UNLIKELY',
  POSSIBLE: 'POSSIBLE',
  LIKELY: 'LIKELY',
  VERY_LIKELY: 'VERY_LIKELY',
  UNKNOWN: 'UNKNOWN',
} as const;
export type Likelihood = (typeof Likelihood)[keyof typeof Likelihood];

export const Urgency = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  IMMEDIATE: 'IMMEDIATE',
} as const;
export type Urgency = (typeof Urgency)[keyof typeof Urgency];

export const RiskStatus = {
  OPEN: 'OPEN',
  MONITORING: 'MONITORING',
  MITIGATING: 'MITIGATING',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const;
export type RiskStatus = (typeof RiskStatus)[keyof typeof RiskStatus];

export const RiskLinkRole = {
  PRIMARY_SUBJECT: 'PRIMARY_SUBJECT',
  AFFECTED: 'AFFECTED',
  CAUSE: 'CAUSE',
  MITIGATION_OWNER: 'MITIGATION_OWNER',
  RELATED: 'RELATED',
  EVIDENCE_SUBJECT: 'EVIDENCE_SUBJECT',
} as const;
export type RiskLinkRole = (typeof RiskLinkRole)[keyof typeof RiskLinkRole];

export const ScoreType = {
  CANDIDATE_READINESS: 'CANDIDATE_READINESS',
  CANDIDATE_SEAT_FIT: 'CANDIDATE_SEAT_FIT',
  LOCAL_CONNECTION: 'LOCAL_CONNECTION',
  MEDIA_READINESS: 'MEDIA_READINESS',
  STAKEHOLDER_STRENGTH: 'STAKEHOLDER_STRENGTH',
  LOCAL_ASSOCIATION_SUPPORT: 'LOCAL_ASSOCIATION_SUPPORT',
  FACTION_ACCEPTABILITY: 'FACTION_ACCEPTABILITY',
  ISSUE_CREDIBILITY: 'ISSUE_CREDIBILITY',
  CAMPAIGN_CAPACITY: 'CAMPAIGN_CAPACITY',
  CANDIDATE_RISK: 'CANDIDATE_RISK',
  CONSTITUENCY_COMPETITIVENESS: 'CONSTITUENCY_COMPETITIVENESS',
  FPTP_WIN_PROBABILITY: 'FPTP_WIN_PROBABILITY',
  FPTP_STRATEGIC_VALUE: 'FPTP_STRATEGIC_VALUE',
  SPOILER_RISK: 'SPOILER_RISK',
  TACTICAL_VOTING_RISK: 'TACTICAL_VOTING_RISK',
  POLICY_BLAST_RADIUS: 'POLICY_BLAST_RADIUS',
  STAKEHOLDER_RISK: 'STAKEHOLDER_RISK',
  FACTION_RISK: 'FACTION_RISK',
  MEDIA_RISK: 'MEDIA_RISK',
  COMPLIANCE_RISK: 'COMPLIANCE_RISK',
  RELATIONSHIP_STRENGTH: 'RELATIONSHIP_STRENGTH',
  RELATIONSHIP_DECAY: 'RELATIONSHIP_DECAY',
  OTHER: 'OTHER',
} as const;
export type ScoreType = (typeof ScoreType)[keyof typeof ScoreType];

export const FPTPScenarioType = {
  RUN_HARD: 'RUN_HARD',
  RUN_SOFT: 'RUN_SOFT',
  STAND_ASIDE: 'STAND_ASIDE',
  CHANGE_CANDIDATE: 'CHANGE_CANDIDATE',
  INCREASE_RESOURCES: 'INCREASE_RESOURCES',
  DECREASE_RESOURCES: 'DECREASE_RESOURCES',
  GATHER_MORE_DATA: 'GATHER_MORE_DATA',
} as const;
export type FPTPScenarioType = (typeof FPTPScenarioType)[keyof typeof FPTPScenarioType];

export const FPTPRecommendationLabel = {
  COMPETE_HARD: 'COMPETE_HARD',
  COMPETE_SELECTIVELY: 'COMPETE_SELECTIVELY',
  SYMBOLIC_RUN: 'SYMBOLIC_RUN',
  STAND_ASIDE: 'STAND_ASIDE',
  DO_NOT_INVEST: 'DO_NOT_INVEST',
  CHANGE_CANDIDATE: 'CHANGE_CANDIDATE',
  GATHER_MORE_DATA: 'GATHER_MORE_DATA',
  ESCALATE_TO_STRATEGIST: 'ESCALATE_TO_STRATEGIST',
} as const;
export type FPTPRecommendationLabel = (typeof FPTPRecommendationLabel)[keyof typeof FPTPRecommendationLabel];

export const PolicyImpactType = {
  AFFECTS_CONSTITUENCY: 'AFFECTS_CONSTITUENCY',
  AFFECTS_CANDIDATE: 'AFFECTS_CANDIDATE',
  AFFECTS_STAKEHOLDER: 'AFFECTS_STAKEHOLDER',
  AFFECTS_FACTION: 'AFFECTS_FACTION',
  AFFECTS_MEDIA: 'AFFECTS_MEDIA',
  AFFECTS_COMPLIANCE: 'AFFECTS_COMPLIANCE',
  AFFECTS_DONOR: 'AFFECTS_DONOR',
  AFFECTS_LOCAL_ASSOCIATION: 'AFFECTS_LOCAL_ASSOCIATION',
  OTHER: 'OTHER',
} as const;
export type PolicyImpactType = (typeof PolicyImpactType)[keyof typeof PolicyImpactType];

export const ImpactDirection = {
  POSITIVE: 'POSITIVE',
  NEGATIVE: 'NEGATIVE',
  MIXED: 'MIXED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type ImpactDirection = (typeof ImpactDirection)[keyof typeof ImpactDirection];

export const ActionType = {
  CALL: 'CALL',
  EMAIL: 'EMAIL',
  MEET: 'MEET',
  BRIEF: 'BRIEF',
  FOLLOW_UP: 'FOLLOW_UP',
  REPAIR_RELATIONSHIP: 'REPAIR_RELATIONSHIP',
  ASSIGN_RELATIONSHIP_OWNER: 'ASSIGN_RELATIONSHIP_OWNER',
  CONDUCT_VETTING: 'CONDUCT_VETTING',
  STRENGTHEN_LOCAL_LINKS: 'STRENGTHEN_LOCAL_LINKS',
  MEET_LOCAL_ASSOCIATION: 'MEET_LOCAL_ASSOCIATION',
  PREPARE_MEDIA_TRAINING: 'PREPARE_MEDIA_TRAINING',
  ADDRESS_VULNERABILITY: 'ADDRESS_VULNERABILITY',
  COMPARE_CANDIDATES: 'COMPARE_CANDIDATES',
  GATHER_LOCAL_DATA: 'GATHER_LOCAL_DATA',
  INCREASE_CAMPAIGN_EFFORT: 'INCREASE_CAMPAIGN_EFFORT',
  DECREASE_CAMPAIGN_EFFORT: 'DECREASE_CAMPAIGN_EFFORT',
  CHECK_MANIFESTO_CONSISTENCY: 'CHECK_MANIFESTO_CONSISTENCY',
  PREPARE_REBUTTAL: 'PREPARE_REBUTTAL',
  DELAY_ANNOUNCEMENT: 'DELAY_ANNOUNCEMENT',
  ESCALATE_COMPLIANCE_REVIEW: 'ESCALATE_COMPLIANCE_REVIEW',
  CONSULT_FACTION_BROKER: 'CONSULT_FACTION_BROKER',
  CHECK_IMPRINT: 'CHECK_IMPRINT',
  CHECK_SPEND_CLASSIFICATION: 'CHECK_SPEND_CLASSIFICATION',
  CHECK_DONATION_ISSUE: 'CHECK_DONATION_ISSUE',
  REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
  OTHER: 'OTHER',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

export const ActionPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type ActionPriority = (typeof ActionPriority)[keyof typeof ActionPriority];

export const ActionStatus = {
  DRAFT: 'DRAFT',
  RECOMMENDED: 'RECOMMENDED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  APPROVED: 'APPROVED',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
  DISMISSED: 'DISMISSED',
} as const;
export type ActionStatus = (typeof ActionStatus)[keyof typeof ActionStatus];

export const ApprovalRequirement = {
  NONE: 'NONE',
  SENIOR_REVIEW: 'SENIOR_REVIEW',
  COMPLIANCE_REVIEW: 'COMPLIANCE_REVIEW',
  LEGAL_REVIEW: 'LEGAL_REVIEW',
  CANDIDATE_APPROVAL: 'CANDIDATE_APPROVAL',
  PARTY_APPROVAL: 'PARTY_APPROVAL',
} as const;
export type ApprovalRequirement = (typeof ApprovalRequirement)[keyof typeof ApprovalRequirement];

export const ComplianceFlagType = {
  PERSONAL_DATA: 'PERSONAL_DATA',
  SENSITIVE_DATA: 'SENSITIVE_DATA',
  SPECIAL_CATEGORY_RISK: 'SPECIAL_CATEGORY_RISK',
  INFERRED_POLITICAL_OPINION: 'INFERRED_POLITICAL_OPINION',
  RESTRICTED_SOURCE: 'RESTRICTED_SOURCE',
  CONTACT_RESTRICTION: 'CONTACT_RESTRICTION',
  DIGITAL_IMPRINT_REQUIRED: 'DIGITAL_IMPRINT_REQUIRED',
  REGULATED_SPEND_RISK: 'REGULATED_SPEND_RISK',
  DONATION_REVIEW_REQUIRED: 'DONATION_REVIEW_REQUIRED',
  LEGAL_REVIEW_REQUIRED: 'LEGAL_REVIEW_REQUIRED',
  DATA_RETENTION_REVIEW: 'DATA_RETENTION_REVIEW',
  OTHER: 'OTHER',
} as const;
export type ComplianceFlagType = (typeof ComplianceFlagType)[keyof typeof ComplianceFlagType];

export const ComplianceFlagStatus = {
  OPEN: 'OPEN',
  IN_REVIEW: 'IN_REVIEW',
  CLEARED: 'CLEARED',
  ESCALATED: 'ESCALATED',
  RESOLVED: 'RESOLVED',
} as const;
export type ComplianceFlagStatus = (typeof ComplianceFlagStatus)[keyof typeof ComplianceFlagStatus];
