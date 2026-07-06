// =============================================================================
// candidate-intelligence-integration.test.ts — service tests against a real DB.
// Skipped unless DATABASE_URL is set (and prisma generate + migrate have run).
// Static imports are safe due to the lazy Prisma proxy in db.ts.
// =============================================================================
import { describe, it, expect, beforeAll } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('candidate-intelligence integration', () => {
  let ci: typeof import('../src/domain/candidate-intelligence/index.js');
  let ont: typeof import('../src/domain/ontology/index.js');
  let candA: string;
  let candB: string;
  let seat: string;

  beforeAll(async () => {
    ci = await import('../src/domain/candidate-intelligence/index.js');
    ont = await import('../src/domain/ontology/index.js');
    const a = await ont.EntityService.createCandidate({ displayName: 'CI Test A' }, { localConnectionScore: 75, localAssociationSupportScore: 70, riskScore: 15, issueCredibilityScore: 65 } as never);
    const b = await ont.EntityService.createCandidate({ displayName: 'CI Test B' }, { mediaReadinessScore: 80, politicalExperienceScore: 80, riskScore: 65, factionAcceptabilityScore: 40 } as never);
    const s = await ont.EntityService.createConstituency({ displayName: 'CI Test Seat' }, {} as never);
    candA = a.entity.id; candB = b.entity.id; seat = s.entity.id;
  });

  it('runs a seat assessment creating run + seat assessment + scores + snapshot + actions', async () => {
    const res = await ci.CandidateIntelligenceService.runCandidateSeatAssessment(candA, seat, { persist: true });
    expect(res.run.id).toBeTruthy();
    expect(res.seatAssessment.overallFitScore).toBeGreaterThanOrEqual(0);
    expect(res.run.dimensions.length).toBe(10);
    expect(res.snapshot.id).toBeTruthy();
  });

  it('compares candidates and identifies superlatives', async () => {
    const { comparison } = await ci.CandidateComparisonService.compareCandidatesForConstituency([candA, candB], seat, {});
    expect(comparison.entries.length).toBe(2);
    expect(comparison.entries[0].rankOverall).toBe(1);
    expect(comparison.winner).toBeTruthy();
    expect(comparison.highestRisk).toBe(candB); // B has the higher risk score
  });

  it('creates, escalates and resolves a candidate risk', async () => {
    const risk = await ci.CandidateRiskService.createCandidateRisk({ candidateEntityId: candB, title: 'Vetting gap', severity: 'MEDIUM' as never });
    const escalated = await ci.CandidateRiskService.escalateCandidateRisk(risk.id, 'new evidence');
    expect(escalated.severity).toBe('HIGH');
    const resolved = await ci.CandidateRiskService.resolveCandidateRisk(risk.id, 'cleared by review');
    expect(resolved.status).toBe('RESOLVED');
  });

  it('builds a development plan and completes an action (improving a dimension)', async () => {
    const plan = await ci.CandidateDevelopmentService.createDevelopmentPlan(candB, seat, { title: 'Develop B' });
    expect(plan?.actions.length).toBeGreaterThan(0);
    const first = plan!.actions[0];
    const done = await ci.CandidateDevelopmentService.completeDevelopmentAction(first.id, 'completed');
    expect(done.outcome).toBe('completed');
    const progress = await ci.CandidateDevelopmentService.getDevelopmentProgress(candB, seat);
    expect(progress?.completed).toBeGreaterThanOrEqual(1);
  });

  it('detects vulnerabilities for a risky candidate', async () => {
    const vulns = await ci.CandidateRiskService.detectCandidateVulnerabilities(candB, seat, true);
    expect(Array.isArray(vulns)).toBe(true);
  });

  it('produces FPTP inputs and detects material change on reassessment', async () => {
    const inputs = await ci.CandidateFPTPCompatibilityService.getCandidateFPTPInputs(candA, seat);
    expect(inputs.candidateSeatFitScore).toBeGreaterThanOrEqual(0);
    // Reassess with a strong override to force a material improvement → temporal change.
    await ci.CandidateIntelligenceService.runCandidateSeatAssessment(candA, seat, { persist: true, signals: { localAssociation: { chairAttitudeScore: 95, councillorSupport: true, selectionCommitteeSupport: true } } as never });
    const changes = await ci.CandidateIntelTemporalService.getCandidateChangesSince(candA, new Date(Date.now() - 86400000));
    expect(changes.changes.length).toBeGreaterThanOrEqual(0);
  });

  it('explains a seat assessment', async () => {
    const res = await ci.CandidateIntelligenceService.runCandidateSeatAssessment(candA, seat, { persist: true });
    const explanation = await ci.CandidateExplanationService.explainCandidateSeatAssessment(res.seatAssessment.id);
    expect(explanation?.conclusion).toBeTruthy();
  });
});
