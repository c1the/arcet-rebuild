// =============================================================================
// temporal-validators.test.ts — zod schemas (no DB; runs anywhere)
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  createTemporalEventSchema,
  recordObservationSchema,
  recordChangeSchema,
  createSnapshotSchema,
  createCommitmentSchema,
} from '../src/domain/temporal/validators.js';
import { TemporalEventType, ObservationType, ChangeType, SnapshotType, CommitmentType } from '../src/domain/temporal/enums.js';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('createTemporalEventSchema', () => {
  it('accepts a valid event and coerces dates', () => {
    const r = createTemporalEventSchema.safeParse({ eventType: TemporalEventType.MEETING_OCCURRED, occurredAt: '2026-03-01T10:00:00Z', title: 'Met chair', entities: [{ entityId: UUID }] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.occurredAt instanceof Date).toBe(true);
  });
  it('rejects an unknown event type', () => {
    expect(createTemporalEventSchema.safeParse({ eventType: 'NOPE', occurredAt: '2026-03-01', title: 'x' }).success).toBe(false);
  });
  it('requires a title', () => {
    expect(createTemporalEventSchema.safeParse({ eventType: TemporalEventType.OTHER, occurredAt: '2026-03-01', title: '' }).success).toBe(false);
  });
});

describe('recordObservationSchema', () => {
  it('requires at least one value field', () => {
    expect(recordObservationSchema.safeParse({ subjectEntityId: UUID, observationType: ObservationType.CANDIDATE_READINESS }).success).toBe(false);
  });
  it('accepts a numeric observation', () => {
    expect(recordObservationSchema.safeParse({ subjectEntityId: UUID, observationType: ObservationType.CANDIDATE_READINESS, valueNumeric: 72 }).success).toBe(true);
  });
});

describe('recordChangeSchema', () => {
  it('accepts a score change with a delta', () => {
    expect(recordChangeSchema.safeParse({ entityId: UUID, changeType: ChangeType.SCORE_INCREASED, deltaNumeric: 12 }).success).toBe(true);
  });
});

describe('createSnapshotSchema', () => {
  it('accepts a snapshot with json payload', () => {
    expect(createSnapshotSchema.safeParse({ entityId: UUID, snapshotType: SnapshotType.CANDIDATE_CONTEXT, snapshotJson: { fit: 60 } }).success).toBe(true);
  });
});

describe('createCommitmentSchema', () => {
  it('accepts a valid commitment', () => {
    expect(createCommitmentSchema.safeParse({ fromEntityId: UUID, title: 'Follow up with chair', commitmentType: CommitmentType.FOLLOW_UP, dueAt: '2026-04-01' }).success).toBe(true);
  });
  it('requires fromEntityId', () => {
    expect(createCommitmentSchema.safeParse({ title: 'x' }).success).toBe(false);
  });
});
