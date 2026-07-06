// =============================================================================
// validators.ts — zod schemas for temporal service inputs
// =============================================================================
import { z } from 'zod';
import { Confidence, Visibility, DataClassification, Attitude, InfluenceLevel } from '../ontology/enums.js';
import {
  TemporalEventType,
  TemporalEntityRole,
  ObservationType,
  ChangeType,
  SnapshotType,
  CommitmentType,
  CommitmentStatus,
  Sensitivity,
} from './enums.js';

const uuid = z.string().uuid();
const jsonValue: z.ZodType = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]),
);

export const entityRoleLinkSchema = z.object({
  entityId: uuid,
  role: z.nativeEnum(TemporalEntityRole).optional(),
});

export const createTemporalEventSchema = z.object({
  politicalEventId: uuid.optional(),
  eventType: z.nativeEnum(TemporalEventType),
  occurredAt: z.coerce.date(),
  recordedAt: z.coerce.date().optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  sourceModule: z.string().optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  visibility: z.nativeEnum(Visibility).optional(),
  dataClassification: z.nativeEnum(DataClassification).optional(),
  metadata: jsonValue.optional(),
  entities: z.array(entityRoleLinkSchema).optional(),
});

export const recordObservationSchema = z
  .object({
    subjectEntityId: uuid,
    contextEntityId: uuid.optional(),
    relationshipId: uuid.optional(),
    riskId: uuid.optional(),
    scoreId: uuid.optional(),
    actionRecommendationId: uuid.optional(),
    observationType: z.nativeEnum(ObservationType),
    observedAt: z.coerce.date().optional(),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
    valueNumeric: z.number().optional(),
    valueText: z.string().optional(),
    valueJson: jsonValue.optional(),
    confidence: z.nativeEnum(Confidence).optional(),
    sourceModule: z.string().optional(),
    sourceEvidenceId: uuid.optional(),
    sourceTemporalEventId: uuid.optional(),
  })
  .refine((o) => o.valueNumeric != null || o.valueText != null || o.valueJson != null, {
    message: 'observation must carry at least one of valueNumeric / valueText / valueJson',
    path: ['valueNumeric'],
  });

export const recordChangeSchema = z.object({
  entityId: uuid.optional(),
  relationshipId: uuid.optional(),
  riskId: uuid.optional(),
  scoreId: uuid.optional(),
  actionRecommendationId: uuid.optional(),
  candidateSeatAssessmentId: uuid.optional(),
  fptpScenarioId: uuid.optional(),
  policyImpactId: uuid.optional(),
  changeType: z.nativeEnum(ChangeType),
  fieldName: z.string().optional(),
  oldValue: jsonValue.optional(),
  newValue: jsonValue.optional(),
  deltaNumeric: z.number().optional(),
  changedAt: z.coerce.date().optional(),
  effectiveAt: z.coerce.date().optional(),
  sourceModule: z.string().optional(),
  sourceTemporalEventId: uuid.optional(),
  sourceEvidenceId: uuid.optional(),
  rationale: z.string().optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  significant: z.boolean().optional(),
});

export const createSnapshotSchema = z.object({
  entityId: uuid,
  snapshotType: z.nativeEnum(SnapshotType),
  snapshotJson: jsonValue,
  snapshotAt: z.coerce.date().optional(),
  sourceModule: z.string().optional(),
  modelVersion: z.string().optional(),
  summary: z.string().optional(),
});

export const recordRelationshipStateSchema = z.object({
  relationshipId: uuid,
  observedAt: z.coerce.date().optional(),
  strength: z.number().int().min(1).max(5).optional(),
  attitude: z.nativeEnum(Attitude).optional(),
  influenceLevel: z.nativeEnum(InfluenceLevel).optional(),
  trustLevel: z.number().int().min(1).max(5).optional(),
  stalenessScore: z.number().min(0).max(100).optional(),
  decayScore: z.number().min(0).max(100).optional(),
  lastInteractionAt: z.coerce.date().optional(),
  openCommitmentCount: z.number().int().min(0).optional(),
  hostilitySignalCount: z.number().int().min(0).optional(),
  positiveSignalCount: z.number().int().min(0).optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  rationale: z.string().optional(),
  sourceTemporalEventId: uuid.optional(),
});

export const createCommitmentSchema = z.object({
  fromEntityId: uuid,
  toEntityId: uuid.optional(),
  relatedIssueEntityId: uuid.optional(),
  relatedConstituencyEntityId: uuid.optional(),
  relatedPolicyEntityId: uuid.optional(),
  relatedCandidateEntityId: uuid.optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  commitmentType: z.nativeEnum(CommitmentType).optional(),
  status: z.nativeEnum(CommitmentStatus).optional(),
  createdFromEventId: uuid.optional(),
  createdFromEvidenceId: uuid.optional(),
  promisedAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
  sensitivity: z.nativeEnum(Sensitivity).optional(),
  visibility: z.nativeEnum(Visibility).optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  ownerUserId: z.string().optional(),
});

export const updateCommitmentSchema = z.object({
  status: z.nativeEnum(CommitmentStatus).optional(),
  dueAt: z.coerce.date().nullable().optional(),
  description: z.string().nullable().optional(),
  sensitivity: z.nativeEnum(Sensitivity).optional(),
});
