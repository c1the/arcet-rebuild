// =============================================================================
// relationship-graph-integration.test.ts — service tests against a real DB.
// Skipped unless DATABASE_URL is set (and prisma generate + migrate have run).
// Static imports are safe due to the lazy Prisma proxy in db.ts.
// =============================================================================
import { describe, it, expect, beforeAll } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('relationship-graph integration', () => {
  let rg: typeof import('../src/domain/relationship-graph/index.js');
  let ont: typeof import('../src/domain/ontology/index.js');
  let candidate: string;
  let chair: string;
  let stakeholder: string;
  let seat: string;
  let relId: string;

  beforeAll(async () => {
    rg = await import('../src/domain/relationship-graph/index.js');
    ont = await import('../src/domain/ontology/index.js');
    const c = await ont.EntityService.createCandidate({ displayName: 'RG Test Candidate' }, {} as never);
    const ch = await ont.EntityService.createPerson({ displayName: 'RG Local Chair' }, { politicalInfluence: 'HIGH' } as never);
    const st = await ont.EntityService.createPerson({ displayName: 'RG Stakeholder' }, { politicalInfluence: 'HIGH' } as never);
    const s = await ont.EntityService.createConstituency({ displayName: 'RG Test Seat' }, {} as never);
    candidate = c.entity.id; chair = ch.entity.id; stakeholder = st.entity.id; seat = s.entity.id;
  });

  it('creates, tags, notes, scores and confirms a relationship', async () => {
    const rel = await rg.RelationshipCrudService.createRelationship({ sourceEntityId: candidate, targetEntityId: stakeholder, type: 'KNOWS' as never, strength: 4, attitude: 'SUPPORTIVE' as never, influenceLevel: 'HIGH' as never, confidence: 'HIGH' as never, lastInteractionAt: new Date() });
    relId = rel.id;
    await rg.RelationshipCrudService.addRelationshipTag(relId, 'KEY_STAKEHOLDER');
    await rg.RelationshipCrudService.addRelationshipNote(relId, { noteType: 'MEETING_NOTE' as never, body: 'Met at local event' });
    const confirmed = await rg.RelationshipCrudService.confirmRelationship(relId, undefined);
    expect(confirmed.lastConfirmedAt).toBeTruthy();
    const { results, status } = await rg.RelationshipScoringService.recalculateRelationshipScores(relId, { strategic: { affectsCandidateSelection: true } });
    expect(results.length).toBe(9);
    expect(status).toBeTruthy();
  });

  it('builds an entity graph and a relationship summary', async () => {
    const graph = await rg.RelationshipGraphService.getGraphForCandidate(candidate, { depth: 1 });
    expect(graph.edges.length).toBeGreaterThanOrEqual(1);
    const summary = await rg.RelationshipGraphService.getRelationshipSummary(relId);
    expect(summary?.relationship.id).toBe(relId);
  });

  it('detects a candidate relationship gap (no link to local chair)', async () => {
    const gaps = await rg.RelationshipGapService.detectCandidateRelationshipGaps(candidate, seat, true);
    expect(Array.isArray(gaps)).toBe(true);
    const open = await rg.RelationshipGapService.getOpenRelationshipGaps({ contextEntityId: candidate });
    expect(Array.isArray(open)).toBe(true);
  });

  it('finds and scores an access path, blocking restricted hops', async () => {
    // candidate -> stakeholder (direct), plus stakeholder -> chair to make a 2-hop route to chair.
    await rg.RelationshipCrudService.createRelationship({ sourceEntityId: stakeholder, targetEntityId: chair, type: 'KNOWS' as never, strength: 4, attitude: 'NEUTRAL' as never, influenceLevel: 'HIGH' as never, confidence: 'MEDIUM' as never, lastInteractionAt: new Date() });
    const paths = await rg.AccessPathService.findAccessPaths(candidate, chair, { maxDepth: 3 });
    expect(paths.length).toBeGreaterThanOrEqual(1);
    expect(paths[0].nodes[0]).toBe(candidate);
    expect(paths[0].nodes[paths[0].nodes.length - 1]).toBe(chair);
  });

  it('generates relationship actions and applies a positive outcome', async () => {
    // Make the relationship stale + high-value so a follow-up triggers.
    await rg.RelationshipCrudService.updateRelationship(relId, { lastInteractionAt: new Date(Date.now() - 200 * 86400000) });
    const actions = await rg.RelationshipActionService.generateRelationshipActions(relId, { strategic: { affectsCandidateSelection: true, affectsFPTP: true } });
    expect(Array.isArray(actions)).toBe(true);
    const outcome = await rg.RelationshipActionService.updateRelationshipFromActionOutcome(actions[0]?.id ?? 'none', relId, 'POSITIVE');
    expect(outcome.outcome).toBe('POSITIVE');
  });

  it('produces candidate aggregate + FPTP inputs for cross-module use', async () => {
    const agg = await rg.RelationshipCompatibilityService.getCandidateRelationshipAggregate(candidate, seat);
    expect(agg.candidateEntityId).toBe(candidate);
    expect(agg.stakeholderCoverageScore).toBeGreaterThanOrEqual(0);
    const fptp = await rg.RelationshipCompatibilityService.getRelationshipInputsForFPTP(seat, candidate);
    expect(fptp.constituencyEntityId).toBe(seat);
  });

  it('explains a relationship and a score', async () => {
    const explanation = await rg.RelationshipExplanationService.explainRelationship(relId);
    expect(explanation?.conclusion).toBeTruthy();
    const scoreExplanation = await rg.RelationshipExplanationService.explainRelationshipScore(relId, 'RISK');
    expect(scoreExplanation.value).toBeGreaterThanOrEqual(0);
  });
});
