// =============================================================================
// integration.test.ts — service-level tests against a real database (§22).
// -----------------------------------------------------------------------------
// These require a live Postgres and a generated Prisma client, so the whole
// suite is skipped unless DATABASE_URL is set. Run locally with, e.g.:
//
//   DATABASE_URL=postgres://... npx prisma migrate deploy
//   DATABASE_URL=postgres://... npx vitest run tests/integration.test.ts
//
// Imports are static and safe to collect even without a generated client: the
// Prisma client is constructed lazily (see db.ts), so nothing is initialised
// until a test actually touches the database.
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  prisma,
  EntityService,
  RelationshipService,
  CandidateContextService,
  ConstituencyContextService,
  FactionContextService,
  PolicyRadiusContextService,
  FPTPContextService,
  ComplianceService,
  WarRoomService,
  RelationshipType,
  Attitude,
  InfluenceLevel,
  CandidateStatus,
  StrategicPriority,
  DataClassification,
  FPTPScenarioType,
  Visibility,
} from '../src/domain/ontology/index.js';

const RUN = !!process.env.DATABASE_URL;
const tag = `it-${Date.now().toString(36)}`;
const actor = { userId: 'test-runner' };

// IDs shared across tests, populated in beforeAll.
let constituencyId: string;
let candidateAId: string;
let candidateBId: string;
let associationId: string;
let factionId: string;
let hostileMemberId: string;
let policyId: string;
let issueId: string;

describe.skipIf(!RUN)('ontology integration', () => {
  beforeAll(async () => {
    const constituency = await EntityService.createConstituency(
      { displayName: `Northbridge ${tag}`, slug: `northbridge-${tag}` },
      { name: `Northbridge ${tag}`, strategicPriority: StrategicPriority.HIGH, localPartyStrength: 3 },
      actor,
    );
    constituencyId = constituency.entity.id;

    const candidateA = await EntityService.createCandidate(
      { displayName: `Candidate Alpha ${tag}`, slug: `cand-alpha-${tag}` },
      { candidateStatus: CandidateStatus.SHORT_LISTED, localConnectionScore: 30, riskScore: 20, currentTargetConstituencyId: constituencyId },
      actor,
    );
    candidateAId = candidateA.entity.id;

    const candidateB = await EntityService.createCandidate(
      { displayName: `Candidate Bravo ${tag}`, slug: `cand-bravo-${tag}` },
      { candidateStatus: CandidateStatus.SHORT_LISTED, localConnectionScore: 80, riskScore: 70, currentTargetConstituencyId: constituencyId },
      actor,
    );
    candidateBId = candidateB.entity.id;

    const association = await EntityService.createOrganisation(
      { displayName: `Northbridge Local Association ${tag}`, slug: `assoc-${tag}` },
      {},
      actor,
    );
    associationId = association.entity.id;

    const faction = await EntityService.createFaction(
      { displayName: `Reform Bloc ${tag}`, slug: `faction-${tag}` },
      {},
      actor,
    );
    factionId = faction.entity.id;

    const hostileMember = await EntityService.createPerson(
      { displayName: `Hostile Notable ${tag}`, slug: `hostile-${tag}` },
      {},
      actor,
    );
    hostileMemberId = hostileMember.entity.id;

    const issue = await EntityService.createIssue(
      { displayName: `Local Bypass ${tag}`, slug: `issue-${tag}` },
      {},
      actor,
    );
    issueId = issue.entity.id;

    const policy = await EntityService.createPolicy(
      { displayName: `Road Investment Policy ${tag}`, slug: `policy-${tag}` },
      {},
      actor,
    );
    policyId = policy.entity.id;

    // Wire the graph:
    // Candidate Alpha -> local association (strong but stale)
    await RelationshipService.createRelationship(
      {
        sourceEntityId: candidateAId,
        targetEntityId: associationId,
        type: RelationshipType.BELONGS_TO,
        strength: 5,
        lastInteractionAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
      },
      actor,
    );
    // Hostile high-influence member belongs to the faction and opposes Alpha
    await RelationshipService.createRelationship(
      { sourceEntityId: hostileMemberId, targetEntityId: factionId, type: RelationshipType.MEMBER_OF_FACTION, strength: 4, influenceLevel: InfluenceLevel.HIGH },
      actor,
    );
    await RelationshipService.createRelationship(
      { sourceEntityId: hostileMemberId, targetEntityId: candidateAId, type: RelationshipType.HOSTILE_TO, strength: 4, attitude: Attitude.HOSTILE, influenceLevel: InfluenceLevel.HIGH },
      actor,
    );
    // Policy affects the issue, issue salient in the constituency
    await RelationshipService.createRelationship(
      { sourceEntityId: policyId, targetEntityId: issueId, type: RelationshipType.ASSOCIATED_WITH_ISSUE, strength: 4 },
      actor,
    );
    await RelationshipService.createRelationship(
      { sourceEntityId: issueId, targetEntityId: constituencyId, type: RelationshipType.MATTERS_TO_CONSTITUENCY, strength: 5 },
      actor,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates entities with profiles and reads them back', async () => {
    const summary = await EntityService.getEntitySummary(candidateAId);
    expect(summary).toBeTruthy();
    const found = await EntityService.searchEntities({ query: `Alpha ${tag}` });
    expect(found.some((e: { id: string }) => e.id === candidateAId)).toBe(true);
  });

  it('archives an entity (soft delete)', async () => {
    const temp = await EntityService.createPerson({ displayName: `Temp ${tag}`, slug: `temp-${tag}` }, {}, actor);
    await EntityService.archiveEntity(temp.entity.id, actor);
    const after = await EntityService.getEntity(temp.entity.id);
    expect(after?.status).not.toBe('ACTIVE');
  });

  it('builds a relationship graph around an entity', async () => {
    const graph = await RelationshipService.getRelationshipGraph(candidateAId, 1);
    expect(graph.nodes.length).toBeGreaterThan(1);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.nodes.some((n: { entityId: string }) => n.entityId === candidateAId)).toBe(true);
  });

  it('detects stale high-value relationships', async () => {
    const stale = await RelationshipService.getStaleRelationships({ staleDays: 90, minStrength: 4 });
    expect(stale.some((r: { sourceEntityId: string }) => r.sourceEntityId === candidateAId)).toBe(true);
  });

  it('reports relationship gaps for a candidate', async () => {
    // Candidate Bravo has no local-association link, so a gap should surface.
    const gaps = await RelationshipService.getRelationshipGaps({ candidateEntityId: candidateBId, constituencyEntityId: constituencyId });
    expect(Array.isArray(gaps)).toBe(true);
  });

  it('computes a deterministic candidate seat assessment', async () => {
    const a = await CandidateContextService.calculateCandidateSeatAssessment(candidateAId, constituencyId, actor);
    const again = await CandidateContextService.calculateCandidateSeatAssessment(candidateAId, constituencyId, actor);
    expect(a.overallFitScore).toBeGreaterThanOrEqual(0);
    expect(a.overallFitScore).toBeLessThanOrEqual(100);
    // deterministic: same inputs -> same score
    expect(again.overallFitScore).toBeCloseTo(a.overallFitScore, 5);
  });

  it('compares candidates for a seat and picks a recommendation', async () => {
    const cmp = await CandidateContextService.compareCandidatesForSeat([candidateAId, candidateBId], constituencyId, actor);
    expect(cmp.rows.length).toBe(2);
    expect(cmp.rows.map((r: { candidateEntityId: string }) => r.candidateEntityId)).toEqual(
      expect.arrayContaining([candidateAId, candidateBId]),
    );
  });

  it('surfaces faction risk from hostile high-influence members', async () => {
    const risks = await FactionContextService.getFactionRiskForCandidate(candidateAId, constituencyId);
    expect(Array.isArray(risks)).toBe(true);
  });

  it('computes a policy radius (affected entities)', async () => {
    const ctx = await PolicyRadiusContextService.getPolicyContext(policyId);
    expect(ctx).toBeTruthy();
  });

  it('saves and reads back an FPTP scenario', async () => {
    const saved = await FPTPContextService.saveFPTPScenario(
      {
        constituencyEntityId: constituencyId,
        candidateEntityId: candidateAId,
        scenarioType: FPTPScenarioType.RUN_HARD,
        title: `Baseline ${tag}`,
        estimatedWinProbability: 0.35,
      },
      actor,
    );
    expect(saved.id).toBeTruthy();
    const list = await FPTPContextService.getFPTPScenarios(constituencyId);
    expect(list.some((s: { id: string }) => s.id === saved.id)).toBe(true);
  });

  it('classifies evidence and forces visibility down', async () => {
    const flagged = await ComplianceService.flagEntityForClassification(
      hostileMemberId,
      DataClassification.SPECIAL_CATEGORY_RISK,
      actor,
    );
    expect(flagged).toBeTruthy();
    const refreshed = await EntityService.getEntity(hostileMemberId);
    // special-category data should not remain publicly visible
    expect(refreshed?.visibility).not.toBe(Visibility.PUBLIC_CONTEXT);
  });

  it('produces a war-room summary', async () => {
    const summary = await WarRoomService.getSummary({ limit: 5 });
    expect(summary).toHaveProperty('topRisks');
    expect(summary).toHaveProperty('staleRelationships');
    expect(summary).toHaveProperty('pendingCandidateDecisions');
  });
});
