// =============================================================================
// validators.ts — zod schemas for relationship-graph API inputs
// =============================================================================
import { z } from 'zod';
import { Confidence, Visibility, DataClassification, Severity } from '../ontology/enums.js';
import { RelationshipNoteType, RelationshipGapContextType, RelationshipGapStatus } from './enums.js';

const uuid = z.string().uuid();

export const addNoteSchema = z.object({
  noteType: z.nativeEnum(RelationshipNoteType).optional(),
  body: z.string().min(1),
  visibility: z.nativeEnum(Visibility).optional(),
  dataClassification: z.nativeEnum(DataClassification).optional(),
});

export const addTagSchema = z.object({
  tag: z.string().min(1).max(64),
});

export const confirmRelationshipSchema = z.object({
  evidenceId: uuid.optional(),
});

export const mergeRelationshipsSchema = z.object({
  primaryRelationshipId: uuid,
  duplicateRelationshipId: uuid,
});

export const findPathsSchema = z.object({
  sourceEntityId: uuid,
  targetEntityId: uuid,
  maxDepth: z.number().int().min(1).max(5).optional(),
  allowRestricted: z.boolean().optional(),
});

export const savePathSchema = z.object({
  sourceEntityId: uuid,
  targetEntityId: uuid,
  nodes: z.array(uuid).min(2),
  relationshipIds: z.array(uuid),
  pathQualityScore: z.number().optional(),
  pathRiskScore: z.number().optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  rationale: z.string().optional(),
});

export const resolveGapSchema = z.object({
  resolution: z.string().optional(),
  status: z.nativeEnum(RelationshipGapStatus).optional(),
});

export const createGapSchema = z.object({
  contextEntityId: uuid,
  contextType: z.nativeEnum(RelationshipGapContextType),
  missingTargetEntityId: uuid.optional(),
  gapType: z.string(),
  severity: z.nativeEnum(Severity).optional(),
  reason: z.string().optional(),
});

export const importBatchSchema = z.object({
  title: z.string().min(1),
  sourceType: z.string().optional(),
  rows: z
    .array(
      z.object({
        sourceEntityId: uuid,
        targetEntityId: uuid,
        type: z.string(),
        strength: z.number().int().min(1).max(5).optional(),
        attitude: z.string().optional(),
        influenceLevel: z.string().optional(),
        confidence: z.string().optional(),
        relationshipOwnerUserId: z.string().optional(),
        lastInteractionAt: z.coerce.date().optional(),
        note: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});
