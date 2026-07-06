// =============================================================================
// fptp-temporal.service.ts — FPTP scenario reproducibility + staleness (§8.1)
// -----------------------------------------------------------------------------
// Snapshots the FPTP context when a scenario is generated, then detects whether
// the scenario has gone stale by comparing the snapshot's inputs with current
// context using the fptpStaleness rule.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { FPTPContextService } from '../ontology/fptp-context.service.js';
import { SnapshotService } from './snapshot.service.js';
import { ChangeService } from './change.service.js';
import { TimelineService } from './timeline.service.js';
import { fptpStaleness, FPTP_MATERIAL_SCORE_DELTA } from './rules.js';
import { ChangeType, SnapshotType } from './enums.js';
import type { ActorContext, FPTPStalenessResult, UUID } from './types.js';

function num(x: unknown): number | undefined {
  return typeof x === 'number' ? x : undefined;
}

export const FPTPTemporalService = {
  async createFPTPScenarioSnapshot(fptpScenarioId: UUID, actor?: ActorContext) {
    const scenario = await prisma.fPTPScenario.findUnique({ where: { id: fptpScenarioId } });
    if (!scenario) throw new Error('FPTPScenario not found');
    const ctx = await FPTPContextService.getFPTPContext(scenario.constituencyEntityId, scenario.candidateEntityId ?? undefined);
    return SnapshotService.createEntitySnapshot(
      {
        entityId: scenario.constituencyEntityId,
        snapshotType: SnapshotType.FPTP_CONTEXT,
        snapshotJson: { fptpScenarioId, scenario, context: ctx } as never,
        sourceModule: 'fptp',
        summary: `FPTP scenario ${fptpScenarioId} context snapshot`,
      },
      actor,
    );
  },

  async getFPTPScenarioTimeline(fptpScenarioId: UUID) {
    const scenario = await prisma.fPTPScenario.findUnique({ where: { id: fptpScenarioId } });
    if (!scenario) return [];
    return TimelineService.getTimelineForConstituency(scenario.constituencyEntityId);
  },

  async getFPTPContextAsOfScenario(fptpScenarioId: UUID) {
    const snap = await prisma.entitySnapshot.findFirst({
      where: { snapshotType: SnapshotType.FPTP_CONTEXT },
      orderBy: { snapshotAt: 'desc' },
    });
    // find the snapshot that references this scenario id
    const snaps = await prisma.entitySnapshot.findMany({ where: { snapshotType: SnapshotType.FPTP_CONTEXT }, orderBy: { snapshotAt: 'desc' }, take: 100 });
    const match = snaps.find((s) => (s.snapshotJson as { fptpScenarioId?: string } | null)?.fptpScenarioId === fptpScenarioId) ?? snap;
    return match?.snapshotJson ?? null;
  },

  async getFPTPRecommendationChanges(constituencyEntityId: UUID, candidateEntityId?: UUID) {
    const scenarios = await prisma.fPTPScenario.findMany({ where: { constituencyEntityId, ...(candidateEntityId ? { candidateEntityId } : {}) } });
    const ids = scenarios.map((s) => s.id);
    return prisma.temporalChange.findMany({ where: { fptpScenarioId: { in: ids }, changeType: ChangeType.FPTP_RECOMMENDATION_CHANGED }, orderBy: { changedAt: 'desc' } });
  },

  /**
   * Compare the scenario-creation snapshot inputs with current context and
   * decide staleness via the pure rule. (§8.2 / §17.4)
   */
  async recheckFPTPScenarioIfContextChanged(fptpScenarioId: UUID): Promise<FPTPStalenessResult> {
    const scenario = await prisma.fPTPScenario.findUnique({ where: { id: fptpScenarioId } });
    if (!scenario) throw new Error('FPTPScenario not found');
    const snapshotJson = (await this.getFPTPContextAsOfScenario(fptpScenarioId)) as { context?: Record<string, unknown> } | null;
    const before = snapshotJson?.context ?? {};
    const now = await FPTPContextService.getFPTPContext(scenario.constituencyEntityId, scenario.candidateEntityId ?? undefined);

    const pick = (ctx: Record<string, unknown> | unknown, key: string) => num((ctx as Record<string, unknown>)?.[key]);
    const delta = (key: string) => {
      const a = pick(before, key);
      const b = pick(now as unknown, key);
      return a != null && b != null ? b - a : undefined;
    };

    return fptpStaleness({
      fptpScenarioId,
      deltas: {
        candidateSeatFit: delta('candidateSeatFit'),
        candidateRisk: delta('candidateRisk'),
        localAssociationSupport: delta('localAssociationSupport'),
        stakeholderCoverage: delta('stakeholderCoverage'),
        constituencyCompetitiveness: delta('competitiveness'),
        tacticalVotingRisk: delta('tacticalVotingRisk'),
        spoilerRisk: delta('spoilerRisk'),
        localPartyStrength: delta('localPartyStrength'),
      },
    });
  },

  async detectStaleFPTPScenarios(filters: { limit?: number } = {}) {
    const scenarios = await prisma.fPTPScenario.findMany({ orderBy: { createdAt: 'desc' }, take: filters.limit ?? 100 });
    const out: FPTPStalenessResult[] = [];
    for (const s of scenarios) {
      const result = await this.recheckFPTPScenarioIfContextChanged(s.id).catch(() => null);
      if (result?.stale) out.push(result);
    }
    return out;
  },

  async getFPTPContextChangesSinceScenario(fptpScenarioId: UUID) {
    const scenario = await prisma.fPTPScenario.findUnique({ where: { id: fptpScenarioId } });
    if (!scenario) return [];
    return prisma.temporalChange.findMany({ where: { entityId: scenario.constituencyEntityId, changedAt: { gte: scenario.createdAt } }, orderBy: { changedAt: 'desc' } });
  },

  /** Materiality helper exposed for callers/tests. */
  isMaterial(delta: number) {
    return Math.abs(delta) >= FPTP_MATERIAL_SCORE_DELTA;
  },
};
