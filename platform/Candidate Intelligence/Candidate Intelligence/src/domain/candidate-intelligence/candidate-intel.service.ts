// =============================================================================
// candidate-intel.service.ts — façade aggregating the CI services
// =============================================================================
import { CandidateIntelligenceService } from './candidate-intelligence.service.js';
import { CandidateScoringService } from './scoring.service.js';
import { CandidateComparisonService } from './comparison.service.js';
import { CandidateRiskService } from './risk.service.js';
import { CandidateDevelopmentService } from './development.service.js';
import { CandidateRelationshipService } from './relationship.service.js';
import { CandidateIntelTemporalService } from './temporal.service.js';
import { CandidateFPTPCompatibilityService } from './fptp-compatibility.service.js';
import { CandidatePolicyExposureService } from './policy-exposure.service.js';
import { CandidateExplanationService } from './explanation.service.js';

export const CandidateIntelligence = {
  intelligence: CandidateIntelligenceService,
  scoring: CandidateScoringService,
  comparison: CandidateComparisonService,
  risk: CandidateRiskService,
  development: CandidateDevelopmentService,
  relationships: CandidateRelationshipService,
  temporal: CandidateIntelTemporalService,
  fptp: CandidateFPTPCompatibilityService,
  policy: CandidatePolicyExposureService,
  explanation: CandidateExplanationService,
};
