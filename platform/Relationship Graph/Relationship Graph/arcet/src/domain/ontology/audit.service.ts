// =============================================================================
// audit.service.ts — append-only audit trail
// -----------------------------------------------------------------------------
// Every create / update / delete / archive / relationship-change / score-change
// / risk-change / recommendation-change / approval-change / export must call
// AuditService.record(). Writes accept an optional transaction client so the
// audit row commits atomically with the change it describes.
// =============================================================================
import { prisma, type Tx } from './db.js';
import type { ActorContext, JsonValue } from './types.js';

export interface AuditInput {
  action: string; // e.g. 'entity.create', 'relationship.archive', 'action.approve'
  objectType: string; // model name, e.g. 'Entity', 'Relationship'
  objectId: string;
  entityId?: string | null; // related base Entity, when applicable
  before?: JsonValue | null;
  after?: JsonValue | null;
  actor?: ActorContext;
}

export const AuditService = {
  async record(input: AuditInput, tx?: Tx) {
    const client = tx ?? prisma;
    return client.auditLog.create({
      data: {
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId,
        entityId: input.entityId ?? null,
        before: (input.before ?? null) as never,
        after: (input.after ?? null) as never,
        actorUserId: input.actor?.userId ?? null,
        ipAddress: input.actor?.ipAddress ?? null,
        userAgent: input.actor?.userAgent ?? null,
      },
    });
  },

  async getForObject(objectType: string, objectId: string) {
    return prisma.auditLog.findMany({
      where: { objectType, objectId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getForEntity(entityId: string) {
    return prisma.auditLog.findMany({
      where: { entityId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async recent(limit = 50) {
    return prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  },
};
