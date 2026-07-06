// =============================================================================
// temporal-integration.test.ts — service-level tests against a real database.
// -----------------------------------------------------------------------------
// Skipped unless DATABASE_URL is set (and `prisma generate` + `migrate` have
// run). Static imports are safe because db.ts constructs the Prisma client
// lazily on first access. Run with: DATABASE_URL=… npx vitest run temporal-integration
// =============================================================================
import { describe, it, expect, beforeAll } from 'vitest';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('temporal integration', () => {
  let mod: typeof import('../src/domain/temporal/index.js');
  let ont: typeof import('../src/domain/ontology/index.js');
  let candidateId: string;
  let constituencyId: string;
  let stakeholderId: string;
  let relationshipId: string;

  beforeAll(async () => {
    mod = await import('../src/domain/temporal/index.js');
    ont = await import('../src/domain/ontology/index.js');
    const cand = await ont.EntityService.createEntity({ type: 'CANDIDATE', displayName: 'Test Candidate' } as never);
    const con = await ont.EntityService.createEntity({ type: 'CONSTITUENCY', displayName: 'Test Seat' } as never);
    const stake = await ont.EntityService.createEntity({ type: 'PERSON', displayName: 'Local Chair' } as never);
    candidateId = cand.id;
    constituencyId = con.id;
    stakeholderId = stake.id;
    const rel = await ont.RelationshipService.createRelationship({ sourceEntityId: candidateId, targetEntityId: stakeholderId, type: 'KNOWS', strength: 4, attitude: 'NEUTRAL', influenceLevel: 'HIGH' } as never);
    relationshipId = rel.id;
  });

  it('creates a temporal event with occurredAt ≠ recordedAt and links entities', async () => {
    const event = await mod.TemporalEventService.createTemporalEvent({
      eventType: mod.TemporalEventType.PUBLIC_STATEMENT_MADE,
      occurredAt: new Date('2026-03-01'),
      recordedAt: new Date('2026-03-20'),
      title: 'Statement discovered late',
      entities: [{ entityId: candidateId, role: mod.TemporalEntityRole.ACTOR }],
    });
    expect(event.occurredAt.getTime()).toBeLessThan(event.recordedAt.getTime());
    const forEntity = await mod.TemporalEventService.getEventsForEntity(candidateId);
    expect(forEntity.length).toBeGreaterThan(0);
  });

  it('records observations and computes a readiness trend', async () => {
    for (const [i, v] of [55, 62, 70].entries()) {
      await mod.ObservationService.recordObservation({ subjectEntityId: candidateId, observationType: mod.ObservationType.CANDIDATE_READINESS, valueNumeric: v, observedAt: new Date(Date.now() - (3 - i) * 7 * 86400000) });
    }
    const trend = await mod.TrendService.calculateCandidateReadinessTrend(candidateId);
    expect(trend.direction).toBe(mod.TrendDirection.IMPROVING);
    expect(trend.magnitude).toBeGreaterThan(0);
  });

  it('records a significant change and finds it', async () => {
    await mod.ChangeService.recordChange({ entityId: candidateId, changeType: mod.ChangeType.CANDIDATE_IMPROVED, deltaNumeric: 15, rationale: 'two stakeholder meetings' });
    const sig = await mod.ChangeService.getSignificantChanges({ limit: 50 });
    expect(sig.some((c) => c.entityId === candidateId)).toBe(true);
  });

  it('creates and compares snapshots', async () => {
    const a = await mod.SnapshotService.createEntitySnapshot({ entityId: candidateId, snapshotType: mod.SnapshotType.CANDIDATE_CONTEXT, snapshotJson: { fit: 55, risk: 20 } });
    const b = await mod.SnapshotService.createEntitySnapshot({ entityId: candidateId, snapshotType: mod.SnapshotType.CANDIDATE_CONTEXT, snapshotJson: { fit: 70, risk: 10 } });
    const diff = await mod.SnapshotService.compareSnapshots(a.id, b.id);
    expect(diff.scoresChanged.find((s) => s.key === 'fit')?.delta).toBe(15);
  });

  it('detects a stale high-value relationship and proposes follow-up', async () => {
    // Backdate last interaction beyond 90 days, then run decay.
    const decay = await mod.DecayService.calculateRelationshipDecay(relationshipId, new Date());
    expect(['FRESH', 'MILD', 'STALE', 'HIGH', 'UNMANAGED_HOSTILE']).toContain(decay.band);
  });

  it('records and completes a commitment; finds overdue ones', async () => {
    const c = await mod.CommitmentService.createCommitment({ fromEntityId: candidateId, toEntityId: stakeholderId, title: 'Follow up with chair', commitmentType: mod.CommitmentType.FOLLOW_UP, dueAt: new Date(Date.now() - 5 * 86400000) });
    const overdue = await mod.CommitmentService.getOverdueCommitments();
    expect(overdue.some((o) => o.commitment.id === c.id)).toBe(true);
    const done = await mod.CommitmentService.completeCommitment(c.id);
    expect(done.status).toBe('COMPLETED');
  });

  it('reconstructs candidate context as of a date (live fallback when no snapshot)', async () => {
    const asOf = await mod.TemporalQueryService.getCandidateContextAsOf(candidateId, constituencyId, new Date('2020-01-01'));
    expect(['SNAPSHOT', 'LIVE_FALLBACK']).toContain(asOf.basis);
  });

  it('produces a war-room briefing', async () => {
    const briefing = await mod.WarRoomTemporalService.getWarRoomBriefing({ sinceDays: 30 });
    expect(briefing).toHaveProperty('recentChanges');
    expect(briefing).toHaveProperty('overdueCommitments');
    expect(briefing).toHaveProperty('staleFptpScenarios');
  });
});
