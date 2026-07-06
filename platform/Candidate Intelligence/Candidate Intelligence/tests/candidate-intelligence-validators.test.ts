// =============================================================================
// candidate-intelligence-validators.test.ts — zod schemas (no DB)
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  runAssessmentSchema,
  compareSchema,
  createVulnerabilitySchema,
  createDevelopmentPlanSchema,
  createSelectionDecisionSchema,
} from '../src/domain/candidate-intelligence/validators.js';
import { CandidateVulnerabilityType } from '../src/domain/candidate-intelligence/enums.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('runAssessmentSchema', () => {
  it('accepts a candidate + constituency', () => {
    expect(runAssessmentSchema.safeParse({ candidateEntityId: A, constituencyEntityId: B }).success).toBe(true);
  });
  it('rejects a missing candidate', () => {
    expect(runAssessmentSchema.safeParse({ constituencyEntityId: B }).success).toBe(false);
  });
});

describe('compareSchema', () => {
  it('requires at least two candidates', () => {
    expect(compareSchema.safeParse({ candidateEntityIds: [A], constituencyEntityId: B }).success).toBe(false);
    expect(compareSchema.safeParse({ candidateEntityIds: [A, B], constituencyEntityId: B }).success).toBe(true);
  });
});

describe('createVulnerabilitySchema', () => {
  it('accepts a typed vulnerability', () => {
    expect(createVulnerabilitySchema.safeParse({ candidateEntityId: A, vulnerabilityType: CandidateVulnerabilityType.MEDIA, title: 'Old posts' }).success).toBe(true);
  });
  it('rejects an unknown type', () => {
    expect(createVulnerabilitySchema.safeParse({ candidateEntityId: A, vulnerabilityType: 'NOPE', title: 'x' }).success).toBe(false);
  });
});

describe('createDevelopmentPlanSchema', () => {
  it('coerces a deadline date and bounds the target score', () => {
    const r = createDevelopmentPlanSchema.safeParse({ candidateEntityId: A, title: 'Plan', targetReadinessScore: 80, deadline: '2026-09-01' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.deadline instanceof Date).toBe(true);
    expect(createDevelopmentPlanSchema.safeParse({ candidateEntityId: A, title: 'Plan', targetReadinessScore: 120 }).success).toBe(false);
  });
});

describe('createSelectionDecisionSchema', () => {
  it('accepts a decision with conditions', () => {
    expect(createSelectionDecisionSchema.safeParse({ constituencyEntityId: B, selectedCandidateEntityId: A, conditions: ['complete vetting'] }).success).toBe(true);
  });
});
