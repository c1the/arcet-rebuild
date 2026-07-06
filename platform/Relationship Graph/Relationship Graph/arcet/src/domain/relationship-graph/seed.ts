// =============================================================================
// seed.ts — relationship-graph demo data (brief §22). Run: npm run rg:seed
// -----------------------------------------------------------------------------
// Builds on the ontology + temporal graph and demonstrates the five storylines:
// (1) candidate relationship gap, (2) stale high-value stakeholder, (3) faction
// broker, (4) policy briefing list, (5) repaired relationship → FPTP scenario
// stale. All data is FICTIONAL; the graph models candidates/stakeholders/
// factions/organisations/seats — never individual voters.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { EntityService } from '../ontology/entity.service.js';
import { Attitude, Confidence, InfluenceLevel, RelationshipType } from '../ontology/enums.js';
import { RelationshipCrudService } from './crud.service.js';
import { RelationshipScoringService } from './scoring.service.js';
import { RelationshipGapService } from './gap.service.js';
import { AccessPathService } from './access-path.service.js';
import { RelationshipActionService } from './action.service.js';
import { RelationshipCompatibilityService } from './compatibility.service.js';

const actor = { userId: 'rg-seed' };
const days = (n: number) => new Date(Date.now() - n * 86400000);

async function main() {
  console.log('Seeding Arcet relationship graph…');

  // ---- Constituencies + local associations + factions ----------------------
  const cx = await EntityService.createConstituency({ displayName: 'Constituency X (fictional)' }, {} as never, actor);
  const cy = await EntityService.createConstituency({ displayName: 'Constituency Y (fictional)' }, {} as never, actor);
  const seatXId = cx.entity.id;
  const seatYId = cy.entity.id;
  const assoc = await EntityService.createOrganisation({ displayName: 'Local Association X (fictional)' }, {} as never, actor);
  const factionC = await EntityService.createFaction({ displayName: 'Faction C (fictional)' }, {} as never, actor);

  // ---- People --------------------------------------------------------------
  const candA = await EntityService.createCandidate({ displayName: 'Candidate A (fictional)' }, {} as never, actor);
  const candD = await EntityService.createCandidate({ displayName: 'Candidate D (fictional)' }, {} as never, actor);
  const candF = await EntityService.createCandidate({ displayName: 'Candidate F (fictional)' }, {} as never, actor);
  const chairX = await EntityService.createPerson({ displayName: 'Local Association Chair X (fictional)' }, { politicalInfluence: InfluenceLevel.HIGH } as never, actor);
  const stakeB = await EntityService.createPerson({ displayName: 'Stakeholder B (fictional)' }, { politicalInfluence: InfluenceLevel.HIGH } as never, actor);
  const brokerE = await EntityService.createPerson({ displayName: 'Person E — faction broker (fictional)' }, { politicalInfluence: InfluenceLevel.HIGH } as never, actor);
  const adviserD = await EntityService.createPerson({ displayName: "Candidate D's adviser (fictional)" }, { politicalInfluence: InfluenceLevel.MEDIUM } as never, actor);

  // ---- Issues + policy -----------------------------------------------------
  const issueQ = await EntityService.createIssue({ displayName: 'Issue Q — housing (fictional)' }, {} as never, actor);
  const policyP = await EntityService.createPolicy({ displayName: 'Policy P (fictional)' }, {} as never, actor);
  const stakeQ1 = await EntityService.createPerson({ displayName: 'Housing stakeholder 1 (fictional)' }, { politicalInfluence: InfluenceLevel.HIGH } as never, actor);
  const stakeQ2 = await EntityService.createOrganisation({ displayName: 'Housing campaign group (fictional)' }, {} as never, actor);

  // ---- Storyline 2: stale high-value stakeholder in Constituency Y ----------
  const staleRel = await RelationshipCrudService.createRelationship({ sourceEntityId: candA.entity.id, targetEntityId: stakeB.entity.id, type: RelationshipType.KNOWS, strength: 4, attitude: Attitude.SUPPORTIVE, influenceLevel: InfluenceLevel.HIGH, confidence: Confidence.HIGH, lastInteractionAt: days(120) } as never, actor);
  await RelationshipCrudService.createRelationship({ sourceEntityId: stakeB.entity.id, targetEntityId: seatYId, type: RelationshipType.MATTERS_TO_CONSTITUENCY, strength: 4, influenceLevel: InfluenceLevel.HIGH, confidence: Confidence.HIGH } as never, actor);
  await RelationshipScoringService.recalculateRelationshipScores(staleRel.id, { strategic: { affectsCandidateSelection: true, affectsFPTP: true } }, actor);
  await RelationshipActionService.generateRelationshipActions(staleRel.id, { strategic: { affectsCandidateSelection: true, affectsFPTP: true } }, actor);

  // ---- Storyline 1: Candidate A has NO link to the local association chair --
  // (deliberately omit candA -> chairX). Detect the gap.
  await RelationshipCrudService.createRelationship({ sourceEntityId: chairX.entity.id, targetEntityId: assoc.entity.id, type: RelationshipType.REPRESENTS, strength: 5, influenceLevel: InfluenceLevel.HIGH, confidence: Confidence.CONFIRMED } as never, actor);
  await RelationshipCrudService.createRelationship({ sourceEntityId: chairX.entity.id, targetEntityId: seatXId, type: RelationshipType.MATTERS_TO_CONSTITUENCY, strength: 5, influenceLevel: InfluenceLevel.HIGH, confidence: Confidence.CONFIRMED } as never, actor);
  await RelationshipGapService.detectCandidateRelationshipGaps(candA.entity.id, seatXId, true, actor);

  // ---- Storyline 3: faction broker route to Candidate D ---------------------
  await RelationshipCrudService.createRelationship({ sourceEntityId: factionC.entity.id, targetEntityId: candD.entity.id, type: RelationshipType.OPPOSES, strength: 3, attitude: Attitude.SCEPTICAL, influenceLevel: InfluenceLevel.HIGH, confidence: Confidence.MEDIUM } as never, actor);
  await RelationshipCrudService.createRelationship({ sourceEntityId: brokerE.entity.id, targetEntityId: factionC.entity.id, type: RelationshipType.BROKER_FOR, strength: 4, influenceLevel: InfluenceLevel.HIGH, confidence: Confidence.HIGH } as never, actor);
  await RelationshipCrudService.createRelationship({ sourceEntityId: brokerE.entity.id, targetEntityId: adviserD.entity.id, type: RelationshipType.KNOWS, strength: 5, attitude: Attitude.SUPPORTIVE, influenceLevel: InfluenceLevel.HIGH, confidence: Confidence.HIGH, lastInteractionAt: days(10) } as never, actor);
  await RelationshipCrudService.createRelationship({ sourceEntityId: adviserD.entity.id, targetEntityId: candD.entity.id, type: RelationshipType.CONTROLS_ACCESS_TO, strength: 5, influenceLevel: InfluenceLevel.HIGH, confidence: Confidence.CONFIRMED, lastInteractionAt: days(5) } as never, actor);
  const broker = await AccessPathService.getBestBrokerForTarget(factionC.entity.id);
  const path = await AccessPathService.findAccessPaths(candD.entity.id, factionC.entity.id, { maxDepth: 4 });
  if (path[0]) await AccessPathService.saveAccessPath({ sourceEntityId: candD.entity.id, targetEntityId: factionC.entity.id, nodes: path[0].nodes, relationshipIds: path[0].relationshipIds, pathQualityScore: path[0].pathQualityScore, pathRiskScore: path[0].pathRiskScore, rationale: 'Route to sceptical faction via broker E.' }, actor);

  // ---- Storyline 4: policy briefing list (Policy P → Issue Q stakeholders) --
  await RelationshipCrudService.createRelationship({ sourceEntityId: stakeQ1.entity.id, targetEntityId: issueQ.entity.id, type: RelationshipType.ASSOCIATED_WITH_ISSUE, strength: 4, influenceLevel: InfluenceLevel.HIGH, confidence: Confidence.HIGH } as never, actor);
  await RelationshipCrudService.createRelationship({ sourceEntityId: stakeQ2.entity.id, targetEntityId: issueQ.entity.id, type: RelationshipType.ASSOCIATED_WITH_ISSUE, strength: 4, influenceLevel: InfluenceLevel.MEDIUM, confidence: Confidence.MEDIUM } as never, actor);
  await RelationshipGapService.detectPolicyRelationshipGaps(policyP.entity.id, [stakeQ1.entity.id, stakeQ2.entity.id], true, actor);
  await RelationshipCompatibilityService.getRelationshipInputsForPolicyRadius(policyP.entity.id, [stakeQ1.entity.id, stakeQ2.entity.id]);

  // ---- Storyline 5: Candidate F repairs a key local relationship ------------
  const repairRel = await RelationshipCrudService.createRelationship({ sourceEntityId: candF.entity.id, targetEntityId: chairX.entity.id, type: RelationshipType.KNOWS, strength: 2, attitude: Attitude.SCEPTICAL, influenceLevel: InfluenceLevel.HIGH, confidence: Confidence.MEDIUM, lastInteractionAt: days(60) } as never, actor);
  const repairActions = await RelationshipActionService.generateRelationshipActions(repairRel.id, { strategic: { affectsCandidateSelection: true, affectsLocalAssociationSupport: true } }, actor);
  await RelationshipActionService.updateRelationshipFromActionOutcome(repairActions[0]?.id ?? 'none', repairRel.id, 'POSITIVE', actor);
  const scenario = await prisma.fPTPScenario.create({ data: { constituencyEntityId: seatXId, candidateEntityId: candF.entity.id, scenarioType: 'COMPETE', title: 'Run soft in X (pre-repair)', recommendationLabel: 'GATHER_MORE_DATA', estimatedWinProbability: 0.3, confidence: Confidence.LOW, createdAt: days(40) } as never }).catch(() => null);
  if (scenario) console.log('  FPTP scenario created (now potentially stale after relationship repair):', scenario.id);

  const counts = {
    relationships: await prisma.relationship.count(),
    tags: await prisma.relationshipTag.count(),
    notes: await prisma.relationshipNote.count(),
    scores: await prisma.relationshipScore.count(),
    gaps: await prisma.relationshipGap.count(),
    paths: await prisma.relationshipPath.count(),
  };
  console.log('Relationship graph seed complete:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
