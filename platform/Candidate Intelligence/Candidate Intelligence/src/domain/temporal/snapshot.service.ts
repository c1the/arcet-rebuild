// =============================================================================
// snapshot.service.ts — reproducible "as-of" context snapshots (§6.3)
// -----------------------------------------------------------------------------
// Uses the ontology context services to capture exactly what the system knew
// at a point in time (candidate-seat, FPTP, constituency, policy radius, war
// room). Snapshots make recommendations auditable and reproducible.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { CandidateContextService } from '../ontology/candidate-context.service.js';
import { FPTPContextService } from '../ontology/fptp-context.service.js';
import { ConstituencyContextService } from '../ontology/constituency-context.service.js';
import { PolicyRadiusContextService } from '../ontology/policy-radius-context.service.js';
import { WarRoomService } from '../ontology/ontology.service.js';
import { createSnapshotSchema } from './validators.js';
import { SnapshotType } from './enums.js';
import type { ActorContext, CreateSnapshotInput, SnapshotDiff, UUID } from './types.js';

const MODEL_VERSION = '0.1.0';

export const SnapshotService = {
  async createEntitySnapshot(input: CreateSnapshotInput, actor?: ActorContext) {
    const data = createSnapshotSchema.parse(input);
    return prisma.entitySnapshot.create({
      data: {
        entityId: data.entityId,
        snapshotType: data.snapshotType,
        snapshotAt: data.snapshotAt ?? new Date(),
        snapshotJson: data.snapshotJson as never,
        sourceModule: data.sourceModule,
        modelVersion: data.modelVersion ?? MODEL_VERSION,
        summary: data.summary,
        createdByUserId: actor?.userId,
      },
    });
  },

  async createCandidateContextSnapshot(candidateEntityId: UUID, constituencyEntityId: UUID, actor?: ActorContext) {
    const ctx = await CandidateContextService.getCandidateSeatContext(candidateEntityId, constituencyEntityId);
    return this.createEntitySnapshot(
      { entityId: candidateEntityId, snapshotType: SnapshotType.CANDIDATE_CONTEXT, snapshotJson: ctx as never, sourceModule: 'candidate-selection', summary: `Candidate context for seat ${constituencyEntityId}` },
      actor,
    );
  },

  async createFPTPContextSnapshot(constituencyEntityId: UUID, candidateEntityId?: UUID, actor?: ActorContext) {
    const ctx = await FPTPContextService.getFPTPContext(constituencyEntityId, candidateEntityId);
    return this.createEntitySnapshot(
      { entityId: constituencyEntityId, snapshotType: SnapshotType.FPTP_CONTEXT, snapshotJson: ctx as never, sourceModule: 'fptp', summary: `FPTP context for ${constituencyEntityId}` },
      actor,
    );
  },

  async createConstituencyContextSnapshot(constituencyEntityId: UUID, actor?: ActorContext) {
    const ctx = await ConstituencyContextService.getConstituencyContext(constituencyEntityId);
    return this.createEntitySnapshot(
      { entityId: constituencyEntityId, snapshotType: SnapshotType.CONSTITUENCY_CONTEXT, snapshotJson: ctx as never, sourceModule: 'ontology' },
      actor,
    );
  },

  async createPolicyRadiusSnapshot(policyEntityId: UUID, actor?: ActorContext) {
    const ctx = await PolicyRadiusContextService.getPolicyContext(policyEntityId);
    return this.createEntitySnapshot(
      { entityId: policyEntityId, snapshotType: SnapshotType.POLICY_RADIUS_CONTEXT, snapshotJson: ctx as never, sourceModule: 'policy' },
      actor,
    );
  },

  async createWarRoomSnapshot(filters: { limit?: number } = {}, actor?: ActorContext) {
    const summary = await WarRoomService.getSummary(filters);
    // war-room snapshot is system-wide; key it on a synthetic entity id of 'WAR_ROOM'.
    return this.createEntitySnapshot(
      { entityId: 'WAR_ROOM', snapshotType: SnapshotType.WAR_ROOM_CONTEXT, snapshotJson: summary as never, sourceModule: 'war-room' },
      actor,
    );
  },

  async getSnapshot(snapshotId: UUID) {
    return prisma.entitySnapshot.findUnique({ where: { id: snapshotId } });
  },

  async getLatestSnapshot(entityId: UUID, snapshotType: SnapshotType) {
    return prisma.entitySnapshot.findFirst({ where: { entityId, snapshotType }, orderBy: { snapshotAt: 'desc' } });
  },

  async getSnapshotsForEntity(entityId: UUID, filters: { snapshotType?: SnapshotType; limit?: number } = {}) {
    return prisma.entitySnapshot.findMany({
      where: { entityId, ...(filters.snapshotType ? { snapshotType: filters.snapshotType } : {}) },
      orderBy: { snapshotAt: 'desc' },
      take: filters.limit ?? 50,
    });
  },

  async compareSnapshots(snapshotIdA: UUID, snapshotIdB: UUID): Promise<SnapshotDiff> {
    const [a, b] = await Promise.all([this.getSnapshot(snapshotIdA), this.getSnapshot(snapshotIdB)]);
    if (!a || !b) throw new Error('Snapshot not found');
    return diffJson(a.snapshotJson as unknown, b.snapshotJson as unknown);
  },
};

/** Shallow-ish recursive diff of two snapshot JSON blobs into a SnapshotDiff. */
export function diffJson(before: unknown, after: unknown): SnapshotDiff {
  const fieldsChanged: SnapshotDiff['fieldsChanged'] = [];
  const scoresChanged: SnapshotDiff['scoresChanged'] = [];
  const added: string[] = [];
  const removed: string[] = [];

  function walk(pre: unknown, post: unknown, path: string) {
    const isObj = (x: unknown) => x !== null && typeof x === 'object' && !Array.isArray(x);
    if (isObj(pre) && isObj(post)) {
      const keys = new Set([...Object.keys(pre as object), ...Object.keys(post as object)]);
      for (const k of keys) {
        const p = (pre as Record<string, unknown>)[k];
        const q = (post as Record<string, unknown>)[k];
        const child = path ? `${path}.${k}` : k;
        if (!(k in (pre as object))) added.push(child);
        else if (!(k in (post as object))) removed.push(child);
        else walk(p, q, child);
      }
      return;
    }
    if (pre !== post) {
      if (typeof pre === 'number' && typeof post === 'number') {
        scoresChanged.push({ key: path, before: pre, after: post, delta: post - pre });
      } else {
        fieldsChanged.push({ field: path, before: (pre ?? null) as never, after: (post ?? null) as never });
      }
    }
  }
  walk(before, after, '');
  const summary = `${fieldsChanged.length} field(s), ${scoresChanged.length} score(s) changed; ${added.length} added, ${removed.length} removed.`;
  return { fieldsChanged, scoresChanged, added, removed, summary };
}
