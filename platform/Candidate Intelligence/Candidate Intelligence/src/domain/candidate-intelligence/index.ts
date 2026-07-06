// =============================================================================
// index.ts — public surface of the candidate-intelligence module
// =============================================================================
export * from './enums.js';
export type * from './types.js';
export * as candidateIntelValidators from './validators.js';
export * as candidateIntelRules from './rules.js';

export { CandidateIntelligenceService } from './candidate-intelligence.service.js';
export { CandidateScoringService } from './scoring.service.js';
export { CandidateComparisonService } from './comparison.service.js';
export { CandidateRiskService } from './risk.service.js';
export { CandidateDevelopmentService } from './development.service.js';
export { CandidateRelationshipService } from './relationship.service.js';
export { CandidateIntelTemporalService } from './temporal.service.js';
export { CandidateFPTPCompatibilityService } from './fptp-compatibility.service.js';
export { CandidatePolicyExposureService } from './policy-exposure.service.js';
export { CandidateExplanationService } from './explanation.service.js';
export { CandidateIntelligence } from './candidate-intel.service.js';
