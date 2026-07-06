// =============================================================================
// temporal.service.ts — façade aggregating the temporal services
// =============================================================================
import { TemporalEventService } from './temporal-event.service.js';
import { ObservationService } from './observation.service.js';
import { ChangeService } from './change.service.js';
import { SnapshotService } from './snapshot.service.js';
import { CommitmentService } from './commitment.service.js';
import { TimelineService } from './timeline.service.js';
import { TrendService } from './trend.service.js';
import { DecayService } from './decay.service.js';
import { TemporalQueryService } from './temporal-query.service.js';
import { RelationshipTemporalService } from './relationship-temporal.service.js';
import { CandidateTemporalService } from './candidate-temporal.service.js';
import { ConstituencyTemporalService } from './constituency-temporal.service.js';
import { FPTPTemporalService } from './fptp-temporal.service.js';
import { PolicyTemporalService } from './policy-temporal.service.js';
import { FactionTemporalService } from './faction-temporal.service.js';
import { ActionTemporalService } from './action-temporal.service.js';
import { ComplianceTemporalService } from './compliance-temporal.service.js';
import { WarRoomTemporalService } from './war-room-temporal.service.js';

export const Temporal = {
  events: TemporalEventService,
  observations: ObservationService,
  changes: ChangeService,
  snapshots: SnapshotService,
  commitments: CommitmentService,
  timeline: TimelineService,
  trends: TrendService,
  decay: DecayService,
  query: TemporalQueryService,
  relationships: RelationshipTemporalService,
  candidates: CandidateTemporalService,
  constituencies: ConstituencyTemporalService,
  fptp: FPTPTemporalService,
  policy: PolicyTemporalService,
  factions: FactionTemporalService,
  actions: ActionTemporalService,
  compliance: ComplianceTemporalService,
  warRoom: WarRoomTemporalService,
};
