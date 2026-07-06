// =============================================================================
// types.ts — domain types and service input/output shapes
// =============================================================================
import type {
  EntityType,
  EntityStatus,
  Visibility,
  PersonType,
  OrganisationType,
  TargetStatus,
  StrategicPriority,
  CandidateStatus,
  VettingStatus,
  FactionType,
  LeadershipAlignment,
  FactionMood,
  IssueCategory,
  PolicyStatus,
  RelationshipType,
  RelationshipDirection,
  Attitude,
  InfluenceLevel,
  Confidence,
  EvidenceRole,
  SourceType,
  Reliability,
  DataClassification,
  EventType,
  ParticipantRole,
  RiskType,
  Severity,
  Likelihood,
  Urgency,
  RiskStatus,
  RiskLinkRole,
  ScoreType,
  FPTPScenarioType,
  FPTPRecommendationLabel,
  PolicyImpactType,
  ImpactDirection,
  ActionType,
  ActionPriority,
  ActionStatus,
  ApprovalRequirement,
  ComplianceFlagType,
} from './enums.js';

export type UUID = string;
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/** Common actor context threaded through every write so the audit log is complete. */
export interface ActorContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// -----------------------------------------------------------------------------
// Entity
// -----------------------------------------------------------------------------
export interface CreateEntityInput {
  type: EntityType;
  displayName: string;
  canonicalName?: string;
  slug?: string; // auto-derived from displayName if omitted
  description?: string;
  status?: EntityStatus;
  visibility?: Visibility;
  metadata?: JsonValue;
}

export interface UpdateEntityInput {
  displayName?: string;
  canonicalName?: string;
  slug?: string;
  description?: string;
  status?: EntityStatus;
  visibility?: Visibility;
  metadata?: JsonValue;
}

export interface EntitySearchFilters {
  type?: EntityType | EntityType[];
  status?: EntityStatus | EntityStatus[];
  visibility?: Visibility | Visibility[];
  limit?: number;
  offset?: number;
}

// -----------------------------------------------------------------------------
// Relationship
// -----------------------------------------------------------------------------
export interface CreateRelationshipInput {
  sourceEntityId: UUID;
  targetEntityId: UUID;
  type: RelationshipType;
  direction?: RelationshipDirection;
  strength?: number; // 1..5
  attitude?: Attitude;
  influenceLevel?: InfluenceLevel;
  confidence?: Confidence;
  visibility?: Visibility;
  relationshipOwnerUserId?: string;
  relationshipOwnerEntityId?: UUID;
  lastInteractionAt?: Date;
  validFrom?: Date;
  validTo?: Date;
  isCurrent?: boolean;
  summary?: string;
  privateNotes?: string;
}

export type UpdateRelationshipInput = Partial<Omit<CreateRelationshipInput, 'sourceEntityId' | 'targetEntityId'>>;

export interface RelationshipFilters {
  type?: RelationshipType | RelationshipType[];
  attitude?: Attitude | Attitude[];
  confidence?: Confidence | Confidence[];
  influenceLevel?: InfluenceLevel | InfluenceLevel[];
  isCurrent?: boolean;
  staleBeforeDays?: number;
  direction?: 'in' | 'out' | 'any';
}

export interface GraphNode {
  entityId: UUID;
  type: EntityType;
  displayName: string;
  depth: number;
}

export interface GraphEdge {
  id: UUID;
  sourceEntityId: UUID;
  targetEntityId: UUID;
  type: RelationshipType;
  strength: number;
  attitude: Attitude;
  influenceLevel: InfluenceLevel;
  isCurrent: boolean;
  lastInteractionAt: Date | null;
}

export interface RelationshipGraph {
  rootEntityId: UUID;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RelationshipGap {
  kind:
    | 'CANDIDATE_NO_LOCAL_ASSOCIATION_LINK'
    | 'STAKEHOLDER_NO_OWNER'
    | 'HIGH_INFLUENCE_NOT_CONTACTED'
    | 'POLICY_AFFECTS_STAKEHOLDER_NO_BRIEFING'
    | 'CANDIDATE_WEAK_STAKEHOLDER_COVERAGE';
  subjectEntityId: UUID;
  relatedEntityId?: UUID;
  description: string;
}

// -----------------------------------------------------------------------------
// Evidence
// -----------------------------------------------------------------------------
export interface CreateEvidenceInput {
  title: string;
  sourceType?: SourceType;
  url?: string;
  fileId?: string;
  rawText?: string;
  summary?: string;
  sourceDate?: Date;
  observedAt?: Date;
  reliability?: Reliability;
  visibility?: Visibility;
  dataClassification?: DataClassification;
}

// -----------------------------------------------------------------------------
// Event
// -----------------------------------------------------------------------------
export interface CreateEventInput {
  eventType: EventType;
  title: string;
  summary?: string;
  occurredAt: Date;
  location?: string;
  constituencyEntityId?: UUID;
  issueEntityId?: UUID;
  sourceEvidenceId?: UUID;
  confidence?: Confidence;
  visibility?: Visibility;
  participants?: { entityId: UUID; participantRole?: ParticipantRole }[];
}

export interface ExtractedCommitment {
  fromEntityId: UUID;
  toEntityId: UUID;
  description: string;
  relationshipType: RelationshipType;
}

// -----------------------------------------------------------------------------
// Risk
// -----------------------------------------------------------------------------
export interface CreateRiskInput {
  riskType: RiskType;
  title: string;
  description?: string;
  severity?: Severity;
  likelihood?: Likelihood;
  urgency?: Urgency;
  status?: RiskStatus;
  confidence?: Confidence;
  ownerUserId?: string;
  sourceModule?: string;
  rationale?: string;
  mitigation?: string;
  /** entities this risk attaches to, with their role */
  links?: { entityId: UUID; role?: RiskLinkRole }[];
}

export type UpdateRiskInput = Partial<Omit<CreateRiskInput, 'links'>>;

// -----------------------------------------------------------------------------
// Score
// -----------------------------------------------------------------------------
export interface CreateScoreInput {
  subjectEntityId: UUID;
  contextEntityId?: UUID;
  scoreType: ScoreType;
  value: number;
  scaleMin?: number;
  scaleMax?: number;
  confidence?: Confidence;
  sourceModule?: string;
  modelVersion?: string;
  rationale?: string;
}

// -----------------------------------------------------------------------------
// Candidate-seat assessment
// -----------------------------------------------------------------------------
export interface CandidateSeatAssessmentResult {
  candidateEntityId: UUID;
  constituencyEntityId: UUID;
  overallFitScore: number;
  readinessScore: number;
  localConnectionScore: number;
  stakeholderCoverageScore: number;
  localAssociationSupportScore: number;
  factionAcceptabilityScore: number;
  mediaReadinessScore: number;
  issueCredibilityScore: number;
  riskScore: number;
  developmentPotentialScore: number;
  summary: string;
  topStrengths: string[];
  topWeaknesses: string[];
  recommendedActions: string[];
  evidenceSummary: string;
  confidence: Confidence;
}

export interface CandidateComparisonRow {
  candidateEntityId: UUID;
  displayName: string;
  assessment: CandidateSeatAssessmentResult;
}

export interface CandidateComparison {
  constituencyEntityId: UUID;
  rows: CandidateComparisonRow[];
  strongest?: UUID;
  safest?: UUID;
  mostLocallyCredible?: UUID;
  mostFactionallyAcceptable?: UUID;
  highestRisk?: UUID;
  mostDevelopable?: UUID;
}

// -----------------------------------------------------------------------------
// FPTP
// -----------------------------------------------------------------------------
export interface FPTPContext {
  constituencyEntityId: UUID;
  candidateEntityId?: UUID;
  electionHistory: {
    electionDate: Date;
    partyEntityId: string | null;
    candidateEntityId: string | null;
    votes: number;
    voteShare: number;
    position: number;
  }[];
  seatAssessment: CandidateSeatAssessmentResult | null;
  localPartyStrength: number | null;
  stakeholderCoverageScore: number | null;
  issueVolatility: number | null;
  tacticalVotingRisk: number | null;
  spoilerRisk: number | null;
  targetStatus: TargetStatus | null;
  strategicPriority: StrategicPriority | null;
}

export interface SaveFPTPScenarioInput {
  constituencyEntityId: UUID;
  candidateEntityId?: UUID;
  scenarioType: FPTPScenarioType;
  title: string;
  assumptions?: JsonValue;
  estimatedWinProbability?: number;
  estimatedVoteShareLow?: number;
  estimatedVoteShareMid?: number;
  estimatedVoteShareHigh?: number;
  strategicValueScore?: number;
  resourceWasteRisk?: number;
  spoilerRisk?: number;
  tacticalVotingRisk?: number;
  localPartyImpact?: string;
  stakeholderImpact?: string;
  candidateDevelopmentValue?: number;
  futureElectionValue?: number;
  recommendationLabel?: FPTPRecommendationLabel;
  rationale?: string;
  confidence?: Confidence;
}

// -----------------------------------------------------------------------------
// Faction
// -----------------------------------------------------------------------------
export interface FactionRiskResult {
  subjectEntityId: UUID;
  factionEntityId: UUID;
  factionName: string;
  riskLevel: InfluenceLevel;
  rationale: string;
}

// -----------------------------------------------------------------------------
// Policy radius
// -----------------------------------------------------------------------------
export interface SavePolicyImpactInput {
  policyEntityId: UUID;
  affectedEntityId: UUID;
  impactType: PolicyImpactType;
  impactDirection?: ImpactDirection;
  severity?: Severity;
  confidence?: Confidence;
  rationale?: string;
  recommendedActionId?: UUID;
}

// -----------------------------------------------------------------------------
// Action
// -----------------------------------------------------------------------------
export interface CreateActionInput {
  title: string;
  description?: string;
  actionType: ActionType;
  priority?: ActionPriority;
  status?: ActionStatus;
  targetEntityId?: UUID;
  ownerUserId?: string;
  ownerEntityId?: UUID;
  dueDate?: Date;
  sourceModule?: string;
  rationale?: string;
  expectedBenefit?: string;
  downsideIfIgnored?: string;
  approvalRequirement?: ApprovalRequirement;
  relatedRiskId?: UUID;
  relatedScenarioId?: UUID;
  relatedPolicyImpactId?: UUID;
}

// -----------------------------------------------------------------------------
// Compliance
// -----------------------------------------------------------------------------
export interface CreateComplianceFlagInput {
  entityId: UUID;
  flagType: ComplianceFlagType;
  severity?: Severity;
  description?: string;
  reviewOwnerUserId?: string;
}

// -----------------------------------------------------------------------------
// War room
// -----------------------------------------------------------------------------
export interface WarRoomFilters {
  visibility?: Visibility | Visibility[];
  limit?: number;
}

export interface WarRoomSummary {
  topRisks: unknown[];
  overdueActions: unknown[];
  staleRelationships: unknown[];
  pendingCandidateDecisions: unknown[];
  highRiskConstituencies: unknown[];
  policyAlerts: unknown[];
  recentChanges: unknown[];
}
