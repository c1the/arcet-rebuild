// =============================================================================
// seed.ts — temporal demo data (§18). Run with: npm run temporal:seed
// -----------------------------------------------------------------------------
// Builds on the ontology and lays down a TIME dimension: events with distinct
// occurredAt vs recordedAt, observation series, meaningful changes, commitments,
// snapshots and decay — so the acceptance demos (candidate improving /
// deteriorating, stale relationship, overdue commitment, faction escalation,
// policy radius expansion, FPTP staleness, relationship repair, ranking change,
// war-room briefing) all work end-to-end.
//
// All data is FICTIONAL. The model covers candidates, stakeholders, factions,
// seats and policies — never individual voters.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { EntityService } from '../ontology/entity.service.js';
import { RelationshipService } from '../ontology/relationship.service.js';
import {
  Attitude, CandidateStatus, Confidence, FactionMood, FactionType, InfluenceLevel,
  IssueCategory, OrganisationType, PolicyStatus, RelationshipType, Severity, VettingStatus,
} from '../ontology/enums.js';

import { TemporalEventService } from './temporal-event.service.js';
import { ObservationService } from './observation.service.js';
import { ChangeService } from './change.service.js';
import { CommitmentService } from './commitment.service.js';
import { SnapshotService } from './snapshot.service.js';
import { RelationshipTemporalService } from './relationship-temporal.service.js';
import { CandidateTemporalService } from './candidate-temporal.service.js';
import { FactionTemporalService } from './faction-temporal.service.js';
import { PolicyTemporalService } from './policy-temporal.service.js';
import { DecayService } from './decay.service.js';
import {
  ChangeType, CommitmentType, ObservationType, SnapshotType, TemporalEntityRole, TemporalEventType,
} from './enums.js';

const actor = { userId: 'temporal-seed' };
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function main() {
  console.log('Seeding Arcet temporal graph…');

  // ---- Ontology base: 3 constituencies, candidates, stakeholders, faction, issue, policy
  const seatX = await EntityService.createConstituency({ displayName: 'Northbridge (fictional)' }, {} as never, actor);
  const seatY = await EntityService.createConstituency({ displayName: 'Eastfield (fictional)' }, {} as never, actor);
  const seatZ = await EntityService.createConstituency({ displayName: 'Westgate (fictional)' }, {} as never, actor);

  const candA = await EntityService.createCandidate({ displayName: 'Candidate A (fictional)' }, { candidateStatus: CandidateStatus.SHORT_LISTED, vettingStatus: VettingStatus.IN_PROGRESS, localAssociationSupportScore: 45, overallReadinessScore: 58, riskScore: 15 } as never, actor);
  const candB = await EntityService.createCandidate({ displayName: 'Candidate B (fictional)' }, { candidateStatus: CandidateStatus.SHORT_LISTED, vettingStatus: VettingStatus.CLEARED, factionAcceptabilityScore: 70, overallReadinessScore: 66, riskScore: 20 } as never, actor);

  const chair = await EntityService.createPerson({ displayName: 'Local Association Chair (fictional)' }, { politicalInfluence: InfluenceLevel.HIGH } as never, actor);
  const broker = await EntityService.createPerson({ displayName: 'Faction Broker (fictional)' }, { politicalInfluence: InfluenceLevel.HIGH } as never, actor);

  const faction = await EntityService.createFaction({ displayName: 'Group A (fictional)' }, { factionType: FactionType.IDEOLOGICAL, mood: FactionMood.CALM } as never, actor);
  const issue = await EntityService.createIssue({ displayName: 'Local Housing (fictional)' }, { category: IssueCategory.HOUSING } as never, actor);
  const policy = await EntityService.createPolicy({ displayName: 'Planning Reform (fictional)' }, { status: PolicyStatus.DRAFT } as never, actor);

  const candAId = candA.entity.id, candBId = candB.entity.id;
  const seatXId = seatX.entity.id, chairId = chair.entity.id, brokerId = broker.entity.id;
  const factionId = faction.entity.id, issueId = issue.entity.id, policyId = policy.entity.id;

  // Relationship: Candidate A ↔ chair, initially weak/neutral, last contacted long ago.
  const relAChair = await RelationshipService.createRelationship({ sourceEntityId: candAId, targetEntityId: chairId, type: RelationshipType.KNOWS, strength: 2, attitude: Attitude.NEUTRAL, influenceLevel: InfluenceLevel.HIGH, lastInteractionAt: daysAgo(120) } as never, actor);
  // A high-value relationship that has gone stale (storyline 3).
  const relStale = await RelationshipService.createRelationship({ sourceEntityId: candBId, targetEntityId: brokerId, type: RelationshipType.KNOWS, strength: 5, attitude: Attitude.SUPPORTIVE, influenceLevel: InfluenceLevel.HIGH, lastInteractionAt: daysAgo(140) } as never, actor);

  // ===========================================================================
  // Storyline 1 + 8 + 9: Candidate A improves over time after meetings.
  // ===========================================================================
  const meet1 = await TemporalEventService.createTemporalEvent({ eventType: TemporalEventType.MEETING_OCCURRED, occurredAt: daysAgo(40), title: 'Candidate A meets local association chair', sourceModule: 'seed', metadata: { relationshipId: relAChair.id }, entities: [{ entityId: candAId, role: TemporalEntityRole.ACTOR }, { entityId: chairId, role: TemporalEntityRole.TARGET }, { entityId: seatXId, role: TemporalEntityRole.CONSTITUENCY_CONTEXT }] }, actor);
  await RelationshipTemporalService.recordRelationshipStrengthChange(relAChair.id, 2, 4, { rationale: 'Productive first meeting', sourceTemporalEventId: meet1.id }, actor);
  await TemporalEventService.createTemporalEvent({ eventType: TemporalEventType.STAKEHOLDER_BRIEFED, occurredAt: daysAgo(20), title: 'Candidate A second stakeholder meeting', sourceModule: 'seed', entities: [{ entityId: candAId, role: TemporalEntityRole.ACTOR }, { entityId: chairId, role: TemporalEntityRole.TARGET }] }, actor);

  // Local-association-support observation series climbing 45 → 60 → 72.
  for (const [i, v] of [45, 60, 72].entries()) {
    await ObservationService.recordObservation({ subjectEntityId: candAId, contextEntityId: seatXId, observationType: ObservationType.LOCAL_ASSOCIATION_SUPPORT, valueNumeric: v, observedAt: daysAgo(40 - i * 18), sourceModule: 'seed' }, actor);
  }
  // Candidate-seat fit series climbing → candidate improved change.
  for (const [i, v] of [52, 61, 69].entries()) {
    await ObservationService.recordObservation({ subjectEntityId: candAId, contextEntityId: seatXId, observationType: ObservationType.CANDIDATE_SEAT_FIT, valueNumeric: v, observedAt: daysAgo(40 - i * 18), sourceModule: 'seed' }, actor);
  }
  await CandidateTemporalService.recordAssessmentUpdate(candAId, seatXId, 52, 69, actor);

  // ===========================================================================
  // Storyline 2 + 9: Candidate B deteriorates (media risk, faction acceptability down).
  // ===========================================================================
  await TemporalEventService.createTemporalEvent({ eventType: TemporalEventType.PUBLIC_STATEMENT_MADE, occurredAt: daysAgo(15), recordedAt: daysAgo(8), title: 'Candidate B controversial statement (discovered late)', sourceModule: 'seed', entities: [{ entityId: candBId, role: TemporalEntityRole.ACTOR }] }, actor);
  for (const [i, v] of [70, 55, 40].entries()) {
    await ObservationService.recordObservation({ subjectEntityId: candBId, contextEntityId: seatXId, observationType: ObservationType.FACTION_ACCEPTABILITY, valueNumeric: v, observedAt: daysAgo(30 - i * 12), sourceModule: 'seed' }, actor);
  }
  for (const [i, v] of [20, 45, 65].entries()) {
    await ObservationService.recordObservation({ subjectEntityId: candBId, observationType: ObservationType.CANDIDATE_RISK, valueNumeric: v, observedAt: daysAgo(30 - i * 12), sourceModule: 'seed' }, actor);
  }
  await CandidateTemporalService.recordAssessmentUpdate(candBId, seatXId, 66, 52, actor);

  // ===========================================================================
  // Storyline 4: overdue commitment to the chair.
  // ===========================================================================
  await CommitmentService.createCommitment({ fromEntityId: candAId, toEntityId: chairId, relatedConstituencyEntityId: seatXId, title: 'Send candidate A local plan to chair', commitmentType: CommitmentType.FOLLOW_UP, promisedAt: daysAgo(35), dueAt: daysAgo(10) }, actor);
  const liveCommitment = await CommitmentService.createCommitment({ fromEntityId: candBId, toEntityId: brokerId, title: 'Consult broker before selection', commitmentType: CommitmentType.CANDIDATE_SELECTION_RELATED, promisedAt: daysAgo(30), dueAt: daysAgo(5) }, actor);
  await CommitmentService.markOverdue(new Date(), actor);

  // ===========================================================================
  // Storyline 5: faction risk escalating (broker + others oppose candidate B).
  // ===========================================================================
  await FactionTemporalService.detectFactionEscalation({ subjectEntityId: candBId, factionEntityId: factionId, factionName: 'Group A', hostileHighInfluenceOpponentsInWindow: 3, overdueCommitmentToFactionMember: true }, actor);
  for (const [i, v] of [20, 45, 72].entries()) {
    await ObservationService.recordObservation({ subjectEntityId: factionId, contextEntityId: candBId, observationType: ObservationType.FACTION_RISK, valueNumeric: v, observedAt: daysAgo(24 - i * 8), sourceModule: 'seed' }, actor);
  }

  // ===========================================================================
  // Storyline 6: policy radius expanding after local issue gains salience.
  // ===========================================================================
  await PolicyTemporalService.applyPolicyRadiusRule(policyId, { localIssueSalienceIncreased: true, stakeholderAttitudeWorsened: true, constituencyEntityId: seatXId }, actor);
  for (const [i, v] of [20, 38, 55].entries()) {
    await ObservationService.recordObservation({ subjectEntityId: policyId, contextEntityId: seatXId, observationType: ObservationType.POLICY_BLAST_RADIUS, valueNumeric: v, observedAt: daysAgo(20 - i * 7), sourceModule: 'seed' }, actor);
  }

  // ===========================================================================
  // Storyline 7: FPTP scenario created early then context moves → goes stale.
  // ===========================================================================
  const scenario = await prisma.fPTPScenario.create({ data: { constituencyEntityId: seatXId, candidateEntityId: candAId, scenarioType: 'COMPETE', title: 'Run soft in Northbridge', recommendationLabel: 'GATHER_MORE_DATA', estimatedWinProbability: 0.3, confidence: Confidence.LOW, createdAt: daysAgo(45) } as never }).catch(() => null);
  if (scenario) {
    await SnapshotService.createEntitySnapshot({ entityId: seatXId, snapshotType: SnapshotType.FPTP_CONTEXT, snapshotJson: { fptpScenarioId: scenario.id, context: { localAssociationSupport: 45, candidateSeatFit: 52, competitiveness: 40 } }, snapshotAt: daysAgo(45), sourceModule: 'fptp' }, actor);
    await ChangeService.recordFPTPRecommendationChange(scenario.id, 'GATHER_MORE_DATA', 'COMPETE_SELECTIVELY', actor);
  }

  // ===========================================================================
  // Storyline 10: relationship repaired after a follow-up action (broker call).
  // ===========================================================================
  const repair = await TemporalEventService.createTemporalEvent({ eventType: TemporalEventType.CALL_OCCURRED, occurredAt: daysAgo(3), title: 'Repair call with broker', sourceModule: 'seed', metadata: { relationshipId: relStale.id }, entities: [{ entityId: candBId, role: TemporalEntityRole.ACTOR }, { entityId: brokerId, role: TemporalEntityRole.TARGET }] }, actor);
  await prisma.relationship.update({ where: { id: relStale.id }, data: { lastInteractionAt: daysAgo(3) } }).catch(() => undefined);
  await RelationshipTemporalService.recordRelationshipStrengthChange(relStale.id, 5, 5, { rationale: 'Relationship maintained after repair call', sourceTemporalEventId: repair.id }, actor);
  await CommitmentService.completeCommitment(liveCommitment.id, actor);

  // Decay sweep + war-room snapshot for the "what changed since last briefing" demo.
  await DecayService.applyScheduledDecay(new Date(), actor).catch(() => 0);

  const counts = {
    temporalEvents: await prisma.temporalEvent.count(),
    observations: await prisma.temporalObservation.count(),
    changes: await prisma.temporalChange.count(),
    commitments: await prisma.commitment.count(),
    snapshots: await prisma.entitySnapshot.count(),
    relationshipStates: await prisma.relationshipTemporalState.count(),
  };
  console.log('Temporal seed complete:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
