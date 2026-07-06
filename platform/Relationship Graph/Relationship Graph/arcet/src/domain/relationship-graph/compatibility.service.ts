// =============================================================================
// compatibility.service.ts — cross-module relationship inputs (§9–§12)
// -----------------------------------------------------------------------------
// Aggregate relationship signals consumed by Candidate Intelligence, the FPTP
// simulator, faction-risk, and policy radius. Reuses ontology + temporal data.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { RelationshipService } from '../ontology/relationship.service.js';
import { Attitude, Confidence, InfluenceLevel } from '../ontology/enums.js';
import { RelationshipGapService } from './gap.service.js';
import { AccessPathService } from './access-path.service.js';
import type { CandidateRelationshipAggregate, UUID } from './types.js';

const HOSTILE = new Set([Attitude.HOSTILE, Attitude.SCEPTICAL]);
const HIGH_INF = new Set([InfluenceLevel.HIGH, InfluenceLevel.CRITICAL]);
const STALE = 90 * 86400000;

export const RelationshipCompatibilityService = {
  /** §9.1 — aggregate candidate relationship signals feeding CandidateSeatAssessment. */
  async getCandidateRelationshipAggregate(candidateEntityId: UUID, constituencyEntityId?: UUID): Promise<CandidateRelationshipAggregate> {
    const rels = await RelationshipService.getRelationshipsForEntity(candidateEntityId);
    const highInfluence = rels.filter((r) => HIGH_INF.has(r.influenceLevel as never));
    const covered = highInfluence.filter((r) => !HOSTILE.has(r.attitude as never));
    const staleHighValue = rels.filter((r) => (r.strength ?? 0) >= 4 && r.lastInteractionAt && Date.now() - new Date(r.lastInteractionAt).getTime() > STALE);
    const hostile = rels.filter((r) => HOSTILE.has(r.attitude as never));
    const localAssoc = rels.filter((r) => (r.type as string) === 'MEMBER_OF_FACTION' ? false : (r.type as string)?.includes('ASSOCIATION') || (r.type as string) === 'MATTERS_TO_CONSTITUENCY');
    const factionLinks = rels.filter((r) => (r.type as string) === 'MEMBER_OF_FACTION' || (r.type as string) === 'LEANING_TOWARD_FACTION');
    const media = rels.filter((r) => (r.type as string) === 'REPRESENTS');

    const coverageRatio = highInfluence.length ? covered.length / highInfluence.length : 0;
    const gaps = constituencyEntityId ? await RelationshipGapService.detectCandidateRelationshipGaps(candidateEntityId, constituencyEntityId, false) : [];

    return {
      candidateEntityId,
      constituencyEntityId,
      stakeholderCoverageScore: Math.round(coverageRatio * 100),
      localAssociationSupportScore: Math.round(Math.min(100, localAssoc.reduce((s, r) => s + (r.strength ?? 0) * 20, 0) / Math.max(localAssoc.length, 1))),
      factionAcceptabilitySignal: factionLinks.some((r) => HOSTILE.has(r.attitude as never)) ? 35 : 65,
      localConnectionSignal: Math.round(Math.min(100, rels.length * 8)),
      mediaRelationshipSignal: Math.round(Math.min(100, media.length * 25)),
      staleHighValueCount: staleHighValue.length,
      hostileCount: hostile.length,
      openCommitmentCount: rels.reduce((s, r) => s + (r.openCommitmentCount ?? 0), 0),
      gaps,
      confidence: rels.length >= 5 ? Confidence.MEDIUM : Confidence.LOW,
      missingData: rels.length === 0 ? ['no relationships mapped for candidate'] : [],
    };
  },

  /** §10.1 — relationship inputs for the FPTP simulator. */
  async getRelationshipInputsForFPTP(constituencyEntityId: UUID, candidateEntityId?: UUID) {
    const constituencyRels = await RelationshipService.getRelationshipsForEntity(constituencyEntityId);
    const keyStakeholders = constituencyRels.filter((r) => HIGH_INF.has(r.influenceLevel as never));
    const hostileLocal = constituencyRels.filter((r) => HOSTILE.has(r.attitude as never));
    const staleHighValue = constituencyRels.filter((r) => (r.strength ?? 0) >= 4 && r.lastInteractionAt && Date.now() - new Date(r.lastInteractionAt).getTime() > STALE);
    const candidateAgg = candidateEntityId ? await this.getCandidateRelationshipAggregate(candidateEntityId, constituencyEntityId) : null;
    const localStakeholderSupport = keyStakeholders.length ? Math.round((keyStakeholders.filter((r) => !HOSTILE.has(r.attitude as never)).length / keyStakeholders.length) * 100) : 0;
    return {
      constituencyEntityId,
      candidateEntityId,
      keyStakeholders: keyStakeholders.map((r) => r.targetEntityId),
      candidateCoverage: candidateAgg?.stakeholderCoverageScore ?? null,
      hostileLocalActors: hostileLocal.map((r) => r.targetEntityId),
      staleHighValueCount: staleHighValue.length,
      localStakeholderSupportScore: localStakeholderSupport,
      relationshipRiskScore: Math.min(100, hostileLocal.length * 15 + staleHighValue.length * 8),
      confidence: constituencyRels.length >= 5 ? Confidence.MEDIUM : Confidence.LOW,
      missingDataWarnings: constituencyRels.length === 0 ? ['no constituency relationships mapped'] : [],
    };
  },

  /** §11.1 — faction relationship context. */
  async getFactionRelationshipContext(factionEntityId: UUID) {
    const rels = await RelationshipService.getRelationshipsForEntity(factionEntityId);
    const members = rels.filter((r) => (r.type as string) === 'MEMBER_OF_FACTION' || (r.type as string) === 'LEANING_TOWARD_FACTION');
    const brokers = rels.filter((r) => (r.type as string) === 'BROKER_FOR');
    const hostile = rels.filter((r) => HOSTILE.has(r.attitude as never));
    const broker = await AccessPathService.getBestBrokerForTarget(factionEntityId).catch(() => null);
    return {
      factionEntityId,
      members: members.map((r) => r.targetEntityId),
      brokers: brokers.map((r) => r.targetEntityId),
      highInfluenceActors: rels.filter((r) => HIGH_INF.has(r.influenceLevel as never)).map((r) => r.targetEntityId),
      hostileRelationships: hostile.map((r) => r.targetEntityId),
      suggestedBroker: broker,
      confidence: rels.length >= 3 ? Confidence.MEDIUM : Confidence.LOW,
    };
  },

  /** §12.1 — relationship inputs for policy radius (briefing priority list). */
  async getRelationshipInputsForPolicyRadius(policyEntityId: UUID, issueLinkedEntityIds: UUID[] = []) {
    const stakeholders: { entityId: UUID; attitude: string; influence: string; briefed: boolean }[] = [];
    for (const sid of issueLinkedEntityIds) {
      const rels = await RelationshipService.getRelationshipsForEntity(sid);
      const supportive = rels.find((r) => (r.type as string) === 'SUPPORTS_POLICY');
      const opposed = rels.find((r) => (r.type as string) === 'OPPOSES_POLICY');
      stakeholders.push({ entityId: sid, attitude: opposed ? 'OPPOSES' : supportive ? 'SUPPORTS' : 'UNKNOWN', influence: (rels[0]?.influenceLevel as string) ?? 'UNKNOWN', briefed: rels.some((r) => r.lastInteractionAt) });
    }
    const briefingList = stakeholders.filter((s) => !s.briefed || s.attitude === 'UNKNOWN' || s.attitude === 'OPPOSES');
    return { policyEntityId, stakeholders, briefingList: briefingList.map((s) => s.entityId), confidence: Confidence.LOW };
  },
};
