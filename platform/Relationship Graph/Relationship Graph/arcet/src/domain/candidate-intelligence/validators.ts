// =============================================================================
// validators.ts — zod schemas for candidate-intelligence API inputs
// =============================================================================
import { z } from 'zod';
import { Confidence, Severity, Likelihood } from '../ontology/enums.js';
import {
  CandidateAssessmentType,
  CandidateVulnerabilityType,
  CandidateVulnerabilityStatus,
  CandidateSelectionDecisionStatus,
} from './enums.js';

const uuid = z.string().uuid();

export const runAssessmentSchema = z.object({
  candidateEntityId: uuid,
  constituencyEntityId: uuid.optional(),
  assessmentType: z.nativeEnum(CandidateAssessmentType).optional(),
  weightConfigId: uuid.optional(),
  persist: z.boolean().optional(),
});

export const compareSchema = z.object({
  candidateEntityIds: z.array(uuid).min(2),
  constituencyEntityId: uuid,
  weightConfigId: uuid.optional(),
  title: z.string().optional(),
});

export const createVulnerabilitySchema = z.object({
  candidateEntityId: uuid,
  constituencyEntityId: uuid.optional(),
  issueEntityId: uuid.optional(),
  vulnerabilityType: z.nativeEnum(CandidateVulnerabilityType),
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.nativeEnum(Severity).optional(),
  likelihood: z.nativeEnum(Likelihood).optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  status: z.nativeEnum(CandidateVulnerabilityStatus).optional(),
  sourceEvidenceId: uuid.optional(),
  mitigation: z.string().optional(),
});

export const createDevelopmentPlanSchema = z.object({
  candidateEntityId: uuid,
  constituencyEntityId: uuid.optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  targetReadinessScore: z.number().min(0).max(100).optional(),
  deadline: z.coerce.date().optional(),
  ownerUserId: z.string().optional(),
});

export const createSelectionDecisionSchema = z.object({
  constituencyEntityId: uuid,
  selectedCandidateEntityId: uuid.optional(),
  comparisonRunId: uuid.optional(),
  decisionStatus: z.nativeEnum(CandidateSelectionDecisionStatus).optional(),
  rationale: z.string().optional(),
  conditions: z.array(z.string()).optional(),
});

export const createWeightConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  politicalExperienceWeight: z.number().optional(),
  localConnectionWeight: z.number().optional(),
  stakeholderCoverageWeight: z.number().optional(),
  localAssociationSupportWeight: z.number().optional(),
  factionAcceptabilityWeight: z.number().optional(),
  issueCredibilityWeight: z.number().optional(),
  mediaReadinessWeight: z.number().optional(),
  campaignCapacityWeight: z.number().optional(),
  riskProfileWeight: z.number().optional(),
  developmentPotentialWeight: z.number().optional(),
});

export const createRiskSchema = z.object({
  candidateEntityId: uuid,
  constituencyEntityId: uuid.optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.nativeEnum(Severity).optional(),
  likelihood: z.nativeEnum(Likelihood).optional(),
  rationale: z.string().optional(),
});
