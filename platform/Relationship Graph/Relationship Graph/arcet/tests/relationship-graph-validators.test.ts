// =============================================================================
// relationship-graph-validators.test.ts — zod schemas (no DB)
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  addNoteSchema,
  addTagSchema,
  findPathsSchema,
  savePathSchema,
  mergeRelationshipsSchema,
  resolveGapSchema,
} from '../src/domain/relationship-graph/validators.js';
import { RelationshipNoteType } from '../src/domain/relationship-graph/enums.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('addNoteSchema', () => {
  it('accepts a typed note', () => {
    expect(addNoteSchema.safeParse({ noteType: RelationshipNoteType.MEETING_NOTE, body: 'Met at conference' }).success).toBe(true);
  });
  it('requires a body', () => {
    expect(addNoteSchema.safeParse({ body: '' }).success).toBe(false);
  });
});

describe('addTagSchema', () => {
  it('accepts a tag and rejects an empty one', () => {
    expect(addTagSchema.safeParse({ tag: 'KEY_STAKEHOLDER' }).success).toBe(true);
    expect(addTagSchema.safeParse({ tag: '' }).success).toBe(false);
  });
});

describe('findPathsSchema', () => {
  it('bounds maxDepth and requires both endpoints', () => {
    expect(findPathsSchema.safeParse({ sourceEntityId: A, targetEntityId: B, maxDepth: 3 }).success).toBe(true);
    expect(findPathsSchema.safeParse({ sourceEntityId: A, targetEntityId: B, maxDepth: 9 }).success).toBe(false);
    expect(findPathsSchema.safeParse({ sourceEntityId: A }).success).toBe(false);
  });
});

describe('savePathSchema', () => {
  it('requires at least two nodes', () => {
    expect(savePathSchema.safeParse({ sourceEntityId: A, targetEntityId: B, nodes: [A, B], relationshipIds: [] }).success).toBe(true);
    expect(savePathSchema.safeParse({ sourceEntityId: A, targetEntityId: B, nodes: [A], relationshipIds: [] }).success).toBe(false);
  });
});

describe('mergeRelationshipsSchema + resolveGapSchema', () => {
  it('validates merge ids and optional resolution', () => {
    expect(mergeRelationshipsSchema.safeParse({ primaryRelationshipId: A, duplicateRelationshipId: B }).success).toBe(true);
    expect(resolveGapSchema.safeParse({ resolution: 'met the chair' }).success).toBe(true);
    expect(resolveGapSchema.safeParse({}).success).toBe(true);
  });
});
