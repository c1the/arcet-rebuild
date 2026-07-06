// =============================================================================
// temporal-query.service.ts — "as of date" reconstruction (§6.8)
// -----------------------------------------------------------------------------
// As-of queries are essential for reproducibility: FPTP scenarios and candidate
// selection decisions must be reconstructable. Strategy: take the latest
// snapshot at-or-before the as-of date as the base state, then report the
// changes/observations recorded up to that date. Current ontology context is
// returned as the live fallback when no snapshot exists, clearly flagged.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { CandidateContextService } from '../ontology/candidate-context.service.js';
import { ConstituencyContextService } from '../ontology/constituency-context.service.js';
import { FPTPContextService } from '../ontology/fptp-context.service.js';
import { FactionContextService } from '../ontology/faction-context.service.js';
import { PolicyRadiusContextService } from '../ontology/policy-radius-context.service.js';
import { SnapshotType } from './enums.js';
import type { ChangeFilters, UUID } from './types.js';

interface AsOfResult<T> {
  asOf: Date;
  basis: 'SNAPSHOT' | 'LIVE_FALLBACK';
  snapshotId: string | null;
  snapshotAt: Date | null;
  state: T;
  changesSince: unknown[]; // changes recorded between the snapshot and the as-of date
}

export const TemporalQueryService = {
  async _asOfFromSnapshot<T>(entityId: UUID, snapshotType: SnapshotType, asOfDate: Date, liveFallback: () => Promise<T>): Promise<AsOfResult<T>> {
    const snap = await prisma.entitySnapshot.findFirst({
      where: { entityId, snapshotType, snapshotAt: { lte: asOfDate } },
      orderBy: { snapshotAt: 'desc' },
    });
    const changesSince = await prisma.temporalChange.findMany({
      where: { entityId, changedAt: { gte: snap?.snapshotAt ?? new Date(0), lte: asOfDate } },
      orderBy: { changedAt: 'asc' },
    });
    if (snap) {
      return { asOf: asOfDate, basis: 'SNAPSHOT', snapshotId: snap.id, snapshotAt: snap.snapshotAt, state: snap.snapshotJson as T, changesSince };
    }
    return { asOf: asOfDate, basis: 'LIVE_FALLBACK', snapshotId: null, snapshotAt: null, state: await liveFallback(), changesSince };
  },

  async getEntityAsOf(entityId: UUID, asOfDate: Date) {
    return this._asOfFromSnapshot(entityId, SnapshotType.ENTITY_PROFILE, asOfDate, async () => {
      const entity = await prisma.entity.findUnique({ where: { id: entityId } });
      return entity as unknown;
    });
  },

  async getRelationshipAsOf(relationshipId: UUID, asOfDate: Date) {
    const state = await prisma.relationshipTemporalState.findFirst({
      where: { relationshipId, observedAt: { lte: asOfDate } },
      orderBy: { observedAt: 'desc' },
    });
    const live = state ? null : await prisma.relationship.findUnique({ where: { id: relationshipId } });
    return { asOf: asOfDate, basis: state ? 'TEMPORAL_STATE' : 'LIVE_FALLBACK', state: state ?? live };
  },

  async getCandidateContextAsOf(candidateEntityId: UUID, constituencyEntityId: UUID, asOfDate: Date) {
    return this._asOfFromSnapshot(candidateEntityId, SnapshotType.CANDIDATE_CONTEXT, asOfDate, () =>
      CandidateContextService.getCandidateSeatContext(candidateEntityId, constituencyEntityId) as Promise<unknown>,
    );
  },

  async getConstituencyContextAsOf(constituencyEntityId: UUID, asOfDate: Date) {
    return this._asOfFromSnapshot(constituencyEntityId, SnapshotType.CONSTITUENCY_CONTEXT, asOfDate, () =>
      ConstituencyContextService.getConstituencyContext(constituencyEntityId) as Promise<unknown>,
    );
  },

  async getFactionContextAsOf(factionEntityId: UUID, asOfDate: Date) {
    return this._asOfFromSnapshot(factionEntityId, SnapshotType.FACTION_CONTEXT, asOfDate, () =>
      FactionContextService.getFactionMap(factionEntityId) as Promise<unknown>,
    );
  },

  async getPolicyContextAsOf(policyEntityId: UUID, asOfDate: Date) {
    return this._asOfFromSnapshot(policyEntityId, SnapshotType.POLICY_RADIUS_CONTEXT, asOfDate, () =>
      PolicyRadiusContextService.getPolicyContext(policyEntityId) as Promise<unknown>,
    );
  },

  async getFPTPContextAsOf(constituencyEntityId: UUID, candidateEntityId: UUID | undefined, asOfDate: Date) {
    return this._asOfFromSnapshot(constituencyEntityId, SnapshotType.FPTP_CONTEXT, asOfDate, () =>
      FPTPContextService.getFPTPContext(constituencyEntityId, candidateEntityId) as Promise<unknown>,
    );
  },

  async getChangesBetween(entityId: UUID, startDate: Date, endDate: Date) {
    return prisma.temporalChange.findMany({ where: { entityId, changedAt: { gte: startDate, lte: endDate } }, orderBy: { changedAt: 'asc' } });
  },

  async getWhatChangedSince(entityId: UUID, sinceDate: Date) {
    const changes = await prisma.temporalChange.findMany({ where: { entityId, changedAt: { gte: sinceDate } }, orderBy: { changedAt: 'desc' } });
    return { entityId, since: sinceDate, changes, significant: changes.filter((c) => c.significant) };
  },

  async getSystemWideChangesSince(sinceDate: Date, filters: ChangeFilters = {}) {
    return prisma.temporalChange.findMany({
      where: { changedAt: { gte: sinceDate }, ...(filters.significantOnly ? { significant: true } : {}), ...(filters.sourceModule ? { sourceModule: filters.sourceModule } : {}) },
      orderBy: { changedAt: 'desc' },
      take: filters.limit ?? 500,
    });
  },
};
