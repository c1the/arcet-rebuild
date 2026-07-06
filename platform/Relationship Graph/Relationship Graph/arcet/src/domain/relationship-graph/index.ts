// =============================================================================
// index.ts — public surface of the relationship-graph module
// =============================================================================
export * from './enums.js';
export type * from './types.js';
export * as relationshipGraphValidators from './validators.js';
export * as relationshipGraphRules from './rules.js';

export { RelationshipGraphService } from './graph.service.js';
export { RelationshipCrudService } from './crud.service.js';
export { RelationshipScoringService } from './scoring.service.js';
export { RelationshipGapService } from './gap.service.js';
export { AccessPathService } from './access-path.service.js';
export { RelationshipActionService } from './action.service.js';
export { RelationshipExplanationService } from './explanation.service.js';
export { RelationshipCompatibilityService } from './compatibility.service.js';

// Re-export the temporal relationship service so callers have one import site.
export { RelationshipTemporalService } from '../temporal/relationship-temporal.service.js';
export { DecayService as RelationshipDecayService } from '../temporal/decay.service.js';

import { RelationshipGraphService } from './graph.service.js';
import { RelationshipCrudService } from './crud.service.js';
import { RelationshipScoringService } from './scoring.service.js';
import { RelationshipGapService } from './gap.service.js';
import { AccessPathService } from './access-path.service.js';
import { RelationshipActionService } from './action.service.js';
import { RelationshipExplanationService } from './explanation.service.js';
import { RelationshipCompatibilityService } from './compatibility.service.js';
import { RelationshipTemporalService } from '../temporal/relationship-temporal.service.js';
import { DecayService } from '../temporal/decay.service.js';

export const RelationshipGraph = {
  graph: RelationshipGraphService,
  crud: RelationshipCrudService,
  scoring: RelationshipScoringService,
  gaps: RelationshipGapService,
  paths: AccessPathService,
  actions: RelationshipActionService,
  explanation: RelationshipExplanationService,
  compatibility: RelationshipCompatibilityService,
  temporal: RelationshipTemporalService,
  decay: DecayService,
};
