// =============================================================================
// risk.service.ts — risks are first-class; each carries its own base Entity
// =============================================================================
import { prisma, type Tx } from './db.js';
import { AuditService } from './audit.service.js';
import { EntityService } from './entity.service.js';
import { createRiskSchema, updateRiskSchema } from './validators.js';
import { EntityType, RiskLinkRole, RiskStatus, Severity } from './enums.js';
import type { ActorContext, CreateRiskInput, UpdateRiskInput, UUID } from './types.js';

const SEVERITY_ORDER: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export const RiskService = {
  async createRisk(input: CreateRiskInput, actor?: ActorContext) {
    const data = createRiskSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const baseEntity = await EntityService.createEntity(
        { type: EntityType.RISK, displayName: data.title, description: data.description },
        actor,
        tx,
      );
      const risk = await tx.risk.create({
        data: {
          entityId: baseEntity.id,
          riskType: data.riskType,
          title: data.title,
          description: data.description,
          severity: data.severity,
          likelihood: data.likelihood,
          urgency: data.urgency,
          status: data.status,
          confidence: data.confidence,
          ownerUserId: data.ownerUserId,
          sourceModule: data.sourceModule,
          rationale: data.rationale,
          mitigation: data.mitigation,
        },
      });
      const links = data.links?.length ? data.links : [];
      if (links.length) {
        await tx.riskLink.createMany({
          data: links.map((l) => ({ riskId: risk.id, entityId: l.entityId, role: l.role ?? RiskLinkRole.AFFECTED })),
          skipDuplicates: true,
        });
      }
      await AuditService.record(
        { action: 'risk.create', objectType: 'Risk', objectId: risk.id, entityId: baseEntity.id, after: risk as never, actor },
        tx,
      );
      return risk;
    });
  },

  async updateRisk(id: UUID, input: UpdateRiskInput, actor?: ActorContext) {
    const data = updateRiskSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const before = await tx.risk.findUniqueOrThrow({ where: { id } });
      const after = await tx.risk.update({ where: { id }, data });
      await AuditService.record(
        { action: 'risk.update', objectType: 'Risk', objectId: id, entityId: before.entityId, before: before as never, after: after as never, actor },
        tx,
      );
      return after;
    });
  },

  async linkRiskToEntity(riskId: UUID, entityId: UUID, role: RiskLinkRole = RiskLinkRole.AFFECTED, actor?: ActorContext) {
    const link = await prisma.riskLink.upsert({
      where: { riskId_entityId_role: { riskId, entityId, role } },
      update: {},
      create: { riskId, entityId, role },
    });
    await AuditService.record({ action: 'risk.link', objectType: 'RiskLink', objectId: link.id, entityId, actor });
    return link;
  },

  async getRisksForEntity(entityId: UUID) {
    const links = await prisma.riskLink.findMany({
      where: { entityId },
      include: { risk: true },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((l) => ({ role: l.role, risk: l.risk }));
  },

  /** Open/active risks ranked by severity then urgency, for the war room. */
  async getWarRoomRisks(filters: { limit?: number; minSeverity?: Severity } = {}) {
    const risks = await prisma.risk.findMany({
      where: { status: { in: [RiskStatus.OPEN, RiskStatus.MONITORING, RiskStatus.MITIGATING] } },
      include: { links: true },
    });
    const min = filters.minSeverity ? SEVERITY_ORDER[filters.minSeverity] : 0;
    return risks
      .filter((r) => SEVERITY_ORDER[r.severity] >= min)
      .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])
      .slice(0, filters.limit ?? 20);
  },

  async resolveRisk(id: UUID, actor?: ActorContext) {
    return this.updateRisk(id, { status: RiskStatus.RESOLVED }, actor);
  },

  async generateRiskSummary(entityId: UUID) {
    const links = await this.getRisksForEntity(entityId);
    const open = links.filter((l) => l.risk.status !== RiskStatus.RESOLVED && l.risk.status !== RiskStatus.DISMISSED);
    const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
    for (const l of open) bySeverity[l.risk.severity]++;
    const top = [...open].sort((a, b) => SEVERITY_ORDER[b.risk.severity] - SEVERITY_ORDER[a.risk.severity]).slice(0, 5);
    return {
      entityId,
      openCount: open.length,
      bySeverity,
      topRisks: top.map((l) => ({ id: l.risk.id, title: l.risk.title, severity: l.risk.severity, status: l.risk.status })),
    };
  },
};
