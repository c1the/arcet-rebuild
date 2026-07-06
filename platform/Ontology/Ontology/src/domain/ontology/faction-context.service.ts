// =============================================================================
// faction-context.service.ts — faction-risk modelling (§15.7)
// =============================================================================
import { prisma } from './db.js';
import { AuditService } from './audit.service.js';
import { RiskService } from './risk.service.js';
import { factionRules } from './rules.js';
import {
  Attitude,
  InfluenceLevel,
  RelationshipType,
  RiskType,
  RiskLinkRole,
} from './enums.js';
import type { ActorContext, FactionRiskResult, UUID } from './types.js';

const HOSTILE_ATTITUDES: string[] = [Attitude.HOSTILE, Attitude.SCEPTICAL];
const HIGH_INFLUENCE: string[] = [InfluenceLevel.HIGH, InfluenceLevel.CRITICAL];

export const FactionContextService = {
  /** All factions linked into the neighbourhood of a context entity. */
  async getFactionMap(contextEntityId: UUID) {
    const rels = await prisma.relationship.findMany({
      where: {
        OR: [{ sourceEntityId: contextEntityId }, { targetEntityId: contextEntityId }],
        type: { in: [RelationshipType.MEMBER_OF_FACTION, RelationshipType.LEANING_TOWARD_FACTION] },
        isCurrent: true,
      },
    });
    const factionIds = [...new Set(rels.map((r) => (r.sourceEntityId === contextEntityId ? r.targetEntityId : r.sourceEntityId)))];
    const factions = factionIds.length ? await prisma.factionProfile.findMany({ where: { entityId: { in: factionIds } } }) : [];
    return factions;
  },

  async getPersonsByFaction(factionEntityId: UUID) {
    const rels = await prisma.relationship.findMany({
      where: { targetEntityId: factionEntityId, type: { in: [RelationshipType.MEMBER_OF_FACTION, RelationshipType.LEANING_TOWARD_FACTION] }, isCurrent: true },
      orderBy: { influenceLevel: 'desc' },
    });
    const ids = [...new Set(rels.map((r) => r.sourceEntityId))];
    const entities = ids.length ? await prisma.entity.findMany({ where: { id: { in: ids } } }) : [];
    const byId = new Map(entities.map((e) => [e.id, e]));
    return rels.map((r) => ({ entity: byId.get(r.sourceEntityId) ?? null, attitude: r.attitude, influenceLevel: r.influenceLevel }));
  },

  async getFactionBrokers(factionEntityId: UUID) {
    const rels = await prisma.relationship.findMany({
      where: { targetEntityId: factionEntityId, type: RelationshipType.BROKER_FOR, isCurrent: true },
    });
    const ids = [...new Set(rels.map((r) => r.sourceEntityId))];
    return ids.length ? prisma.entity.findMany({ where: { id: { in: ids } } }) : [];
  },

  /** Count hostile, high-influence faction members opposing a subject. */
  async _hostileHighInfluenceFor(subjectEntityId: UUID, factionEntityId: UUID) {
    const members = await this.getPersonsByFaction(factionEntityId);
    return members.filter((m) => HOSTILE_ATTITUDES.includes(m.attitude) && HIGH_INFLUENCE.includes(m.influenceLevel)).length;
  },

  async getFactionRiskForCandidate(candidateEntityId: UUID, _constituencyEntityId?: UUID): Promise<FactionRiskResult[]> {
    const factions = await this.getFactionMap(candidateEntityId);
    const out: FactionRiskResult[] = [];
    for (const f of factions) {
      const hostile = await this._hostileHighInfluenceFor(candidateEntityId, f.entityId);
      out.push({
        subjectEntityId: candidateEntityId,
        factionEntityId: f.entityId,
        factionName: f.name,
        riskLevel: hostile > 1 ? InfluenceLevel.HIGH : hostile === 1 ? InfluenceLevel.MEDIUM : InfluenceLevel.LOW,
        rationale: `${hostile} hostile high-influence member(s) in ${f.name}.`,
      });
    }
    return out;
  },

  async getFactionRiskForPolicy(policyEntityId: UUID): Promise<FactionRiskResult[]> {
    const policy = await prisma.policyProfile.findFirst({ where: { entityId: policyEntityId } });
    if (!policy) return [];
    // factions sensitive to any of the policy's issues
    const issueIds = policy.issueEntityIds;
    if (!issueIds.length) return [];
    const issueRels = await prisma.relationship.findMany({
      where: { sourceEntityId: { in: issueIds }, type: RelationshipType.ASSOCIATED_WITH_ISSUE, isCurrent: true },
    });
    const factionIds = [...new Set(issueRels.map((r) => r.targetEntityId))];
    const factions = factionIds.length ? await prisma.factionProfile.findMany({ where: { entityId: { in: factionIds } } }) : [];
    return factions.map((f) => ({
      subjectEntityId: policyEntityId,
      factionEntityId: f.entityId,
      factionName: f.name,
      riskLevel: f.currentMood === 'HOSTILE' ? InfluenceLevel.HIGH : f.currentMood === 'AGITATED' ? InfluenceLevel.MEDIUM : InfluenceLevel.LOW,
      rationale: `Policy touches an issue linked to ${f.name} (mood: ${f.currentMood}).`,
    }));
  },

  /** Persist a faction risk (and broker-consult action) for a candidate. */
  async saveFactionRisk(subjectEntityId: UUID, factionEntityId: UUID, actor?: ActorContext) {
    const faction = await prisma.factionProfile.findFirstOrThrow({ where: { entityId: factionEntityId } });
    const hostile = await this._hostileHighInfluenceFor(subjectEntityId, factionEntityId);
    const out = factionRules({ subjectEntityId, factionEntityId, factionName: faction.name, hostileHighInfluenceMembers: hostile });
    const risks = [];
    for (const r of out.risks) {
      risks.push(
        await RiskService.createRisk(
          { riskType: RiskType.FACTION_RISK, title: r.title, severity: r.severity, likelihood: r.likelihood, urgency: r.urgency, rationale: `[${r.rule}] ${r.rationale}`, sourceModule: 'faction-risk', links: r.links },
          actor,
        ),
      );
    }
    await AuditService.record({ action: 'faction.saveRisk', objectType: 'FactionProfile', objectId: factionEntityId, entityId: subjectEntityId, actor });
    return { risks, hostileHighInfluenceMembers: hostile };
  },

  _enums: { RiskLinkRole },
};
