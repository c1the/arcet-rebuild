// =============================================================================
// graph.service.ts — graph orchestration (§8.1)
// -----------------------------------------------------------------------------
// Builds on the ontology RelationshipService.getRelationshipGraph and adds
// graph-level queries (high-value / high-risk / sensitive) plus relationship
// summaries enriched with tags, notes, scores and temporal state.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { RelationshipService } from '../ontology/relationship.service.js';
import { Attitude, InfluenceLevel } from '../ontology/enums.js';
import type { GraphOptions, UUID } from './types.js';

const HOSTILE = new Set([Attitude.HOSTILE, Attitude.SCEPTICAL]);
const HIGH_INF = new Set([InfluenceLevel.HIGH, InfluenceLevel.CRITICAL]);

export const RelationshipGraphService = {
  async getGraphForEntity(entityId: UUID, options: GraphOptions = {}) {
    const graph = await RelationshipService.getRelationshipGraph(entityId, options.depth ?? 1);
    let edges = graph.edges;
    if (options.staleOnly) edges = edges.filter((e) => e.lastInteractionAt && Date.now() - new Date(e.lastInteractionAt).getTime() > 90 * 86400000);
    if (options.highRiskOnly) edges = edges.filter((e) => HOSTILE.has(e.attitude as never) && HIGH_INF.has(e.influenceLevel as never));
    if (options.maxEdges) edges = edges.slice(0, options.maxEdges);
    const nodes = options.maxNodes ? graph.nodes.slice(0, options.maxNodes) : graph.nodes;
    return { ...graph, nodes, edges };
  },

  async getGraphForCandidate(candidateEntityId: UUID, options: GraphOptions = {}) {
    return this.getGraphForEntity(candidateEntityId, { depth: options.depth ?? 2, ...options });
  },
  async getGraphForConstituency(constituencyEntityId: UUID, options: GraphOptions = {}) {
    return this.getGraphForEntity(constituencyEntityId, { depth: options.depth ?? 1, ...options });
  },
  async getGraphForPolicy(policyEntityId: UUID, options: GraphOptions = {}) {
    return this.getGraphForEntity(policyEntityId, { depth: options.depth ?? 1, ...options });
  },
  async getGraphForFaction(factionEntityId: UUID, options: GraphOptions = {}) {
    return this.getGraphForEntity(factionEntityId, { depth: options.depth ?? 1, ...options });
  },

  async getRelationshipSummary(relationshipId: UUID) {
    const rel = await prisma.relationship.findUnique({ where: { id: relationshipId }, include: { tags: true, notes: { orderBy: { createdAt: 'desc' }, take: 5 }, graphScores: true } });
    if (!rel) return null;
    const state = await prisma.relationshipTemporalState.findFirst({ where: { relationshipId }, orderBy: { observedAt: 'desc' } });
    return { relationship: rel, latestState: state, scores: rel.graphScores };
  },

  async getRelationshipNeighbourhood(entityId: UUID, depth = 1, options: GraphOptions = {}) {
    return this.getGraphForEntity(entityId, { ...options, depth });
  },

  async getHighValueRelationships(filters: { minStrategicValue?: number; limit?: number } = {}) {
    const min = filters.minStrategicValue ?? 60;
    const scores = await prisma.relationshipScore.findMany({ where: { scoreType: 'STRATEGIC_VALUE', value: { gte: min } }, orderBy: { value: 'desc' }, take: filters.limit ?? 50 });
    const ids = scores.map((s) => s.relationshipId);
    const rels = await prisma.relationship.findMany({ where: { id: { in: ids } } });
    return rels;
  },

  async getHighRiskRelationships(filters: { limit?: number } = {}) {
    const scores = await prisma.relationshipScore.findMany({ where: { scoreType: 'RISK', value: { gte: 60 } }, orderBy: { value: 'desc' }, take: filters.limit ?? 50 });
    const ids = scores.map((s) => s.relationshipId);
    return prisma.relationship.findMany({ where: { id: { in: ids } } });
  },

  async getSensitiveRelationships(filters: { limit?: number } = {}) {
    return prisma.relationship.findMany({ where: { OR: [{ dataClassification: 'RESTRICTED' }, { dataClassification: 'SENSITIVE_PERSONAL_DATA' }, { status: 'SENSITIVE' }, { requiresReview: true }] }, take: filters.limit ?? 50 });
  },
};
