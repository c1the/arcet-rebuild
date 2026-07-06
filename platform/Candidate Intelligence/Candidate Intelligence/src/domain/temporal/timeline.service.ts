// =============================================================================
// timeline.service.ts — unified, computed timeline (§6.2)
// -----------------------------------------------------------------------------
// MVP computes timeline items dynamically from temporal events, changes, risks,
// actions, commitments and scores. Can be materialised into TimelineItem later
// if performance requires it.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { TemporalEventService } from './temporal-event.service.js';
import { ChangeService } from './change.service.js';
import { CommitmentService } from './commitment.service.js';
import { TimelineItemType } from './enums.js';
import type { TimelineFilters, TimelineItem, UUID } from './types.js';

export const TimelineService = {
  async getTimelineForEntity(entityId: UUID, filters: TimelineFilters = {}): Promise<TimelineItem[]> {
    const since = filters.startDate;
    const [events, changes, riskLinks, actions, commitments, scores] = await Promise.all([
      TemporalEventService.getEventsForEntity(entityId, { startDate: filters.startDate, endDate: filters.endDate, limit: filters.limit }),
      ChangeService.getChangesForEntity(entityId, { startDate: filters.startDate, endDate: filters.endDate, limit: filters.limit }),
      prisma.riskLink.findMany({ where: { entityId }, include: { risk: true } }),
      prisma.actionRecommendation.findMany({ where: { targetEntityId: entityId }, orderBy: { createdAt: 'desc' }, take: filters.limit ?? 100 }),
      CommitmentService.getCommitmentsForEntity(entityId),
      prisma.score.findMany({ where: { subjectEntityId: entityId }, orderBy: { createdAt: 'desc' }, take: filters.limit ?? 100 }),
    ]);

    const items: TimelineItem[] = [];
    for (const e of events) items.push({ itemType: TimelineItemType.EVENT, itemAt: e.occurredAt, title: e.title, summary: e.summary ?? undefined, sourceObjectType: 'TemporalEvent', sourceObjectId: e.id, confidence: e.confidence as never, visibility: e.visibility as never });
    for (const c of changes) items.push({ itemType: TimelineItemType.CHANGE, itemAt: c.changedAt, title: c.changeType, summary: c.rationale ?? undefined, sourceObjectType: 'TemporalChange', sourceObjectId: c.id, confidence: c.confidence as never });
    for (const rl of riskLinks) if (rl.risk) items.push({ itemType: TimelineItemType.RISK, itemAt: rl.risk.createdAt, title: rl.risk.title, summary: rl.risk.rationale ?? undefined, sourceObjectType: 'Risk', sourceObjectId: rl.risk.id, severity: rl.risk.severity as never, confidence: rl.risk.confidence as never });
    for (const a of actions) items.push({ itemType: TimelineItemType.ACTION, itemAt: a.createdAt, title: a.title, summary: a.rationale ?? undefined, sourceObjectType: 'ActionRecommendation', sourceObjectId: a.id });
    for (const c of commitments) items.push({ itemType: TimelineItemType.COMMITMENT, itemAt: c.promisedAt ?? c.createdAt, title: c.title, summary: c.description ?? undefined, sourceObjectType: 'Commitment', sourceObjectId: c.id, visibility: c.visibility as never });
    for (const s of scores) items.push({ itemType: TimelineItemType.SCORE, itemAt: s.createdAt, title: `${s.scoreType} = ${s.value}`, summary: s.rationale ?? undefined, sourceObjectType: 'Score', sourceObjectId: s.id, confidence: s.confidence as never });

    let filtered = items;
    if (since) filtered = filtered.filter((i) => i.itemAt >= since);
    if (filters.endDate) filtered = filtered.filter((i) => i.itemAt <= (filters.endDate as Date));
    if (filters.itemTypes?.length) filtered = filtered.filter((i) => filters.itemTypes!.includes(i.itemType));
    filtered.sort((a, b) => b.itemAt.getTime() - a.itemAt.getTime());
    return filtered.slice(0, filters.limit ?? 200);
  },

  async getTimelineForCandidate(candidateEntityId: UUID, filters: TimelineFilters = {}) {
    return this.getTimelineForEntity(candidateEntityId, filters);
  },
  async getTimelineForConstituency(constituencyEntityId: UUID, filters: TimelineFilters = {}) {
    return this.getTimelineForEntity(constituencyEntityId, filters);
  },
  async getTimelineForRelationship(relationshipId: UUID, filters: TimelineFilters = {}): Promise<TimelineItem[]> {
    const [events, states] = await Promise.all([
      prisma.temporalEvent.findMany({ where: { metadata: { path: ['relationshipId'], equals: relationshipId } as never }, orderBy: { occurredAt: 'desc' }, take: filters.limit ?? 100 }).catch(() => []),
      prisma.relationshipTemporalState.findMany({ where: { relationshipId }, orderBy: { observedAt: 'desc' }, take: filters.limit ?? 100 }),
    ]);
    const items: TimelineItem[] = [];
    for (const e of events as { id: string; occurredAt: Date; title: string }[]) items.push({ itemType: TimelineItemType.EVENT, itemAt: e.occurredAt, title: e.title, sourceObjectType: 'TemporalEvent', sourceObjectId: e.id });
    for (const s of states) items.push({ itemType: TimelineItemType.OBSERVATION, itemAt: s.observedAt, title: `strength=${s.strength ?? '-'} staleness=${s.stalenessScore ?? '-'}`, summary: s.rationale ?? undefined, sourceObjectType: 'RelationshipTemporalState', sourceObjectId: s.id });
    items.sort((a, b) => b.itemAt.getTime() - a.itemAt.getTime());
    return items.slice(0, filters.limit ?? 200);
  },
  async getTimelineForIssue(issueEntityId: UUID, filters: TimelineFilters = {}) {
    return this.getTimelineForEntity(issueEntityId, filters);
  },
  async getTimelineForFaction(factionEntityId: UUID, filters: TimelineFilters = {}) {
    return this.getTimelineForEntity(factionEntityId, filters);
  },
  async getTimelineForPolicy(policyEntityId: UUID, filters: TimelineFilters = {}) {
    return this.getTimelineForEntity(policyEntityId, filters);
  },

  async getTimelineItemsSince(date: Date, filters: TimelineFilters = {}): Promise<TimelineItem[]> {
    const [events, changes] = await Promise.all([
      TemporalEventService.getEventsSince(date, { limit: filters.limit }),
      ChangeService.getChangesSince(date, { limit: filters.limit, significantOnly: true }),
    ]);
    const items: TimelineItem[] = [];
    for (const e of events) items.push({ itemType: TimelineItemType.EVENT, itemAt: e.occurredAt, title: e.title, sourceObjectType: 'TemporalEvent', sourceObjectId: e.id });
    for (const c of changes) items.push({ itemType: TimelineItemType.CHANGE, itemAt: c.changedAt, title: c.changeType, summary: c.rationale ?? undefined, sourceObjectType: 'TemporalChange', sourceObjectId: c.id });
    items.sort((a, b) => b.itemAt.getTime() - a.itemAt.getTime());
    return items.slice(0, filters.limit ?? 200);
  },
};
