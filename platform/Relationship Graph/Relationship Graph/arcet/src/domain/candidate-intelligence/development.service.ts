// =============================================================================
// development.service.ts — candidate development plans (brief §10.5)
// -----------------------------------------------------------------------------
// A plan groups development actions. The actions themselves are ontology
// ActionRecommendation records; CandidateDevelopmentAction links them to the
// plan with an expected score impact. Completing an action records a temporal
// observation/change improving the relevant dimension.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { AuditService } from '../ontology/audit.service.js';
import { ActionService } from '../ontology/action.service.js';
import { ObservationService } from '../temporal/observation.service.js';
import { ChangeService } from '../temporal/change.service.js';
import { ObservationType, ChangeType } from '../temporal/enums.js';
import { CandidateScoringService } from './scoring.service.js';
import * as rules from './rules.js';
import { CandidateDevelopmentPlanStatus, CandidateDevelopmentActionStatus, CandidateDimensionType } from './enums.js';
import type { ActorContext, UUID } from './types.js';

const DIM_OBS: Record<string, ObservationType> = {
  LOCAL_CONNECTION: ObservationType.LOCAL_CONNECTION,
  STAKEHOLDER_COVERAGE: ObservationType.STAKEHOLDER_COVERAGE,
  LOCAL_ASSOCIATION_SUPPORT: ObservationType.LOCAL_ASSOCIATION_SUPPORT,
  FACTION_ACCEPTABILITY: ObservationType.FACTION_ACCEPTABILITY,
  MEDIA_READINESS: ObservationType.MEDIA_READINESS,
  ISSUE_CREDIBILITY: ObservationType.ISSUE_CREDIBILITY,
  RISK_PROFILE: ObservationType.CANDIDATE_RISK,
};

export const CandidateDevelopmentService = {
  async createDevelopmentPlan(candidateEntityId: UUID, constituencyEntityId: UUID | undefined, options: { title?: string; summary?: string; targetReadinessScore?: number; deadline?: Date; ownerUserId?: string; generateActions?: boolean } = {}, actor?: ActorContext) {
    const { bundle, quality } = await CandidateScoringService.deriveSignals(candidateEntityId, constituencyEntityId);
    const results = CandidateScoringService.scoreAll(bundle, rules.computeConfidence(quality));
    const scores = CandidateScoringService.toScores(results);
    const currentReadiness = scores.POLITICAL_EXPERIENCE;

    const plan = await prisma.candidateDevelopmentPlan.create({
      data: {
        candidateEntityId,
        constituencyEntityId,
        title: options.title ?? 'Candidate development plan',
        summary: options.summary,
        status: CandidateDevelopmentPlanStatus.ACTIVE,
        targetReadinessScore: options.targetReadinessScore ?? Math.min(currentReadiness + 20, 100),
        currentReadinessScore: currentReadiness,
        deadline: options.deadline,
        ownerUserId: options.ownerUserId,
      },
    });
    await AuditService.record({ action: 'candidate-intelligence.dev-plan.create', objectType: 'CandidateDevelopmentPlan', objectId: plan.id, entityId: candidateEntityId, after: plan as never, actor });

    if (options.generateActions ?? true) {
      await this.generateDevelopmentActions(candidateEntityId, constituencyEntityId, plan.id, actor);
    }
    return prisma.candidateDevelopmentPlan.findUnique({ where: { id: plan.id }, include: { actions: true } });
  },

  /** Generate development actions for weak dimensions and link them to the plan. */
  async generateDevelopmentActions(candidateEntityId: UUID, constituencyEntityId: UUID | undefined, developmentPlanId: UUID, actor?: ActorContext) {
    const { bundle, quality } = await CandidateScoringService.deriveSignals(candidateEntityId, constituencyEntityId);
    const results = CandidateScoringService.scoreAll(bundle, rules.computeConfidence(quality));
    const proposed = rules.developmentActions(CandidateScoringService.toScores(results), { dataThin: rules.isDataThin(quality) });

    const created = [];
    for (const a of proposed) {
      const action = await ActionService.createRecommendation({ title: a.title, actionType: a.actionType, priority: a.priority, targetEntityId: candidateEntityId, sourceModule: 'candidate-intelligence', rationale: a.rationale }, actor);
      const impact = rules.estimateDevelopmentImpact(a.actionType);
      const link = await prisma.candidateDevelopmentAction.create({
        data: { developmentPlanId, actionRecommendationId: action.id, dimensionType: (a.dimensionType as never) ?? null, expectedScoreImpact: impact.expectedScoreImpact, status: CandidateDevelopmentActionStatus.PROPOSED },
      });
      created.push({ action, link });
    }
    return created;
  },

  estimateDevelopmentImpact(actionType: Parameters<typeof rules.estimateDevelopmentImpact>[0]) {
    return rules.estimateDevelopmentImpact(actionType);
  },

  async getDevelopmentPlan(candidateEntityId: UUID, constituencyEntityId?: UUID) {
    return prisma.candidateDevelopmentPlan.findFirst({ where: { candidateEntityId, ...(constituencyEntityId ? { constituencyEntityId } : {}) }, orderBy: { createdAt: 'desc' }, include: { actions: true } });
  },

  async getDevelopmentProgress(candidateEntityId: UUID, constituencyEntityId?: UUID) {
    const plan = await this.getDevelopmentPlan(candidateEntityId, constituencyEntityId);
    if (!plan) return null;
    const total = plan.actions.length;
    const completed = plan.actions.filter((a) => a.status === CandidateDevelopmentActionStatus.COMPLETED).length;
    return { plan, total, completed, percentComplete: total ? Math.round((completed / total) * 100) : 0 };
  },

  async updateDevelopmentPlanProgress(developmentPlanId: UUID, actor?: ActorContext) {
    const plan = await prisma.candidateDevelopmentPlan.findUnique({ where: { id: developmentPlanId }, include: { actions: true } });
    if (!plan) throw new Error('Development plan not found');
    const allDone = plan.actions.length > 0 && plan.actions.every((a) => a.status === CandidateDevelopmentActionStatus.COMPLETED);
    if (allDone) return prisma.candidateDevelopmentPlan.update({ where: { id: developmentPlanId }, data: { status: CandidateDevelopmentPlanStatus.COMPLETED } });
    return plan;
  },

  /**
   * Complete a development action: mark complete, complete the underlying
   * ActionRecommendation, and record a temporal observation + change that
   * improves the relevant candidate dimension (brief §10.5, §23 dev tests).
   */
  async completeDevelopmentAction(developmentActionId: UUID, outcome: string, actor?: ActorContext) {
    const link = await prisma.candidateDevelopmentAction.findUnique({ where: { id: developmentActionId } });
    if (!link) throw new Error('Development action not found');
    await prisma.candidateDevelopmentAction.update({ where: { id: developmentActionId }, data: { status: CandidateDevelopmentActionStatus.COMPLETED } });
    if (link.actionRecommendationId) await ActionService.completeAction(link.actionRecommendationId, outcome, actor).catch(() => undefined);

    const plan = await prisma.candidateDevelopmentPlan.findUnique({ where: { id: link.developmentPlanId } });
    const dim = link.dimensionType as string | null;
    if (plan && dim && DIM_OBS[dim]) {
      // Record an improving observation for the targeted dimension.
      const improvement = link.expectedScoreImpact ?? 8;
      await ObservationService.recordObservation({ subjectEntityId: plan.candidateEntityId, contextEntityId: plan.constituencyEntityId ?? undefined, observationType: DIM_OBS[dim], valueText: `completed: ${outcome}`, valueNumeric: improvement, sourceModule: 'candidate-intelligence' }, actor);
      await ChangeService.recordChange({ entityId: plan.candidateEntityId, changeType: dim === CandidateDimensionType.RISK_PROFILE ? ChangeType.RISK_DEESCALATED : ChangeType.CANDIDATE_IMPROVED, fieldName: dim, deltaNumeric: improvement, rationale: `Development action completed (${outcome}); expected +${improvement} on ${dim}.`, significant: Math.abs(improvement) >= 10, sourceModule: 'candidate-intelligence' }, actor);
    }
    await this.updateDevelopmentPlanProgress(link.developmentPlanId, actor);
    return { developmentActionId, outcome };
  },
};
