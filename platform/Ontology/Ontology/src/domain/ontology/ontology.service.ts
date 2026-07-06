// =============================================================================
// ontology.service.ts — facade re-exporting the domain services + war room
// =============================================================================
import { prisma } from './db.js';
import { EntityService } from './entity.service.js';
import { RelationshipService } from './relationship.service.js';
import { EvidenceService } from './evidence.service.js';
import { EventService } from './event.service.js';
import { RiskService } from './risk.service.js';
import { ScoreService } from './score.service.js';
import { ActionService } from './action.service.js';
import { ComplianceService } from './compliance.service.js';
import { CandidateContextService } from './candidate-context.service.js';
import { ConstituencyContextService } from './constituency-context.service.js';
import { FPTPContextService } from './fptp-context.service.js';
import { FactionContextService } from './faction-context.service.js';
import { PolicyRadiusContextService } from './policy-radius-context.service.js';
import { AuditService } from './audit.service.js';
import { CandidateStatus, EntityType, StrategicPriority, Severity } from './enums.js';
import type { WarRoomFilters, WarRoomSummary } from './types.js';

export const WarRoomService = {
  async getSummary(filters: WarRoomFilters = {}): Promise<WarRoomSummary> {
    const limit = filters.limit ?? 10;
    const [topRisks, overdueActions, staleRelationships, pendingCandidateDecisions, highRiskConstituencies, policyAlerts, recentChanges] =
      await Promise.all([
        RiskService.getWarRoomRisks({ limit }),
        ActionService.getWarRoomActions({ overdueOnly: true, limit }),
        RelationshipService.getStaleRelationships({}),
        prisma.candidateProfile.findMany({
          where: { candidateStatus: { in: [CandidateStatus.SHORT_LISTED, CandidateStatus.UNDER_REVIEW, CandidateStatus.LONG_LISTED] } },
          take: limit,
        }),
        prisma.constituencyProfile.findMany({
          where: { strategicPriority: { in: [StrategicPriority.CRITICAL, StrategicPriority.HIGH] } },
          orderBy: { strategicPriority: 'asc' },
          take: limit,
        }),
        prisma.policyImpact.findMany({ where: { severity: { in: [Severity.HIGH, Severity.CRITICAL] } }, take: limit, orderBy: { createdAt: 'desc' } }),
        EventService.getRecentChanges({ limit }),
      ]);

    return {
      topRisks,
      overdueActions,
      staleRelationships: staleRelationships.slice(0, limit),
      pendingCandidateDecisions,
      highRiskConstituencies,
      policyAlerts,
      recentChanges,
    };
  },

  async getRisks(filters: WarRoomFilters = {}) {
    return RiskService.getWarRoomRisks({ limit: filters.limit });
  },
  async getActions(filters: WarRoomFilters = {}) {
    return ActionService.getWarRoomActions({ overdueOnly: false, limit: filters.limit });
  },
  async getRecentChanges(filters: WarRoomFilters = {}) {
    return EventService.getRecentChanges({ limit: filters.limit });
  },
};

/** Single object exposing the whole domain layer for convenient consumption. */
export const Ontology = {
  entity: EntityService,
  relationship: RelationshipService,
  evidence: EvidenceService,
  event: EventService,
  risk: RiskService,
  score: ScoreService,
  action: ActionService,
  compliance: ComplianceService,
  candidate: CandidateContextService,
  constituency: ConstituencyContextService,
  fptp: FPTPContextService,
  faction: FactionContextService,
  policy: PolicyRadiusContextService,
  audit: AuditService,
  warRoom: WarRoomService,
  _enums: { EntityType },
};
