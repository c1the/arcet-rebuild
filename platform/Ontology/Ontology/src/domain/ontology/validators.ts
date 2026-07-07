// =============================================================================
// validators.ts — Zod schemas for service inputs
// =============================================================================
import { z } from 'zod';
import {
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
  MarketSignalType,
} from './enums.js';

const uuid = z.string().uuid();
const strength = z.number().int().min(1).max(5);
const score0to100 = z.number().min(0).max(100);
const jsonValue: z.ZodType = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]),
);

export const createEntitySchema = z.object({
  type: z.nativeEnum(EntityType),
  displayName: z.string().min(1).max(500),
  canonicalName: z.string().max(500).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens')
    .max(300)
    .optional(),
  description: z.string().optional(),
  status: z.nativeEnum(EntityStatus).optional(),
  visibility: z.nativeEnum(Visibility).optional(),
  metadata: jsonValue.optional(),
});

export const updateEntitySchema = createEntitySchema.partial().omit({ type: true });

export const entitySearchSchema = z.object({
  query: z.string().optional(),
  type: z.union([z.nativeEnum(EntityType), z.array(z.nativeEnum(EntityType))]).optional(),
  status: z.union([z.nativeEnum(EntityStatus), z.array(z.nativeEnum(EntityStatus))]).optional(),
  visibility: z.union([z.nativeEnum(Visibility), z.array(z.nativeEnum(Visibility))]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const createRelationshipSchema = z
  .object({
    sourceEntityId: uuid,
    targetEntityId: uuid,
    type: z.nativeEnum(RelationshipType),
    direction: z.nativeEnum(RelationshipDirection).optional(),
    strength: strength.optional(),
    attitude: z.nativeEnum(Attitude).optional(),
    influenceLevel: z.nativeEnum(InfluenceLevel).optional(),
    confidence: z.nativeEnum(Confidence).optional(),
    visibility: z.nativeEnum(Visibility).optional(),
    relationshipOwnerUserId: z.string().optional(),
    relationshipOwnerEntityId: uuid.optional(),
    lastInteractionAt: z.coerce.date().optional(),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
    isCurrent: z.boolean().optional(),
    summary: z.string().optional(),
    privateNotes: z.string().optional(),
  })
  .refine((r) => r.sourceEntityId !== r.targetEntityId, {
    message: 'sourceEntityId and targetEntityId must differ (no self-loops)',
    path: ['targetEntityId'],
  });

export const updateRelationshipSchema = z.object({
  type: z.nativeEnum(RelationshipType).optional(),
  direction: z.nativeEnum(RelationshipDirection).optional(),
  strength: strength.optional(),
  attitude: z.nativeEnum(Attitude).optional(),
  influenceLevel: z.nativeEnum(InfluenceLevel).optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  visibility: z.nativeEnum(Visibility).optional(),
  relationshipOwnerUserId: z.string().nullable().optional(),
  relationshipOwnerEntityId: uuid.nullable().optional(),
  lastInteractionAt: z.coerce.date().nullable().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validTo: z.coerce.date().nullable().optional(),
  isCurrent: z.boolean().optional(),
  summary: z.string().nullable().optional(),
  privateNotes: z.string().nullable().optional(),
});

export const createEvidenceSchema = z.object({
  title: z.string().min(1),
  sourceType: z.nativeEnum(SourceType).optional(),
  url: z.string().url().optional(),
  fileId: z.string().optional(),
  rawText: z.string().optional(),
  summary: z.string().optional(),
  sourceDate: z.coerce.date().optional(),
  observedAt: z.coerce.date().optional(),
  reliability: z.nativeEnum(Reliability).optional(),
  visibility: z.nativeEnum(Visibility).optional(),
  dataClassification: z.nativeEnum(DataClassification).optional(),
});

export const createEventSchema = z.object({
  eventType: z.nativeEnum(EventType),
  title: z.string().min(1),
  summary: z.string().optional(),
  occurredAt: z.coerce.date(),
  location: z.string().optional(),
  constituencyEntityId: uuid.optional(),
  issueEntityId: uuid.optional(),
  sourceEvidenceId: uuid.optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  visibility: z.nativeEnum(Visibility).optional(),
  participants: z
    .array(z.object({ entityId: uuid, participantRole: z.nativeEnum(ParticipantRole).optional() }))
    .optional(),
});

export const createRiskSchema = z.object({
  riskType: z.nativeEnum(RiskType),
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.nativeEnum(Severity).optional(),
  likelihood: z.nativeEnum(Likelihood).optional(),
  urgency: z.nativeEnum(Urgency).optional(),
  status: z.nativeEnum(RiskStatus).optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  ownerUserId: z.string().optional(),
  sourceModule: z.string().optional(),
  rationale: z.string().optional(),
  mitigation: z.string().optional(),
  links: z.array(z.object({ entityId: uuid, role: z.nativeEnum(RiskLinkRole).optional() })).optional(),
});

export const updateRiskSchema = createRiskSchema.partial().omit({ links: true });

export const createScoreSchema = z.object({
  subjectEntityId: uuid,
  contextEntityId: uuid.optional(),
  scoreType: z.nativeEnum(ScoreType),
  value: z.number(),
  scaleMin: z.number().optional(),
  scaleMax: z.number().optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  sourceModule: z.string().optional(),
  modelVersion: z.string().optional(),
  rationale: z.string().optional(),
});

export const createMarketSignalSchema = z.object({
  seriesCode: z.string().min(1).max(64),
  seriesType: z.nativeEnum(MarketSignalType).optional(),
  jurisdiction: z.string().max(64).optional(),
  value: z.number(),
  unit: z.string().max(32).optional(),
  observedAt: z.coerce.date(),
  source: z.nativeEnum(SourceType).optional(),
  sourceEvidenceId: uuid.optional(),
  metadata: jsonValue.optional(),
});

export const saveFptpScenarioSchema = z.object({
  constituencyEntityId: uuid,
  candidateEntityId: uuid.optional(),
  scenarioType: z.nativeEnum(FPTPScenarioType),
  title: z.string().min(1),
  assumptions: jsonValue.optional(),
  estimatedWinProbability: z.number().min(0).max(1).optional(),
  estimatedVoteShareLow: score0to100.optional(),
  estimatedVoteShareMid: score0to100.optional(),
  estimatedVoteShareHigh: score0to100.optional(),
  strategicValueScore: score0to100.optional(),
  resourceWasteRisk: score0to100.optional(),
  spoilerRisk: score0to100.optional(),
  tacticalVotingRisk: score0to100.optional(),
  localPartyImpact: z.string().optional(),
  stakeholderImpact: z.string().optional(),
  candidateDevelopmentValue: score0to100.optional(),
  futureElectionValue: score0to100.optional(),
  recommendationLabel: z.nativeEnum(FPTPRecommendationLabel).optional(),
  rationale: z.string().optional(),
  confidence: z.nativeEnum(Confidence).optional(),
});

export const savePolicyImpactSchema = z.object({
  policyEntityId: uuid,
  affectedEntityId: uuid,
  impactType: z.nativeEnum(PolicyImpactType),
  impactDirection: z.nativeEnum(ImpactDirection).optional(),
  severity: z.nativeEnum(Severity).optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  rationale: z.string().optional(),
  recommendedActionId: uuid.optional(),
});

export const createActionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  actionType: z.nativeEnum(ActionType),
  priority: z.nativeEnum(ActionPriority).optional(),
  status: z.nativeEnum(ActionStatus).optional(),
  targetEntityId: uuid.optional(),
  ownerUserId: z.string().optional(),
  ownerEntityId: uuid.optional(),
  dueDate: z.coerce.date().optional(),
  sourceModule: z.string().optional(),
  rationale: z.string().optional(),
  expectedBenefit: z.string().optional(),
  downsideIfIgnored: z.string().optional(),
  approvalRequirement: z.nativeEnum(ApprovalRequirement).optional(),
  relatedRiskId: uuid.optional(),
  relatedScenarioId: uuid.optional(),
  relatedPolicyImpactId: uuid.optional(),
});

export const createComplianceFlagSchema = z.object({
  entityId: uuid,
  flagType: z.nativeEnum(ComplianceFlagType),
  severity: z.nativeEnum(Severity).optional(),
  description: z.string().optional(),
  reviewOwnerUserId: z.string().optional(),
});

// Profile sub-schemas (validated when a typed profile is attached to an entity)
export const personProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  honorific: z.string().optional(),
  roleTitle: z.string().optional(),
  personType: z.nativeEnum(PersonType).optional(),
  primaryOrganisationId: uuid.optional(),
  primaryConstituencyId: uuid.optional(),
  primaryFactionId: uuid.optional(),
  publicBio: z.string().optional(),
  privateNotes: z.string().optional(),
  publicProfileUrl: z.string().url().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  isPolitician: z.boolean().optional(),
  isCandidate: z.boolean().optional(),
  isStakeholder: z.boolean().optional(),
  isJournalist: z.boolean().optional(),
  isDonor: z.boolean().optional(),
  isAdviser: z.boolean().optional(),
  isLocalPartyFigure: z.boolean().optional(),
  riskLevel: z.nativeEnum(InfluenceLevel).optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  sourceSummary: z.string().optional(),
  jurisdiction: z.string().max(64).optional(),
  sourceRegister: z.string().max(128).optional(),
});

export const organisationProfileSchema = z.object({
  organisationType: z.nativeEnum(OrganisationType).optional(),
  website: z.string().url().optional(),
  geography: z.string().optional(),
  primaryConstituencyId: uuid.optional(),
  parentOrganisationId: uuid.optional(),
  description: z.string().optional(),
  issueFocus: z.array(z.string()).optional(),
  politicalRelevance: z.nativeEnum(InfluenceLevel).optional(),
  riskLevel: z.nativeEnum(InfluenceLevel).optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  jurisdiction: z.string().max(64).optional(),
  sourceRegister: z.string().max(128).optional(),
});

export const constituencyProfileSchema = z.object({
  name: z.string().min(1),
  region: z.string().optional(),
  country: z.string().optional(),
  currentRepresentativeEntityId: uuid.optional(),
  incumbentPartyEntityId: uuid.optional(),
  previousWinningPartyEntityId: uuid.optional(),
  targetStatus: z.nativeEnum(TargetStatus).optional(),
  strategicPriority: z.nativeEnum(StrategicPriority).optional(),
  localPartyStrength: strength.optional(),
  campaignReadiness: strength.optional(),
  stakeholderCoverageScore: score0to100.optional(),
  localIssueVolatility: strength.optional(),
  tacticalVotingRisk: strength.optional(),
  spoilerRisk: strength.optional(),
  overallCompetitiveness: score0to100.optional(),
  notes: z.string().optional(),
});

export const candidateProfileSchema = z.object({
  personEntityId: uuid.optional(),
  currentTargetConstituencyId: uuid.optional(),
  partyEntityId: uuid.optional(),
  candidateStatus: z.nativeEnum(CandidateStatus).optional(),
  politicalExperienceScore: score0to100.optional(),
  localConnectionScore: score0to100.optional(),
  mediaReadinessScore: score0to100.optional(),
  stakeholderStrengthScore: score0to100.optional(),
  localAssociationSupportScore: score0to100.optional(),
  factionAcceptabilityScore: score0to100.optional(),
  issueCredibilityScore: score0to100.optional(),
  campaignCapacityScore: score0to100.optional(),
  riskScore: score0to100.optional(),
  developmentPotentialScore: score0to100.optional(),
  overallReadinessScore: score0to100.optional(),
  summary: z.string().optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  developmentNeeds: z.array(z.string()).optional(),
  vettingStatus: z.nativeEnum(VettingStatus).optional(),
});

export const factionProfileSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  factionType: z.nativeEnum(FactionType).optional(),
  influenceScore: score0to100.optional(),
  leadershipAlignment: z.nativeEnum(LeadershipAlignment).optional(),
  currentMood: z.nativeEnum(FactionMood).optional(),
  riskLevel: z.nativeEnum(InfluenceLevel).optional(),
  confidence: z.nativeEnum(Confidence).optional(),
  notes: z.string().optional(),
});

export const issueProfileSchema = z.object({
  name: z.string().min(1),
  issueCategory: z.nativeEnum(IssueCategory).optional(),
  nationalRelevance: strength.optional(),
  localRelevance: strength.optional(),
  mediaSensitivity: strength.optional(),
  factionSensitivity: strength.optional(),
  complianceSensitivity: strength.optional(),
  description: z.string().optional(),
});

export const policyProfileSchema = z.object({
  title: z.string().min(1),
  policyText: z.string().optional(),
  summary: z.string().optional(),
  issueEntityIds: z.array(uuid).optional(),
  policyStatus: z.nativeEnum(PolicyStatus).optional(),
  announcementDate: z.coerce.date().optional(),
  ownerEntityId: uuid.optional(),
  overallPoliticalRisk: z.nativeEnum(Severity).optional(),
  overallComplianceRisk: z.nativeEnum(Severity).optional(),
});
