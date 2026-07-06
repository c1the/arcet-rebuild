// =============================================================================
// score.service.ts — generic, shared scoring infrastructure
// =============================================================================
import { prisma, type Tx } from './db.js';
import { AuditService } from './audit.service.js';
import { createScoreSchema } from './validators.js';
import { ScoreType } from './enums.js';
import type { ActorContext, CreateScoreInput, UUID } from './types.js';

export const ScoreService = {
  /** Record a score. Scores are append-only history; the latest wins on read. */
  async recordScore(input: CreateScoreInput, actor?: ActorContext, tx?: Tx) {
    const data = createScoreSchema.parse(input);
    const client = tx ?? prisma;
    const score = await client.score.create({ data });
    await AuditService.record(
      { action: 'score.record', objectType: 'Score', objectId: score.id, entityId: score.subjectEntityId, after: score as never, actor },
      tx,
    );
    return score;
  },

  async getScoresForEntity(subjectEntityId: UUID, scoreType?: ScoreType) {
    return prisma.score.findMany({
      where: { subjectEntityId, scoreType },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Latest score of each type for a subject (optionally scoped to a context). */
  async getLatestScores(subjectEntityId: UUID, contextEntityId?: UUID) {
    const rows = await prisma.score.findMany({
      where: { subjectEntityId, contextEntityId: contextEntityId ?? undefined },
      orderBy: { createdAt: 'desc' },
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.scoreType)) latest.set(r.scoreType, r);
    return [...latest.values()];
  },

  async getLatestScore(subjectEntityId: UUID, scoreType: ScoreType, contextEntityId?: UUID) {
    return prisma.score.findFirst({
      where: { subjectEntityId, scoreType, contextEntityId: contextEntityId ?? undefined },
      orderBy: { createdAt: 'desc' },
    });
  },
};
