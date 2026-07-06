// =============================================================================
// access-path.service.ts — find + score routes to a target (§8.7)
// -----------------------------------------------------------------------------
// Breadth-first search over current relationships up to a depth limit, scoring
// each discovered path with the pure scoreAccessPath rule. Paths through
// restricted/sensitive relationships are surfaced as blocked, not recommended.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { Confidence } from '../ontology/enums.js';
import * as rules from './rules.js';
import type { ActorContext, PathEdgeSignals, ScoredPath, UUID } from './types.js';

interface Edge { rel: { id: string; type: string; sourceEntityId: string; targetEntityId: string; strength: number; trustLevel: number | null; influenceLevel: string; attitude: string; confidence: string; lastInteractionAt: Date | null; dataClassification: string; status: string; containsInferredData: boolean } }

function toSignal(rel: Edge['rel'], from: string, to: string): PathEdgeSignals {
  const days = rel.lastInteractionAt ? Math.floor((Date.now() - new Date(rel.lastInteractionAt).getTime()) / 86400000) : null;
  return { relationshipId: rel.id, fromEntityId: from, toEntityId: to, strength: rel.strength, trustLevel: rel.trustLevel ?? undefined, influenceLevel: rel.influenceLevel as never, attitude: rel.attitude as never, confidence: rel.confidence as never, daysSinceInteraction: days, restricted: rel.dataClassification === 'RESTRICTED' || rel.status === 'SENSITIVE', inferred: rel.containsInferredData };
}

export const AccessPathService = {
  async findAccessPaths(sourceEntityId: UUID, targetEntityId: UUID, options: { maxDepth?: number; allowRestricted?: boolean; maxPaths?: number } = {}): Promise<ScoredPath[]> {
    const maxDepth = options.maxDepth ?? 4;
    // BFS, tracking the edge signals along each path.
    const queue: { node: string; nodes: string[]; rels: string[]; signals: PathEdgeSignals[] }[] = [{ node: sourceEntityId, nodes: [sourceEntityId], rels: [], signals: [] }];
    const found: ScoredPath[] = [];
    const visitedAtDepth = new Set<string>([sourceEntityId]);

    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.nodes.length - 1 >= maxDepth) continue;
      const rels = await prisma.relationship.findMany({ where: { isCurrent: true, OR: [{ sourceEntityId: cur.node }, { targetEntityId: cur.node }] } });
      for (const rel of rels as unknown as Edge['rel'][]) {
        const next = rel.sourceEntityId === cur.node ? rel.targetEntityId : rel.sourceEntityId;
        if (cur.nodes.includes(next)) continue; // no cycles
        const signal = toSignal(rel, cur.node, next);
        const nodes = [...cur.nodes, next];
        const signals = [...cur.signals, signal];
        if (next === targetEntityId) {
          const score = rules.scoreAccessPath(signals);
          if (options.allowRestricted || !score.blocked) {
            found.push({ ...score, nodes, relationshipIds: [...cur.rels, rel.id], pathLength: signals.length });
          }
        } else if (!visitedAtDepth.has(next)) {
          queue.push({ node: next, nodes, rels: [...cur.rels, rel.id], signals });
        }
      }
    }
    found.sort((a, b) => b.pathQualityScore - a.pathQualityScore || a.pathRiskScore - b.pathRiskScore);
    return found.slice(0, options.maxPaths ?? 5);
  },

  scoreAccessPath(signals: PathEdgeSignals[]) {
    return rules.scoreAccessPath(signals);
  },

  async saveAccessPath(input: { sourceEntityId: UUID; targetEntityId: UUID; nodes: UUID[]; relationshipIds: UUID[]; pathQualityScore?: number; pathRiskScore?: number; confidence?: Confidence; rationale?: string }, actor?: ActorContext) {
    return prisma.relationshipPath.create({
      data: { sourceEntityId: input.sourceEntityId, targetEntityId: input.targetEntityId, pathJson: { nodes: input.nodes, relationshipIds: input.relationshipIds } as never, pathLength: input.nodes.length - 1, pathQualityScore: input.pathQualityScore, pathRiskScore: input.pathRiskScore, confidence: (input.confidence ?? Confidence.LOW) as never, rationale: input.rationale, createdByUserId: actor?.userId },
    });
  },

  async getSavedAccessPaths(sourceEntityId: UUID, targetEntityId: UUID) {
    return prisma.relationshipPath.findMany({ where: { sourceEntityId, targetEntityId }, orderBy: { createdAt: 'desc' } });
  },

  async getBestBrokerForTarget(targetEntityId: UUID) {
    // The strongest single intermediary with access to the target.
    const rels = await prisma.relationship.findMany({ where: { isCurrent: true, OR: [{ targetEntityId }, { sourceEntityId: targetEntityId }] }, orderBy: { strength: 'desc' } });
    const brokers = (rels as unknown as Edge['rel'][]).filter((r) => r.type === 'BROKER_FOR' || r.type === 'CONTROLS_ACCESS_TO' || (r.influenceLevel === 'HIGH' || r.influenceLevel === 'CRITICAL'));
    const best = brokers[0];
    if (!best) return null;
    const brokerEntityId = best.sourceEntityId === targetEntityId ? best.targetEntityId : best.sourceEntityId;
    return { brokerEntityId, relationshipId: best.id, rationale: 'Highest-strength high-influence intermediary with access to the target.' };
  },
};
