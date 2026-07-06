// =============================================================================
// seed.ts — candidate-intelligence demo data (brief §22). Run: npm run ci:seed
// -----------------------------------------------------------------------------
// Builds on the ontology + temporal graph and demonstrates the four storylines:
// (1) improving candidate A, (2) high-upside/high-risk candidate B, (3) strong
// local candidate C (safest for a marginal), (4) candidate D improvement makes
// an old FPTP "run soft" scenario stale. All data is FICTIONAL; the model
// covers candidates/stakeholders/factions/seats, never individual voters.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { EntityService } from '../ontology/entity.service.js';
import { RelationshipService } from '../ontology/relationship.service.js';
import { Attitude, CandidateStatus, Confidence, InfluenceLevel, RelationshipType, VettingStatus } from '../ontology/enums.js';
import { CandidateIntelligenceService } from './candidate-intelligence.service.js';
import { CandidateComparisonService } from './comparison.service.js';
import { CandidateRiskService } from './risk.service.js';
import { CandidateDevelopmentService } from './development.service.js';

const actor = { userId: 'ci-seed' };

async function main() {
  console.log('Seeding Arcet candidate intelligence…');

  // Default weight config (brief §7.1).
  await prisma.candidateScoreWeightConfig.upsert({
    where: { name: 'default-seat-fit' },
    update: {},
    create: { name: 'default-seat-fit', description: 'Default candidate-seat-fit weights', isDefault: true },
  });

  // ---- Constituencies ------------------------------------------------------
  const marginal = await EntityService.createConstituency({ displayName: 'Marginal Marsh (fictional)' }, {} as never, actor);
  const seatX = await EntityService.createConstituency({ displayName: 'Seat X — Northbridge (fictional)' }, {} as never, actor);
  const seatXId = seatX.entity.id;
  const marginalId = marginal.entity.id;

  // ---- Candidates (storylines 1–4) -----------------------------------------
  const A = await EntityService.createCandidate({ displayName: 'Candidate A (fictional)' }, { candidateStatus: CandidateStatus.SHORT_LISTED, vettingStatus: VettingStatus.IN_PROGRESS, politicalExperienceScore: 55, localConnectionScore: 50, localAssociationSupportScore: 42, factionAcceptabilityScore: 60, issueCredibilityScore: 58, mediaReadinessScore: 55, campaignCapacityScore: 55, riskScore: 18, developmentPotentialScore: 70 } as never, actor);
  const B = await EntityService.createCandidate({ displayName: 'Candidate B (fictional)' }, { candidateStatus: CandidateStatus.SHORT_LISTED, vettingStatus: VettingStatus.CLEARED, politicalExperienceScore: 82, localConnectionScore: 45, localAssociationSupportScore: 55, factionAcceptabilityScore: 38, issueCredibilityScore: 60, mediaReadinessScore: 82, campaignCapacityScore: 65, riskScore: 62, developmentPotentialScore: 50 } as never, actor);
  const C = await EntityService.createCandidate({ displayName: 'Candidate C (fictional)' }, { candidateStatus: CandidateStatus.SHORT_LISTED, vettingStatus: VettingStatus.CLEARED, politicalExperienceScore: 48, localConnectionScore: 85, localAssociationSupportScore: 80, factionAcceptabilityScore: 70, issueCredibilityScore: 72, mediaReadinessScore: 58, campaignCapacityScore: 70, riskScore: 12, developmentPotentialScore: 60 } as never, actor);
  const Dn = await EntityService.createCandidate({ displayName: 'Candidate D (fictional)' }, { candidateStatus: CandidateStatus.SHORT_LISTED, vettingStatus: VettingStatus.CLEARED, politicalExperienceScore: 50, localConnectionScore: 55, localAssociationSupportScore: 50, factionAcceptabilityScore: 60, issueCredibilityScore: 55, mediaReadinessScore: 55, campaignCapacityScore: 55, riskScore: 20, developmentPotentialScore: 65 } as never, actor);
  const [aId, bId, cId, dId] = [A.entity.id, B.entity.id, C.entity.id, Dn.entity.id];

  // ---- Stakeholders + relationships ----------------------------------------
  const chair = await EntityService.createPerson({ displayName: 'Local Association Chair (fictional)' }, { politicalInfluence: InfluenceLevel.HIGH } as never, actor);
  const broker = await EntityService.createPerson({ displayName: 'Faction Broker (fictional)' }, { politicalInfluence: InfluenceLevel.HIGH } as never, actor);
  await RelationshipService.createRelationship({ sourceEntityId: cId, targetEntityId: chair.entity.id, type: RelationshipType.KNOWS, strength: 5, attitude: Attitude.SUPPORTIVE, influenceLevel: InfluenceLevel.HIGH, lastInteractionAt: new Date() } as never, actor);
  await RelationshipService.createRelationship({ sourceEntityId: bId, targetEntityId: broker.entity.id, type: RelationshipType.KNOWS, strength: 3, attitude: Attitude.HOSTILE, influenceLevel: InfluenceLevel.HIGH, lastInteractionAt: new Date() } as never, actor);

  // ---- Storyline 1: A improves, then we reassess ---------------------------
  await CandidateIntelligenceService.runCandidateSeatAssessment(aId, marginalId, { persist: true }, actor);
  // Two local meetings + endorsement lift local association support.
  await CandidateIntelligenceService.runCandidateSeatAssessment(aId, marginalId, { persist: true, signals: { localAssociation: { chairAttitudeScore: 78, councillorSupport: true, completedMeetings: 2, selectionCommitteeSupport: true } } as never }, actor);

  // ---- Storyline 2: B high-upside / high-risk ------------------------------
  await CandidateIntelligenceService.runCandidateSeatAssessment(bId, marginalId, { persist: true, signals: { faction: { highInfluenceOpposition: true, factionMoodScore: 35 }, issueCredibility: { contradictoryStatements: true } } as never }, actor);
  await CandidateRiskService.createCandidateRisk({ candidateEntityId: bId, constituencyEntityId: marginalId, title: 'Factional dispute + policy contradiction', severity: 'HIGH' as never, rationale: 'High-influence faction opposition and a contradictory past statement.' }, actor);

  // ---- Storyline 3: C strong local, safest for the marginal ----------------
  await CandidateIntelligenceService.runCandidateSeatAssessment(cId, marginalId, { persist: true }, actor);

  // Comparison across A, B, C for the marginal.
  await CandidateComparisonService.compareCandidatesForConstituency([aId, bId, cId], marginalId, { title: 'Marginal Marsh shortlist' }, actor);

  // Development plan for A.
  await CandidateDevelopmentService.createDevelopmentPlan(aId, marginalId, { title: 'Candidate A development', targetReadinessScore: 75 }, actor);

  // ---- Storyline 4: D improvement makes an old FPTP "run soft" stale --------
  const baseAssessment = await CandidateIntelligenceService.runCandidateSeatAssessment(dId, seatXId, { persist: true }, actor);
  const scenario = await prisma.fPTPScenario.create({
    data: { constituencyEntityId: seatXId, candidateEntityId: dId, scenarioType: 'COMPETE', title: 'Run soft in Seat X', recommendationLabel: 'GATHER_MORE_DATA', estimatedWinProbability: 0.3, confidence: Confidence.LOW, createdAt: new Date(Date.now() - 45 * 86400000) } as never,
  }).catch(() => null);
  if (scenario && 'seatAssessment' in baseAssessment) {
    // D improves materially → assessment changes → FPTP scenario should be rerun.
    await CandidateIntelligenceService.runCandidateSeatAssessment(dId, seatXId, { persist: true, signals: { localAssociation: { chairAttitudeScore: 85, councillorSupport: true, selectionCommitteeSupport: true }, localConnection: { livesInConstituency: true, localRoots: true } } as never }, actor);
  }

  const counts = {
    assessmentRuns: await prisma.candidateAssessmentRun.count(),
    dimensions: await prisma.candidateAssessmentDimension.count(),
    seatAssessments: await prisma.candidateSeatAssessment.count(),
    comparisons: await prisma.candidateComparisonRun.count(),
    vulnerabilities: await prisma.candidateVulnerability.count(),
    developmentPlans: await prisma.candidateDevelopmentPlan.count(),
  };
  console.log('Candidate intelligence seed complete:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
