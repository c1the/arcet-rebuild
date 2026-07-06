// =============================================================================
// risk.service.ts — candidate risk + vulnerability handling (brief §10.4)
// -----------------------------------------------------------------------------
// Risks live in the ontology Risk model (riskType CANDIDATE_RISK etc.) linked to
// the candidate. Vulnerabilities are candidate-intelligence specific
// (CandidateVulnerability). Detection derives vulnerabilities from the signal
// bundle; mitigation actions go through the ontology ActionService.
// =============================================================================
import { prisma } from '../ontology/db.js';
import { AuditService } from '../ontology/audit.service.js';
import { RiskService } from '../ontology/risk.service.js';
import { ActionService } from '../ontology/action.service.js';
import { Confidence, Likelihood, RiskLinkRole, RiskType, Severity, Urgency, ActionType, ActionPriority } from '../ontology/enums.js';
import { ChangeService } from '../temporal/change.service.js';
import { TrendService } from '../temporal/trend.service.js';
import { ObservationType } from '../temporal/enums.js';
import { CandidateScoringService } from './scoring.service.js';
import { CandidateVulnerabilityType, CandidateVulnerabilityStatus } from './enums.js';
import type { ActorContext, DetectedVulnerability, UUID } from './types.js';

export const CandidateRiskService = {
  async getCandidateRisks(candidateEntityId: UUID) {
    const links = await prisma.riskLink.findMany({ where: { entityId: candidateEntityId }, include: { risk: true } });
    return links.map((l) => ({ role: l.role, risk: l.risk }));
  },

  /** Derive candidate vulnerabilities from the signal bundle (brief §5.9, §11.9). */
  async detectCandidateVulnerabilities(candidateEntityId: UUID, constituencyEntityId?: UUID, persist = true, actor?: ActorContext): Promise<DetectedVulnerability[]> {
    const { bundle } = await CandidateScoringService.deriveSignals(candidateEntityId, constituencyEntityId);
    const out: DetectedVulnerability[] = [];
    if (bundle.risk.unresolvedVetting) out.push({ vulnerabilityType: CandidateVulnerabilityType.VETTING, title: 'Unresolved vetting', description: 'Vetting is incomplete before selection.', severity: Severity.HIGH, likelihood: Likelihood.LIKELY, rationale: 'Vetting status not cleared.' });
    if (bundle.media.unresolvedMediaVulnerability) out.push({ vulnerabilityType: CandidateVulnerabilityType.MEDIA, title: 'Media vulnerability', description: 'Unresolved media exposure / weak readiness.', severity: Severity.MEDIUM, likelihood: Likelihood.POSSIBLE, rationale: 'Low media readiness signal.' });
    if (bundle.faction.highInfluenceOpposition) out.push({ vulnerabilityType: CandidateVulnerabilityType.FACTIONAL, title: 'Factional opposition', description: 'High-influence faction figures oppose the candidate.', severity: Severity.HIGH, likelihood: Likelihood.LIKELY, rationale: 'Hostile high-influence faction link.' });
    if (bundle.issueCredibility.contradictoryStatements || bundle.issueCredibility.policyRadiusRisk) out.push({ vulnerabilityType: CandidateVulnerabilityType.POLICY_CONTRADICTION, title: 'Policy contradiction risk', description: 'Past statements may contradict current policy.', severity: Severity.MEDIUM, likelihood: Likelihood.POSSIBLE, rationale: 'Contradiction / policy-radius signal.' });
    if (bundle.localConnection.localAssociationHostility) out.push({ vulnerabilityType: CandidateVulnerabilityType.LOCAL_CREDIBILITY, title: 'Local credibility gap', description: 'Local association hostility undermines credibility.', severity: Severity.MEDIUM, likelihood: Likelihood.POSSIBLE, rationale: 'Local association hostility signal.' });

    if (persist) {
      for (const v of out) {
        await prisma.candidateVulnerability.create({
          data: { candidateEntityId, constituencyEntityId, vulnerabilityType: v.vulnerabilityType, title: v.title, description: v.description, severity: v.severity, likelihood: v.likelihood, confidence: Confidence.LOW, status: CandidateVulnerabilityStatus.OPEN },
        });
      }
    }
    return out;
  },

  async createCandidateRisk(input: { candidateEntityId: UUID; constituencyEntityId?: UUID; title: string; description?: string; severity?: Severity; likelihood?: Likelihood; rationale?: string }, actor?: ActorContext) {
    const risk = await RiskService.createRisk(
      {
        riskType: RiskType.CANDIDATE_RISK,
        title: input.title,
        description: input.description,
        severity: input.severity ?? Severity.MEDIUM,
        likelihood: input.likelihood ?? Likelihood.POSSIBLE,
        urgency: Urgency.MEDIUM,
        sourceModule: 'candidate-intelligence',
        rationale: input.rationale,
        links: [{ entityId: input.candidateEntityId, role: RiskLinkRole.PRIMARY_SUBJECT }, ...(input.constituencyEntityId ? [{ entityId: input.constituencyEntityId, role: RiskLinkRole.AFFECTED }] : [])],
      },
      actor,
    );
    await ChangeService.recordChange({ entityId: input.candidateEntityId, riskId: risk.id, changeType: 'RISK_ESCALATED' as never, fieldName: 'risk', rationale: `New candidate risk: ${input.title}`, significant: (input.severity === Severity.HIGH || input.severity === Severity.CRITICAL), sourceModule: 'candidate-intelligence' }, actor);
    return risk;
  },

  async escalateCandidateRisk(riskId: UUID, rationale: string, actor?: ActorContext) {
    const before = await prisma.risk.findUnique({ where: { id: riskId } });
    const order = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL];
    const next = order[Math.min(order.indexOf((before?.severity as Severity) ?? Severity.MEDIUM) + 1, order.length - 1)];
    const risk = await RiskService.updateRisk(riskId, { severity: next } as never, actor);
    await ChangeService.recordChange({ riskId, changeType: 'RISK_ESCALATED' as never, oldValue: before?.severity, newValue: next, rationale, significant: true, sourceModule: 'candidate-intelligence' }, actor);
    return risk;
  },

  async deescalateCandidateRisk(riskId: UUID, rationale: string, actor?: ActorContext) {
    const before = await prisma.risk.findUnique({ where: { id: riskId } });
    const order = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL];
    const next = order[Math.max(order.indexOf((before?.severity as Severity) ?? Severity.MEDIUM) - 1, 0)];
    const risk = await RiskService.updateRisk(riskId, { severity: next } as never, actor);
    await ChangeService.recordChange({ riskId, changeType: 'RISK_DEESCALATED' as never, oldValue: before?.severity, newValue: next, rationale, significant: false, sourceModule: 'candidate-intelligence' }, actor);
    return risk;
  },

  async resolveCandidateRisk(riskId: UUID, resolution: string, actor?: ActorContext) {
    const risk = await RiskService.resolveRisk(riskId, actor);
    await ChangeService.recordChange({ riskId, changeType: 'RISK_DEESCALATED' as never, fieldName: 'status', newValue: 'RESOLVED', rationale: resolution, significant: true, sourceModule: 'candidate-intelligence' }, actor);
    return risk;
  },

  async getCandidateRiskTrend(candidateEntityId: UUID) {
    return TrendService.calculateTrend(candidateEntityId, ObservationType.CANDIDATE_RISK);
  },

  /** Generate (and persist) risk-mitigation actions (brief §12.2). */
  async generateRiskMitigationActions(candidateEntityId: UUID, constituencyEntityId?: UUID, actor?: ActorContext) {
    const { bundle } = await CandidateScoringService.deriveSignals(candidateEntityId, constituencyEntityId);
    const actions = [];
    if (bundle.risk.unresolvedVetting) actions.push({ title: 'Complete vetting / due diligence', actionType: ActionType.CONDUCT_VETTING, priority: ActionPriority.HIGH, rationale: 'Vetting unresolved.' });
    if (bundle.risk.complianceFlag) actions.push({ title: 'Escalate to compliance review', actionType: ActionType.ESCALATE_COMPLIANCE_REVIEW, priority: ActionPriority.URGENT, rationale: 'Compliance flag present.' });
    if (bundle.media.unresolvedMediaVulnerability) actions.push({ title: 'Prepare rebuttal / media lines', actionType: ActionType.PREPARE_REBUTTAL, priority: ActionPriority.MEDIUM, rationale: 'Media vulnerability.' });
    if (bundle.faction.highInfluenceOpposition) actions.push({ title: 'Consult faction broker', actionType: ActionType.CONSULT_FACTION_BROKER, priority: ActionPriority.MEDIUM, rationale: 'Faction opposition.' });
    const created = [];
    for (const a of actions) created.push(await ActionService.createRecommendation({ title: a.title, actionType: a.actionType, priority: a.priority, targetEntityId: candidateEntityId, sourceModule: 'candidate-intelligence', rationale: a.rationale }, actor));
    return created;
  },

  async getCandidateVulnerabilities(candidateEntityId: UUID, constituencyEntityId?: UUID) {
    return prisma.candidateVulnerability.findMany({ where: { candidateEntityId, ...(constituencyEntityId ? { constituencyEntityId } : {}) }, orderBy: { createdAt: 'desc' } });
  },
};
