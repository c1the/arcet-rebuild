// =============================================================================
// action.service.ts — first-class action recommendations + rule generators
// =============================================================================
import { prisma, type Tx } from './db.js';
import { AuditService } from './audit.service.js';
import { RiskService } from './risk.service.js';
import { createActionSchema } from './validators.js';
import {
  ActionStatus,
  ActionType,
  ActionPriority,
  ApprovalRequirement,
  InfluenceLevel,
  Attitude,
  RelationshipType,
  FPTPRecommendationLabel,
} from './enums.js';
import {
  relationshipRules,
  candidateRules,
  type ProposedAction,
  type ProposedRisk,
} from './rules.js';
import type { ActorContext, CreateActionInput, UUID } from './types.js';

const OVERDUE_STATUSES: ActionStatus[] = [
  ActionStatus.RECOMMENDED,
  ActionStatus.ASSIGNED,
  ActionStatus.IN_PROGRESS,
  ActionStatus.NEEDS_REVIEW,
  ActionStatus.APPROVED,
  ActionStatus.BLOCKED,
];

async function persistProposals(
  proposals: { actions: ProposedAction[]; risks: ProposedRisk[] },
  sourceModule: string,
  actor?: ActorContext,
) {
  const createdActions = [];
  for (const a of proposals.actions) {
    createdActions.push(
      await ActionService.createRecommendation(
        {
          title: a.title,
          actionType: a.actionType,
          priority: a.priority,
          rationale: `[${a.rule}] ${a.rationale}`,
          targetEntityId: a.targetEntityId,
          approvalRequirement: a.approvalRequirement,
          expectedBenefit: a.expectedBenefit,
          downsideIfIgnored: a.downsideIfIgnored,
          sourceModule,
        },
        actor,
      ),
    );
  }
  const createdRisks = [];
  for (const r of proposals.risks) {
    createdRisks.push(
      await RiskService.createRisk(
        {
          riskType: r.riskType,
          title: r.title,
          severity: r.severity,
          likelihood: r.likelihood,
          urgency: r.urgency,
          rationale: `[${r.rule}] ${r.rationale}`,
          sourceModule,
          links: r.links,
        },
        actor,
      ),
    );
  }
  return { actions: createdActions, risks: createdRisks };
}

export const ActionService = {
  async createRecommendation(input: CreateActionInput, actor?: ActorContext, tx?: Tx) {
    const data = createActionSchema.parse(input);
    const client = tx ?? prisma;
    const action = await client.actionRecommendation.create({ data });
    await AuditService.record(
      { action: 'action.create', objectType: 'ActionRecommendation', objectId: action.id, entityId: action.targetEntityId, after: action as never, actor },
      tx,
    );
    return action;
  },

  async assignAction(actionId: UUID, ownerUserId: string, actor?: ActorContext) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.actionRecommendation.findUniqueOrThrow({ where: { id: actionId } });
      const after = await tx.actionRecommendation.update({
        where: { id: actionId },
        data: { ownerUserId, status: ActionStatus.ASSIGNED },
      });
      await AuditService.record(
        { action: 'action.assign', objectType: 'ActionRecommendation', objectId: actionId, before: before as never, after: after as never, actor },
        tx,
      );
      return after;
    });
  },

  async updateActionStatus(actionId: UUID, status: ActionStatus, actor?: ActorContext) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.actionRecommendation.findUniqueOrThrow({ where: { id: actionId } });
      const after = await tx.actionRecommendation.update({ where: { id: actionId }, data: { status } });
      await AuditService.record(
        { action: 'action.status', objectType: 'ActionRecommendation', objectId: actionId, before: before as never, after: after as never, actor },
        tx,
      );
      return after;
    });
  },

  async completeAction(actionId: UUID, outcome?: string, actor?: ActorContext) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.actionRecommendation.findUniqueOrThrow({ where: { id: actionId } });
      const after = await tx.actionRecommendation.update({
        where: { id: actionId },
        data: {
          status: ActionStatus.COMPLETED,
          completedAt: new Date(),
          description: outcome ? `${before.description ? before.description + '\n\n' : ''}Outcome: ${outcome}` : before.description,
        },
      });
      await AuditService.record(
        { action: 'action.complete', objectType: 'ActionRecommendation', objectId: actionId, before: before as never, after: after as never, actor },
        tx,
      );
      return after;
    });
  },

  async getActionsForEntity(entityId: UUID) {
    return prisma.actionRecommendation.findMany({ where: { targetEntityId: entityId }, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] });
  },

  /** Open actions, optionally overdue-only, ranked by priority then due date. */
  async getWarRoomActions(filters: { overdueOnly?: boolean; limit?: number } = {}) {
    const where = filters.overdueOnly
      ? { status: { in: OVERDUE_STATUSES }, dueDate: { lt: new Date() } }
      : { status: { in: OVERDUE_STATUSES } };
    return prisma.actionRecommendation.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: filters.limit ?? 25,
    });
  },

  // ---- rule-driven generators ---------------------------------------------

  async generateRelationshipActions(entityId: UUID, actor?: ActorContext) {
    const rels = await prisma.relationship.findMany({
      where: { OR: [{ sourceEntityId: entityId }, { targetEntityId: entityId }], isCurrent: true },
    });
    const agg = { actions: [] as ProposedAction[], risks: [] as ProposedRisk[] };
    for (const r of rels) {
      const out = relationshipRules({
        id: r.id,
        sourceEntityId: r.sourceEntityId,
        targetEntityId: r.targetEntityId,
        strength: r.strength,
        lastInteractionAt: r.lastInteractionAt,
        hasOwner: !!r.relationshipOwnerUserId || !!r.relationshipOwnerEntityId,
      });
      agg.actions.push(...out.actions);
      agg.risks.push(...out.risks);
    }
    return persistProposals(agg, 'rules.relationship', actor);
  },

  async generateCandidateActions(candidateEntityId: UUID, constituencyEntityId?: UUID, actor?: ActorContext) {
    const cand = await prisma.candidateProfile.findFirst({ where: { entityId: candidateEntityId } });
    if (!cand) throw new Error('Candidate profile not found');

    let highSalienceLocalIssue = false;
    if (constituencyEntityId) {
      const localIssues = await prisma.relationship.findMany({
        where: { targetEntityId: constituencyEntityId, type: RelationshipType.MATTERS_TO_CONSTITUENCY, isCurrent: true },
      });
      const issueIds = localIssues.map((r) => r.sourceEntityId);
      if (issueIds.length) {
        const salient = await prisma.issueProfile.count({ where: { entityId: { in: issueIds }, localRelevance: { gte: 4 } } });
        highSalienceLocalIssue = salient > 0;
      }
    }

    const out = candidateRules({
      candidateEntityId,
      localConnectionScore: cand.localConnectionScore,
      localAssociationSupportScore: cand.localAssociationSupportScore,
      riskScore: cand.riskScore,
      issueCredibilityScore: cand.issueCredibilityScore,
      highSalienceLocalIssue,
    });
    return persistProposals(out, 'rules.candidate', actor);
  },

  /** For each affected stakeholder of a policy with no recent briefing event, recommend a briefing. */
  async generatePolicyActions(policyEntityId: UUID, actor?: ActorContext) {
    const impacts = await prisma.policyImpact.findMany({ where: { policyEntityId } });
    const created = [];
    for (const im of impacts) {
      const existing = await prisma.actionRecommendation.count({
        where: { targetEntityId: im.affectedEntityId, actionType: ActionType.BRIEF, relatedPolicyImpactId: im.id },
      });
      if (existing === 0) {
        created.push(
          await this.createRecommendation(
            {
              title: 'Brief affected stakeholder on policy',
              actionType: ActionType.BRIEF,
              priority: ActionPriority.MEDIUM,
              rationale: `[POLICY_BRIEFING] Policy impact (${im.impactType}, ${im.impactDirection}) on this entity with no existing briefing.`,
              targetEntityId: im.affectedEntityId,
              relatedPolicyImpactId: im.id,
              sourceModule: 'rules.policy',
            },
            actor,
          ),
        );
      }
    }
    return { actions: created };
  },

  /** Translate a saved FPTP scenario's recommendation label into an action. */
  async generateFPTPActions(scenarioId: UUID, actor?: ActorContext) {
    const sc = await prisma.fPTPScenario.findUniqueOrThrow({ where: { id: scenarioId } });
    const map: Partial<Record<FPTPRecommendationLabel, { title: string; type: ActionType; priority: ActionPriority; approval?: ApprovalRequirement }>> = {
      [FPTPRecommendationLabel.COMPETE_HARD]: { title: 'Increase campaign effort (compete hard)', type: ActionType.INCREASE_CAMPAIGN_EFFORT, priority: ActionPriority.HIGH },
      [FPTPRecommendationLabel.COMPETE_SELECTIVELY]: { title: 'Target resources selectively', type: ActionType.INCREASE_CAMPAIGN_EFFORT, priority: ActionPriority.MEDIUM },
      [FPTPRecommendationLabel.SYMBOLIC_RUN]: { title: 'Plan a symbolic run for future value', type: ActionType.GATHER_LOCAL_DATA, priority: ActionPriority.LOW },
      [FPTPRecommendationLabel.STAND_ASIDE]: { title: 'Reduce campaign effort (stand aside)', type: ActionType.DECREASE_CAMPAIGN_EFFORT, priority: ActionPriority.MEDIUM, approval: ApprovalRequirement.SENIOR_REVIEW },
      [FPTPRecommendationLabel.DO_NOT_INVEST]: { title: 'Reduce campaign effort (do not invest)', type: ActionType.DECREASE_CAMPAIGN_EFFORT, priority: ActionPriority.MEDIUM, approval: ApprovalRequirement.SENIOR_REVIEW },
      [FPTPRecommendationLabel.CHANGE_CANDIDATE]: { title: 'Review candidate selection', type: ActionType.COMPARE_CANDIDATES, priority: ActionPriority.HIGH, approval: ApprovalRequirement.PARTY_APPROVAL },
      [FPTPRecommendationLabel.GATHER_MORE_DATA]: { title: 'Gather more local data', type: ActionType.GATHER_LOCAL_DATA, priority: ActionPriority.MEDIUM },
      [FPTPRecommendationLabel.ESCALATE_TO_STRATEGIST]: { title: 'Escalate scenario to strategist', type: ActionType.REQUIRE_APPROVAL, priority: ActionPriority.HIGH, approval: ApprovalRequirement.SENIOR_REVIEW },
    };
    const spec = sc.recommendationLabel ? map[sc.recommendationLabel] : undefined;
    if (!spec) return { actions: [] };
    const action = await this.createRecommendation(
      {
        title: spec.title,
        actionType: spec.type,
        priority: spec.priority,
        rationale: `[FPTP_SCENARIO] ${sc.rationale ?? sc.recommendationLabel}`,
        targetEntityId: sc.constituencyEntityId,
        relatedScenarioId: sc.id,
        approvalRequirement: spec.approval,
        sourceModule: 'rules.fptp',
      },
      actor,
    );
    return { actions: [action] };
  },

  // re-exported for callers/tests that want raw enum members handy
  _enums: { ActionType, ActionPriority, ApprovalRequirement, InfluenceLevel, Attitude },
};
