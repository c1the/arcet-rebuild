// =============================================================================
// policy-exposure.service.ts — candidate ↔ policy radius (brief §10.9, §17)
// =============================================================================
import { prisma } from '../ontology/db.js';
import { PolicyRadiusContextService } from '../ontology/policy-radius-context.service.js';
import { ActionService } from '../ontology/action.service.js';
import { ActionType, ActionPriority } from '../ontology/enums.js';
import { CandidateScoringService } from './scoring.service.js';
import type { ActorContext, UUID } from './types.js';

export const CandidatePolicyExposureService = {
  async getCandidateIssueProfile(candidateEntityId: UUID) {
    const { bundle } = await CandidateScoringService.deriveSignals(candidateEntityId);
    return {
      candidateEntityId,
      credibilitySignals: bundle.issueCredibility,
      vulnerableToAttack: !!bundle.issueCredibility.vulnerableToAttack,
      contradictions: !!bundle.issueCredibility.contradictoryStatements,
    };
  },

  async getCandidatePolicyExposure(candidateEntityId: UUID, policyEntityId: UUID) {
    const ctx = await PolicyRadiusContextService.getPolicyContext(policyEntityId);
    const affected = await PolicyRadiusContextService.getAffectedCandidates(policyEntityId).catch(() => []);
    const isAffected = (affected as { entityId?: string }[]).some((c) => c.entityId === candidateEntityId);
    return { candidateEntityId, policyEntityId, isAffected, policyContext: ctx };
  },

  async detectCandidatePolicyContradictions(candidateEntityId: UUID, policyEntityId: UUID) {
    const profile = await this.getCandidateIssueProfile(candidateEntityId);
    return { candidateEntityId, policyEntityId, hasContradiction: profile.contradictions, rationale: profile.contradictions ? 'Past statements may contradict current policy.' : 'No contradiction detected from current signals.' };
  },

  async getCandidatePolicyBriefingNeeds(candidateEntityId: UUID, policyEntityId: UUID) {
    const { bundle } = await CandidateScoringService.deriveSignals(candidateEntityId);
    const needsBriefing = !bundle.issueCredibility.demonstratedExpertise || !!bundle.issueCredibility.highSalienceNoCredibility;
    return { candidateEntityId, policyEntityId, needsBriefing, needsMediaPrep: !!bundle.media.unresolvedMediaVulnerability };
  },

  async generateCandidatePolicyPrepActions(candidateEntityId: UUID, policyEntityId: UUID, actor?: ActorContext) {
    const needs = await this.getCandidatePolicyBriefingNeeds(candidateEntityId, policyEntityId);
    const created = [];
    if (needs.needsBriefing) created.push(await ActionService.createRecommendation({ title: 'Prepare candidate policy briefing', actionType: ActionType.BRIEF, priority: ActionPriority.MEDIUM, targetEntityId: candidateEntityId, sourceModule: 'candidate-intelligence', rationale: 'Candidate needs briefing on this policy.' }, actor));
    if (needs.needsMediaPrep) created.push(await ActionService.createRecommendation({ title: 'Prepare media lines / rebuttal on policy', actionType: ActionType.PREPARE_REBUTTAL, priority: ActionPriority.MEDIUM, targetEntityId: candidateEntityId, sourceModule: 'candidate-intelligence', rationale: 'Candidate exposed on this policy in media.' }, actor));
    return created;
  },
};
