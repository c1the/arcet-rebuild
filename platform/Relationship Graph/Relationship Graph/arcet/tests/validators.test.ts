// =============================================================================
// validators.test.ts — zod schema tests (no DB, no Prisma client).
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  createEntitySchema,
  createRelationshipSchema,
  createScoreSchema,
  createActionSchema,
} from '../src/domain/ontology/validators.js';
import { EntityType, RelationshipType, ScoreType, ActionType } from '../src/domain/ontology/enums.js';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('createEntitySchema', () => {
  it('accepts a minimal valid entity', () => {
    const r = createEntitySchema.safeParse({ type: EntityType.PERSON, displayName: 'Jane Doe' });
    expect(r.success).toBe(true);
  });
  it('rejects a missing displayName', () => {
    expect(createEntitySchema.safeParse({ type: EntityType.PERSON }).success).toBe(false);
  });
  it('rejects a malformed slug', () => {
    const r = createEntitySchema.safeParse({ type: EntityType.PERSON, displayName: 'X', slug: 'Not A Slug' });
    expect(r.success).toBe(false);
  });
  it('rejects an unknown entity type', () => {
    expect(createEntitySchema.safeParse({ type: 'WIZARD', displayName: 'X' }).success).toBe(false);
  });
});

describe('createRelationshipSchema', () => {
  it('accepts a valid directed relationship', () => {
    const r = createRelationshipSchema.safeParse({
      sourceEntityId: UUID_A, targetEntityId: UUID_B, type: RelationshipType.SUPPORTS, strength: 4,
    });
    expect(r.success).toBe(true);
  });
  it('rejects self-loops', () => {
    const r = createRelationshipSchema.safeParse({
      sourceEntityId: UUID_A, targetEntityId: UUID_A, type: RelationshipType.KNOWS,
    });
    expect(r.success).toBe(false);
  });
  it('rejects strength outside 1..5', () => {
    const r = createRelationshipSchema.safeParse({
      sourceEntityId: UUID_A, targetEntityId: UUID_B, type: RelationshipType.KNOWS, strength: 9,
    });
    expect(r.success).toBe(false);
  });
  it('rejects non-uuid ids', () => {
    const r = createRelationshipSchema.safeParse({ sourceEntityId: 'a', targetEntityId: 'b', type: RelationshipType.KNOWS });
    expect(r.success).toBe(false);
  });
});

describe('createScoreSchema', () => {
  it('accepts a valid score', () => {
    const r = createScoreSchema.safeParse({ subjectEntityId: UUID_A, scoreType: ScoreType.CANDIDATE_READINESS, value: 72 });
    expect(r.success).toBe(true);
  });
  it('rejects a missing subjectEntityId', () => {
    const r = createScoreSchema.safeParse({ scoreType: ScoreType.CANDIDATE_READINESS, value: 50 });
    expect(r.success).toBe(false);
  });
  it('rejects an unknown score type', () => {
    const r = createScoreSchema.safeParse({ subjectEntityId: UUID_A, scoreType: 'VIBES', value: 50 });
    expect(r.success).toBe(false);
  });
});

describe('createActionSchema', () => {
  it('accepts a minimal valid action', () => {
    const r = createActionSchema.safeParse({ title: 'Call the chair', actionType: ActionType.CALL });
    expect(r.success).toBe(true);
  });
  it('rejects an unknown action type', () => {
    expect(createActionSchema.safeParse({ title: 'X', actionType: 'TELEPORT' }).success).toBe(false);
  });
});
