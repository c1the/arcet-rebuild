// =============================================================================
// types.ts — temporal domain + service I/O shapes
// =============================================================================
import type { ActorContext, UUID, JsonValue } from '../ontology/types.js';
import type { Confidence, Visibility, DataClassification, Severity, Attitude, InfluenceLevel } from '../ontology/enums.js';
import type {
  TemporalEventType,
  TemporalEntityRole,
  ObservationType,
  ChangeType,
  SnapshotType,
  CommitmentType,
  CommitmentStatus,
  Sensitivity,
  TimelineItemType,
  TrendDirection,
} from './enums.js';

export type { ActorContext, UUID, JsonValue };

// -----------------------------------------------------------------------------
// Temporal events
// -----------------------------------------------------------------------------
export interface EntityRoleLink {
  entityId: UUID;
  role?: TemporalEntityRole;
}

export interface CreateTemporalEventInput {
  politicalEventId?: UUID;
  eventType: TemporalEventType;
  occurredAt: Date;
  recordedAt?: Date;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  title: string;
  summary?: string;
  sourceModule?: string;
  confidence?: Confidence;
  visibility?: Visibility;
  dataClassification?: DataClassification;
  metadata?: JsonValue;
  entities?: EntityRoleLink[];
}

export interface TemporalEventFilters {
  eventType?: TemporalEventType | TemporalEventType[];
  startDate?: Date;
  endDate?: Date;
  sourceModule?: string;
  limit?: number;
}

// -----------------------------------------------------------------------------
// Observations
// -----------------------------------------------------------------------------
export interface RecordObservationInput {
  subjectEntityId: UUID;
  contextEntityId?: UUID;
  relationshipId?: UUID;
  riskId?: UUID;
  scoreId?: UUID;
  actionRecommendationId?: UUID;
  observationType: ObservationType;
  observedAt?: Date;
  validFrom?: Date;
  validTo?: Date;
  valueNumeric?: number;
  valueText?: string;
  valueJson?: JsonValue;
  confidence?: Confidence;
  sourceModule?: string;
  sourceEvidenceId?: UUID;
  sourceTemporalEventId?: UUID;
}

export interface ObservationFilters {
  startDate?: Date;
  endDate?: Date;
  contextEntityId?: UUID;
  limit?: number;
}

export interface ObservationPoint {
  observedAt: Date;
  value: number;
}

// -----------------------------------------------------------------------------
// Changes
// -----------------------------------------------------------------------------
export interface RecordChangeInput {
  entityId?: UUID;
  relationshipId?: UUID;
  riskId?: UUID;
  scoreId?: UUID;
  actionRecommendationId?: UUID;
  candidateSeatAssessmentId?: UUID;
  fptpScenarioId?: UUID;
  policyImpactId?: UUID;
  changeType: ChangeType;
  fieldName?: string;
  oldValue?: JsonValue;
  newValue?: JsonValue;
  deltaNumeric?: number;
  changedAt?: Date;
  effectiveAt?: Date;
  sourceModule?: string;
  sourceTemporalEventId?: UUID;
  sourceEvidenceId?: UUID;
  rationale?: string;
  confidence?: Confidence;
  significant?: boolean;
}

export interface ChangeFilters {
  changeType?: ChangeType | ChangeType[];
  startDate?: Date;
  endDate?: Date;
  significantOnly?: boolean;
  sourceModule?: string;
  limit?: number;
}

// -----------------------------------------------------------------------------
// Snapshots
// -----------------------------------------------------------------------------
export interface CreateSnapshotInput {
  entityId: UUID;
  snapshotType: SnapshotType;
  snapshotJson: JsonValue;
  snapshotAt?: Date;
  sourceModule?: string;
  modelVersion?: string;
  summary?: string;
}

export interface SnapshotDiff {
  fieldsChanged: { field: string; before: JsonValue; after: JsonValue }[];
  scoresChanged: { key: string; before: number | null; after: number | null; delta: number | null }[];
  added: string[];
  removed: string[];
  summary: string;
}

// -----------------------------------------------------------------------------
// Relationship temporal state
// -----------------------------------------------------------------------------
export interface RecordRelationshipStateInput {
  relationshipId: UUID;
  observedAt?: Date;
  strength?: number;
  attitude?: Attitude;
  influenceLevel?: InfluenceLevel;
  trustLevel?: number;
  stalenessScore?: number;
  decayScore?: number;
  lastInteractionAt?: Date;
  openCommitmentCount?: number;
  hostilitySignalCount?: number;
  positiveSignalCount?: number;
  confidence?: Confidence;
  rationale?: string;
  sourceTemporalEventId?: UUID;
}

// -----------------------------------------------------------------------------
// Commitments
// -----------------------------------------------------------------------------
export interface CreateCommitmentInput {
  fromEntityId: UUID;
  toEntityId?: UUID;
  relatedIssueEntityId?: UUID;
  relatedConstituencyEntityId?: UUID;
  relatedPolicyEntityId?: UUID;
  relatedCandidateEntityId?: UUID;
  title: string;
  description?: string;
  commitmentType?: CommitmentType;
  status?: CommitmentStatus;
  createdFromEventId?: UUID;
  createdFromEvidenceId?: UUID;
  promisedAt?: Date;
  dueAt?: Date;
  sensitivity?: Sensitivity;
  visibility?: Visibility;
  confidence?: Confidence;
  ownerUserId?: string;
}

export interface UpdateCommitmentInput {
  status?: CommitmentStatus;
  dueAt?: Date | null;
  description?: string | null;
  sensitivity?: Sensitivity;
}

// -----------------------------------------------------------------------------
// Timeline
// -----------------------------------------------------------------------------
export interface TimelineItem {
  itemType: TimelineItemType;
  itemAt: Date;
  title: string;
  summary?: string;
  sourceObjectType?: string;
  sourceObjectId?: string;
  severity?: Severity;
  confidence?: Confidence;
  visibility?: Visibility;
}

export interface TimelineFilters {
  startDate?: Date;
  endDate?: Date;
  itemTypes?: TimelineItemType[];
  eventType?: TemporalEventType;
  changeType?: ChangeType;
  minSeverity?: Severity;
  sourceModule?: string;
  confidence?: Confidence;
  visibility?: Visibility;
  limit?: number;
}

// -----------------------------------------------------------------------------
// Trends
// -----------------------------------------------------------------------------
export interface TrendResult {
  subjectEntityId: UUID;
  observationType: ObservationType;
  direction: TrendDirection;
  magnitude: number; // net change over the window, in score units
  slopePerDay: number;
  volatility: number; // std-dev of step-to-step deltas
  first: ObservationPoint | null;
  last: ObservationPoint | null;
  n: number;
  confidence: Confidence;
  topContributingChanges: { changedAt: Date; deltaNumeric: number | null; rationale?: string }[];
  recommendedAction?: string;
}

// -----------------------------------------------------------------------------
// Decay
// -----------------------------------------------------------------------------
export interface DecayResult {
  relationshipId: UUID;
  stalenessScore: number; // 0..100
  decayScore: number; // 0..100
  daysSinceInteraction: number | null;
  band: 'FRESH' | 'MILD' | 'STALE' | 'HIGH' | 'UNMANAGED_HOSTILE';
  isHostile: boolean;
  hasOverdueCommitment: boolean;
  rationale: string;
  recommendedAction?: string;
}

export interface CommitmentUrgency {
  commitmentId: UUID;
  status: CommitmentStatus;
  daysUntilDue: number | null;
  overdue: boolean;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'IMMEDIATE';
  rationale: string;
}

// -----------------------------------------------------------------------------
// FPTP staleness
// -----------------------------------------------------------------------------
export interface FPTPStalenessResult {
  fptpScenarioId: UUID;
  stale: boolean;
  reasons: string[];
  staleAssumptions: string[];
  recommendRerun: boolean;
}

// -----------------------------------------------------------------------------
// War-room temporal summaries
// -----------------------------------------------------------------------------
export interface RecentChangesFilters {
  sinceDate?: Date;
  sinceDays?: number;
  limit?: number;
  significantOnly?: boolean;
}

export interface WarRoomTemporalBriefing {
  since: Date;
  recentChanges: unknown[];
  worseningRisks: unknown[];
  improvingCandidates: unknown[];
  deterioratingCandidates: unknown[];
  staleRelationships: unknown[];
  overdueCommitments: unknown[];
  staleFptpScenarios: unknown[];
  newFactionRiskAlerts: unknown[];
  newPolicyRadiusAlerts: unknown[];
  actionsCreated: unknown[];
  actionsCompleted: unknown[];
  actionsOverdue: unknown[];
}
