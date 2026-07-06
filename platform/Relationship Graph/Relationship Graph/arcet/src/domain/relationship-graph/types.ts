// =============================================================================
// types.ts — relationship-graph domain + scoring signal shapes
// =============================================================================
import type { ActorContext, UUID, JsonValue } from '../ontology/types.js';
import type { Confidence, Severity, InfluenceLevel, Attitude } from '../ontology/enums.js';
import type {
  RelationshipStatus,
  RelationshipNoteType,
  RelationshipGapContextType,
  RelationshipGapType,
  RelationshipScoreType,
} from './enums.js';

export type { ActorContext, UUID, JsonValue };

// -----------------------------------------------------------------------------
// Score result
// -----------------------------------------------------------------------------
export interface ScoreResult {
  scoreType: RelationshipScoreType;
  value: number; // 0..100
  confidence: Confidence;
  rationale: string;
  drivers: string[];
  missingData: string[];
}

// -----------------------------------------------------------------------------
// Scoring signal inputs (services derive these from the ontology + temporal)
// -----------------------------------------------------------------------------
export interface StrengthSignals {
  currentStrength?: number; // 1..5
  recentMeeting?: boolean;
  interactionCount?: number;
  humanConfirmed?: boolean;
  successfulCollaboration?: boolean;
  commitmentFulfilled?: boolean;
  positiveEvidence?: boolean;
  daysSinceInteraction?: number | null;
  missedFollowUp?: boolean;
  hostileStatement?: boolean;
  unresolvedConflict?: boolean;
  uncertain?: boolean;
  oldEvidence?: boolean;
}

export interface TrustSignals {
  currentTrust?: number; // 1..5
  commitmentsFulfilled?: number;
  positiveOutcome?: boolean;
  supportiveStatement?: boolean;
  reliableFollowThrough?: boolean;
  ownerConfirmsTrust?: boolean;
  brokenCommitment?: boolean;
  hostileAction?: boolean;
  leakRisk?: boolean;
  conflict?: boolean;
  unresolvedGrievance?: boolean;
  contradictoryEvidence?: boolean;
}

export interface InfluenceSignals {
  influenceLevel?: InfluenceLevel;
  formalRole?: boolean;
  controlsAccess?: boolean;
  connectedToManyRelevant?: boolean;
  keyToFactionOrAssociation?: boolean;
  affectsContext?: boolean;
}

export interface AccessSignals {
  controlsAccessToTarget?: boolean;
  isGatekeeper?: boolean;
  brokerForTarget?: boolean;
  directRelationshipToTarget?: boolean;
  influenceLevel?: InfluenceLevel;
}

export interface StrategicSignals {
  affectsCandidateSelection?: boolean;
  affectsFPTP?: boolean;
  affectsPolicyLaunch?: boolean;
  affectsFactionRisk?: boolean;
  affectsLocalAssociationSupport?: boolean;
  affectsStakeholderSupport?: boolean;
  affectsMediaRisk?: boolean;
  affectsComplianceDecision?: boolean;
}

export interface StalenessSignals {
  daysSinceInteraction?: number | null;
  overdueCommitment?: boolean;
  highValueNoOwner?: boolean;
  oldEvidence?: boolean;
  recentInteraction?: boolean;
  commitmentFulfilled?: boolean;
  ownerConfirmed?: boolean;
  newEvidence?: boolean;
  influenceLevel?: InfluenceLevel;
}

export interface RepairabilitySignals {
  contactable?: boolean;
  brokerExists?: boolean;
  pastPositiveHistory?: boolean;
  willingness?: boolean;
  fatalBreach?: boolean;
  repeatedHostility?: boolean;
}

export interface RelationshipRiskSignals {
  attitude?: Attitude;
  influenceLevel?: InfluenceLevel;
  unresolvedCommitment?: boolean;
  staleHighValue?: boolean;
  sensitiveData?: boolean;
  factionLink?: boolean;
  donorLink?: boolean;
  complianceFlag?: boolean;
  candidateOrPolicyOrFptpDependency?: boolean;
}

export interface BriefingSignals {
  policyAffectsStakeholder?: boolean;
  candidateSelectionAffectsActor?: boolean;
  fptpAffectsLocalStakeholders?: boolean;
  highInfluence?: boolean;
  attitudeUnknownOrHostile?: boolean;
  priorCommitment?: boolean;
  expectsConsultation?: boolean;
  factionSensitiveIssue?: boolean;
}

// -----------------------------------------------------------------------------
// Access paths
// -----------------------------------------------------------------------------
export interface PathEdgeSignals {
  relationshipId: UUID;
  fromEntityId: UUID;
  toEntityId: UUID;
  strength: number; // 1..5
  trustLevel?: number; // 1..5
  influenceLevel: InfluenceLevel;
  attitude: Attitude;
  confidence: Confidence;
  daysSinceInteraction?: number | null;
  restricted?: boolean;
  inferred?: boolean;
}

export interface PathScore {
  pathQualityScore: number; // 0..100
  pathRiskScore: number; // 0..100 (higher = worse)
  blocked: boolean;
  rationale: string;
}

export interface ScoredPath extends PathScore {
  nodes: UUID[];
  relationshipIds: UUID[];
  pathLength: number;
}

// -----------------------------------------------------------------------------
// Gaps
// -----------------------------------------------------------------------------
export interface DetectedGap {
  contextEntityId: UUID;
  contextType: RelationshipGapContextType;
  missingTargetEntityId?: UUID;
  gapType: RelationshipGapType;
  severity: Severity;
  reason: string;
  confidence: Confidence;
}

// -----------------------------------------------------------------------------
// Aggregate candidate relationship signals (feeds Candidate Intelligence)
// -----------------------------------------------------------------------------
export interface CandidateRelationshipAggregate {
  candidateEntityId: UUID;
  constituencyEntityId?: UUID;
  stakeholderCoverageScore: number;
  localAssociationSupportScore: number;
  factionAcceptabilitySignal: number;
  localConnectionSignal: number;
  mediaRelationshipSignal: number;
  staleHighValueCount: number;
  hostileCount: number;
  openCommitmentCount: number;
  gaps: DetectedGap[];
  confidence: Confidence;
  missingData: string[];
}

// -----------------------------------------------------------------------------
// Graph options + note/tag/import inputs
// -----------------------------------------------------------------------------
export interface GraphOptions {
  depth?: number;
  maxNodes?: number;
  maxEdges?: number;
  staleOnly?: boolean;
  highRiskOnly?: boolean;
  includeArchived?: boolean;
}

export interface AddNoteInput {
  noteType?: RelationshipNoteType;
  body: string;
  visibility?: string;
  dataClassification?: string;
}
