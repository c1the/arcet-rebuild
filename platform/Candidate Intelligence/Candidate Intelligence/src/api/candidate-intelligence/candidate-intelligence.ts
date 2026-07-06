// =============================================================================
// candidate-intelligence.ts — candidate-intelligence REST endpoints (§13)
// -----------------------------------------------------------------------------
// Framework-agnostic Route[] groups aggregated as candidateIntelApiRoutes and
// spread into the main apiRoutes table. Mirrors the ontology/temporal API style.
// =============================================================================
import {
  CandidateIntelligenceService,
  CandidateComparisonService,
  CandidateRiskService,
  CandidateDevelopmentService,
  CandidateRelationshipService,
  CandidateIntelTemporalService,
  CandidateFPTPCompatibilityService,
  CandidateExplanationService,
  candidateIntelValidators as v,
} from '../../domain/candidate-intelligence/index.js';
import { type Route, ok, created, badRequest, notFound, intParam } from '../http.js';

const date = (s: string | undefined): Date => (s ? new Date(s) : new Date());

// ---- Profile / overview / context ------------------------------------------
export const profileRoutes: Route[] = [
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId', handler: async (req) => ok(await CandidateIntelligenceService.getCandidateContext(req.params.candidateId)) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/overview', handler: async (req) => ok(await CandidateIntelligenceService.getCandidateOverview(req.params.candidateId)) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/context', handler: async (req) => ok(await CandidateIntelligenceService.getCandidateContext(req.params.candidateId)) },
];

// ---- Assessment -------------------------------------------------------------
export const assessmentRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/candidate-intelligence/assessments',
    handler: async (req) => {
      const parsed = v.runAssessmentSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid assessment request', parsed.error.flatten());
      if (!parsed.data.constituencyEntityId) return badRequest('constituencyEntityId is required for a seat assessment');
      return created(await CandidateIntelligenceService.runCandidateSeatAssessment(parsed.data.candidateEntityId, parsed.data.constituencyEntityId, { weightConfigId: parsed.data.weightConfigId, persist: parsed.data.persist, assessmentType: parsed.data.assessmentType }, req.actor));
    },
  },
  {
    method: 'POST',
    path: '/api/candidate-intelligence/candidates/:candidateId/constituencies/:constituencyId/run-assessment',
    handler: async (req) => created(await CandidateIntelligenceService.runCandidateSeatAssessment(req.params.candidateId, req.params.constituencyId, { persist: true }, req.actor)),
  },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/assessments', handler: async (req) => ok(await CandidateIntelTemporalService.getCandidateAssessmentHistory(req.params.candidateId)) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/strengths', handler: async (req) => ok(await CandidateIntelligenceService.getCandidateStrengths(req.params.candidateId, req.query.constituencyId)) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/weaknesses', handler: async (req) => ok(await CandidateIntelligenceService.getCandidateWeaknesses(req.params.candidateId, req.query.constituencyId)) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/confidence', handler: async (req) => ok(await CandidateIntelligenceService.getCandidateConfidence(req.params.candidateId, req.query.constituencyId)) },
];

// ---- Comparison -------------------------------------------------------------
export const comparisonRoutes: Route[] = [
  {
    method: 'POST',
    path: '/api/candidate-intelligence/compare',
    handler: async (req) => {
      const parsed = v.compareSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid comparison request', parsed.error.flatten());
      return created(await CandidateComparisonService.compareCandidatesForConstituency(parsed.data.candidateEntityIds, parsed.data.constituencyEntityId, { weightConfigId: parsed.data.weightConfigId, title: parsed.data.title }, req.actor));
    },
  },
  { method: 'GET', path: '/api/candidate-intelligence/comparisons/:comparisonRunId/explain', handler: async (req) => { const r = await CandidateComparisonService.explainCandidateComparison(req.params.comparisonRunId); return r ? ok(r) : notFound('Comparison not found'); } },
  {
    method: 'POST',
    path: '/api/candidate-intelligence/comparisons/:comparisonRunId/decision',
    handler: async (req) => {
      const parsed = v.createSelectionDecisionSchema.safeParse(req.body);
      if (!parsed.success) return badRequest('Invalid decision', parsed.error.flatten());
      return created(await CandidateComparisonService.createSelectionDecision({ ...parsed.data, comparisonRunId: req.params.comparisonRunId }, req.actor));
    },
  },
];

// ---- Risks / vulnerabilities ------------------------------------------------
export const riskRoutes: Route[] = [
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/risks', handler: async (req) => ok(await CandidateRiskService.getCandidateRisks(req.params.candidateId)) },
  {
    method: 'POST',
    path: '/api/candidate-intelligence/candidates/:candidateId/risks',
    handler: async (req) => {
      const parsed = v.createRiskSchema.safeParse({ ...((req.body as object) ?? {}), candidateEntityId: req.params.candidateId });
      if (!parsed.success) return badRequest('Invalid risk', parsed.error.flatten());
      return created(await CandidateRiskService.createCandidateRisk(parsed.data, req.actor));
    },
  },
  { method: 'POST', path: '/api/candidate-intelligence/risks/:riskId/resolve', handler: async (req) => ok(await CandidateRiskService.resolveCandidateRisk(req.params.riskId, ((req.body as { resolution?: string })?.resolution) ?? 'resolved', req.actor)) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/vulnerabilities', handler: async (req) => ok(await CandidateRiskService.getCandidateVulnerabilities(req.params.candidateId, req.query.constituencyId)) },
  { method: 'POST', path: '/api/candidate-intelligence/candidates/:candidateId/detect-vulnerabilities', handler: async (req) => created(await CandidateRiskService.detectCandidateVulnerabilities(req.params.candidateId, req.query.constituencyId, true, req.actor)) },
  { method: 'GET', path: '/api/candidate-intelligence/risks/:riskId/explain', handler: async (req) => { const r = await CandidateExplanationService.explainCandidateRisk(req.params.riskId); return r ? ok(r) : notFound('Risk not found'); } },
];

// ---- Development ------------------------------------------------------------
export const developmentRoutes: Route[] = [
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/development-plan', handler: async (req) => ok(await CandidateDevelopmentService.getDevelopmentPlan(req.params.candidateId, req.query.constituencyId)) },
  {
    method: 'POST',
    path: '/api/candidate-intelligence/candidates/:candidateId/development-plan',
    handler: async (req) => {
      const parsed = v.createDevelopmentPlanSchema.safeParse({ ...((req.body as object) ?? {}), candidateEntityId: req.params.candidateId });
      if (!parsed.success) return badRequest('Invalid plan', parsed.error.flatten());
      return created(await CandidateDevelopmentService.createDevelopmentPlan(parsed.data.candidateEntityId, parsed.data.constituencyEntityId, { title: parsed.data.title, summary: parsed.data.summary, targetReadinessScore: parsed.data.targetReadinessScore, deadline: parsed.data.deadline, ownerUserId: parsed.data.ownerUserId }, req.actor));
    },
  },
  { method: 'POST', path: '/api/candidate-intelligence/development-actions/:actionId/complete', handler: async (req) => ok(await CandidateDevelopmentService.completeDevelopmentAction(req.params.actionId, ((req.body as { outcome?: string })?.outcome) ?? 'completed', req.actor)) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/development-progress', handler: async (req) => ok(await CandidateDevelopmentService.getDevelopmentProgress(req.params.candidateId, req.query.constituencyId)) },
];

// ---- Relationships ----------------------------------------------------------
export const relationshipRoutes: Route[] = [
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/relationships', handler: async (req) => ok(await CandidateRelationshipService.getCandidateRelationshipGraph(req.params.candidateId, intParam(req.query.depth, 1))) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/relationship-gaps', handler: async (req) => { if (!req.query.constituencyId) return badRequest('constituencyId is required'); return ok(await CandidateRelationshipService.getCandidateRelationshipGaps(req.params.candidateId, req.query.constituencyId)); } },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/stakeholder-coverage', handler: async (req) => { if (!req.query.constituencyId) return badRequest('constituencyId is required'); return ok(await CandidateRelationshipService.getCandidateStakeholderCoverage(req.params.candidateId, req.query.constituencyId)); } },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/faction-context', handler: async (req) => ok(await CandidateRelationshipService.getCandidateFactionRelationships(req.params.candidateId)) },
];

// ---- Temporal ---------------------------------------------------------------
export const temporalRoutes: Route[] = [
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/timeline', handler: async (req) => ok(await CandidateIntelTemporalService.getCandidateTimeline(req.params.candidateId)) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/trend', handler: async (req) => ok(await CandidateIntelTemporalService.getCandidateTrend(req.params.candidateId, req.query.constituencyId)) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/changes', handler: async (req) => ok(await CandidateIntelTemporalService.getCandidateChangesSince(req.params.candidateId, date(req.query.since))) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/as-of', handler: async (req) => { if (!req.query.constituencyId) return badRequest('constituencyId is required'); return ok(await CandidateIntelTemporalService.getCandidateAssessmentAsOf(req.params.candidateId, req.query.constituencyId, date(req.query.date))); } },
];

// ---- FPTP integration -------------------------------------------------------
export const fptpRoutes: Route[] = [
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/constituencies/:constituencyId/fptp-inputs', handler: async (req) => ok(await CandidateFPTPCompatibilityService.getCandidateFPTPInputs(req.params.candidateId, req.params.constituencyId)) },
  { method: 'POST', path: '/api/candidate-intelligence/candidates/:candidateId/constituencies/:constituencyId/send-to-fptp', handler: async (req) => ok(await CandidateFPTPCompatibilityService.getCandidateFPTPInputs(req.params.candidateId, req.params.constituencyId)) },
  { method: 'GET', path: '/api/candidate-intelligence/candidates/:candidateId/affected-fptp-scenarios', handler: async (req) => ok(await CandidateFPTPCompatibilityService.flagFPTPScenariosAffectedByCandidateChange(req.params.candidateId)) },
];

// ---- Explanations -----------------------------------------------------------
export const explanationRoutes: Route[] = [
  { method: 'GET', path: '/api/candidate-intelligence/assessments/:assessmentRunId/explain', handler: async (req) => { const r = await CandidateExplanationService.explainCandidateSeatAssessment(req.params.assessmentRunId); return r ? ok(r) : notFound('Assessment not found'); } },
  { method: 'GET', path: '/api/candidate-intelligence/actions/:actionId/explain', handler: async (req) => { const r = await CandidateExplanationService.explainCandidateRecommendation(req.params.actionId); return r ? ok(r) : notFound('Action not found'); } },
];

export const candidateIntelApiRoutes: Route[] = [
  ...profileRoutes,
  ...assessmentRoutes,
  ...comparisonRoutes,
  ...riskRoutes,
  ...developmentRoutes,
  ...relationshipRoutes,
  ...temporalRoutes,
  ...fptpRoutes,
  ...explanationRoutes,
];
