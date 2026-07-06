// =============================================================================
// rules.ts — deterministic relationship scoring + path/gap/action rules (§17,§18)
// -----------------------------------------------------------------------------
// Pure functions: services derive structured signals from the ontology +
// temporal graph, call these, and persist outputs. No black-box scoring (brief
// §25): every score carries drivers + rationale and is unit-tested.
// =============================================================================
import {
  Confidence,
  Severity,
  Attitude,
  InfluenceLevel,
  ActionType,
  ActionPriority,
} from '../ontology/enums.js';
import {
  RelationshipScoreType,
  RelationshipStatus,
  RelationshipGapType,
} from './enums.js';
import type {
  ScoreResult,
  StrengthSignals,
  TrustSignals,
  InfluenceSignals,
  AccessSignals,
  StrategicSignals,
  StalenessSignals,
  RepairabilitySignals,
  RelationshipRiskSignals,
  BriefingSignals,
  PathEdgeSignals,
  PathScore,
} from './types.js';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// Ordinal scale shared by influence / access / strategic / risk levels.
export const ORDINAL: Record<string, number> = { LOW: 25, MEDIUM: 50, HIGH: 75, CRITICAL: 100, UNKNOWN: 40 };
const ord = (lvl?: string) => (lvl ? ORDINAL[lvl] ?? 40 : 40);

// Decay day-bands (shared with the temporal layer).
export const STALE_MILD_DAYS = 30;
export const STALE_DAYS = 90;
export const STALE_HIGH_DAYS = 180;

const HOSTILE_ATTITUDES = new Set([Attitude.HOSTILE, Attitude.SCEPTICAL]);
const HIGH_INFLUENCE = new Set([InfluenceLevel.HIGH, InfluenceLevel.CRITICAL]);

interface Acc {
  score: number;
  drivers: string[];
}
function add(a: Acc, cond: boolean | undefined, pts: number, label: string) {
  if (!cond) return;
  a.score += pts;
  a.drivers.push(`${pts >= 0 ? '+' : ''}${pts} ${label}`);
}
function mk(scoreType: RelationshipScoreType, a: Acc, confidence: Confidence, missingData: string[] = []): ScoreResult {
  return { scoreType, value: Math.round(clamp(a.score)), confidence, rationale: `${scoreType.replace(/_/g, ' ').toLowerCase()} = ${Math.round(clamp(a.score))}/100`, drivers: a.drivers, missingData };
}

// -----------------------------------------------------------------------------
// 17.1 Strength
// -----------------------------------------------------------------------------
export function scoreStrength(s: StrengthSignals, confidence: Confidence = Confidence.LOW): ScoreResult {
  const a: Acc = { score: (s.currentStrength ?? 3) * 20, drivers: [`base strength ${s.currentStrength ?? 3}/5`] };
  add(a, s.recentMeeting, 10, 'recent meeting');
  add(a, (s.interactionCount ?? 0) >= 3, 8, 'multiple interactions');
  add(a, s.humanConfirmed, 10, 'human-confirmed');
  add(a, s.successfulCollaboration, 8, 'successful collaboration');
  add(a, s.commitmentFulfilled, 8, 'commitment fulfilled');
  add(a, s.positiveEvidence, 6, 'positive evidence');
  add(a, (s.daysSinceInteraction ?? 0) > STALE_DAYS, -12, 'long inactivity');
  add(a, s.missedFollowUp, -8, 'missed follow-up');
  add(a, s.hostileStatement, -15, 'hostile statement');
  add(a, s.unresolvedConflict, -12, 'unresolved conflict');
  add(a, s.uncertain, -6, 'uncertain');
  add(a, s.oldEvidence, -6, 'old evidence');
  return mk(RelationshipScoreType.RELATIONSHIP_STRENGTH, a, confidence);
}

// -----------------------------------------------------------------------------
// 17.2 Trust
// -----------------------------------------------------------------------------
export function scoreTrust(s: TrustSignals, confidence: Confidence = Confidence.LOW): ScoreResult {
  const a: Acc = { score: (s.currentTrust ?? 3) * 20, drivers: [`base trust ${s.currentTrust ?? 3}/5`] };
  add(a, !!s.commitmentsFulfilled, Math.min((s.commitmentsFulfilled ?? 0) * 6, 18), 'commitments fulfilled');
  add(a, s.positiveOutcome, 8, 'positive meeting outcome');
  add(a, s.supportiveStatement, 8, 'supportive statement');
  add(a, s.reliableFollowThrough, 8, 'reliable follow-through');
  add(a, s.ownerConfirmsTrust, 6, 'owner confirms trust');
  add(a, s.brokenCommitment, -18, 'broken commitment');
  add(a, s.hostileAction, -15, 'hostile action');
  add(a, s.leakRisk, -12, 'leak risk');
  add(a, s.conflict, -10, 'conflict');
  add(a, s.unresolvedGrievance, -10, 'unresolved grievance');
  add(a, s.contradictoryEvidence, -8, 'contradictory evidence');
  return mk(RelationshipScoreType.TRUST, a, confidence);
}

// -----------------------------------------------------------------------------
// 17.3 Influence (context-aware)
// -----------------------------------------------------------------------------
export function scoreInfluence(s: InfluenceSignals, confidence: Confidence = Confidence.LOW): ScoreResult {
  const a: Acc = { score: ord(s.influenceLevel), drivers: [`base influence ${s.influenceLevel ?? 'UNKNOWN'}`] };
  add(a, s.formalRole, 15, 'holds formal role');
  add(a, s.controlsAccess, 15, 'controls access');
  add(a, s.connectedToManyRelevant, 10, 'connected to many relevant actors');
  add(a, s.keyToFactionOrAssociation, 10, 'key to faction/association');
  add(a, s.affectsContext, 10, 'affects this context');
  return mk(RelationshipScoreType.INFLUENCE, a, confidence);
}

// -----------------------------------------------------------------------------
// Access value
// -----------------------------------------------------------------------------
export function scoreAccessValue(s: AccessSignals, confidence: Confidence = Confidence.LOW): ScoreResult {
  const a: Acc = { score: 20, drivers: [] };
  add(a, s.controlsAccessToTarget, 35, 'controls access to target');
  add(a, s.isGatekeeper, 20, 'gatekeeper');
  add(a, s.brokerForTarget, 25, 'broker for target');
  add(a, s.directRelationshipToTarget, 15, 'direct relationship to target');
  add(a, HIGH_INFLUENCE.has(s.influenceLevel as never), 10, 'high influence');
  return mk(RelationshipScoreType.ACCESS_VALUE, a, confidence);
}

// -----------------------------------------------------------------------------
// 17.4 Strategic value
// -----------------------------------------------------------------------------
export function scoreStrategicValue(s: StrategicSignals, confidence: Confidence = Confidence.LOW): ScoreResult {
  const a: Acc = { score: 10, drivers: [] };
  add(a, s.affectsCandidateSelection, 18, 'affects candidate selection');
  add(a, s.affectsFPTP, 16, 'affects FPTP strategy');
  add(a, s.affectsPolicyLaunch, 12, 'affects policy launch');
  add(a, s.affectsFactionRisk, 12, 'affects faction risk');
  add(a, s.affectsLocalAssociationSupport, 12, 'affects local association support');
  add(a, s.affectsStakeholderSupport, 10, 'affects stakeholder support');
  add(a, s.affectsMediaRisk, 8, 'affects media risk');
  add(a, s.affectsComplianceDecision, 8, 'affects compliance decision');
  return mk(RelationshipScoreType.STRATEGIC_VALUE, a, confidence);
}

// -----------------------------------------------------------------------------
// 17.5 Staleness (higher = more stale/worse)
// -----------------------------------------------------------------------------
export function scoreStaleness(s: StalenessSignals, confidence: Confidence = Confidence.LOW): ScoreResult {
  const d = s.daysSinceInteraction ?? STALE_HIGH_DAYS + 1;
  let base: number;
  if (d >= STALE_HIGH_DAYS) base = 85;
  else if (d >= STALE_DAYS) base = 60;
  else if (d >= STALE_MILD_DAYS) base = 35;
  else base = Math.max(0, (d / STALE_MILD_DAYS) * 20);
  const a: Acc = { score: base, drivers: [`${s.daysSinceInteraction ?? '?'}d since interaction`] };
  if (HIGH_INFLUENCE.has(s.influenceLevel as never)) { a.score = clamp(a.score * 1.15); a.drivers.push('high-influence escalation'); }
  add(a, s.overdueCommitment, 15, 'overdue commitment');
  add(a, s.highValueNoOwner, 10, 'high-value, no owner');
  add(a, s.oldEvidence, 6, 'old evidence');
  add(a, s.recentInteraction, -25, 'recent interaction');
  add(a, s.commitmentFulfilled, -8, 'commitment fulfilled');
  add(a, s.ownerConfirmed, -8, 'owner confirmed');
  add(a, s.newEvidence, -8, 'new evidence');
  return mk(RelationshipScoreType.STALENESS, a, confidence);
}

// -----------------------------------------------------------------------------
// Repairability
// -----------------------------------------------------------------------------
export function scoreRepairability(s: RepairabilitySignals, confidence: Confidence = Confidence.LOW): ScoreResult {
  const a: Acc = { score: 40, drivers: [] };
  add(a, s.contactable, 15, 'contactable');
  add(a, s.brokerExists, 18, 'broker exists');
  add(a, s.pastPositiveHistory, 15, 'past positive history');
  add(a, s.willingness, 12, 'willingness to engage');
  add(a, s.fatalBreach, -40, 'fatal breach');
  add(a, s.repeatedHostility, -20, 'repeated hostility');
  return mk(RelationshipScoreType.REPAIRABILITY, a, confidence);
}

// -----------------------------------------------------------------------------
// 17.6 Relationship risk (higher = worse)
// -----------------------------------------------------------------------------
export function scoreRelationshipRisk(s: RelationshipRiskSignals, confidence: Confidence = Confidence.LOW): ScoreResult {
  const a: Acc = { score: 5, drivers: [] };
  const hostile = HOSTILE_ATTITUDES.has(s.attitude as never);
  const highInf = HIGH_INFLUENCE.has(s.influenceLevel as never);
  add(a, hostile, 22, 'hostile attitude');
  add(a, hostile && highInf, 15, 'hostile + high influence');
  add(a, s.unresolvedCommitment, 12, 'unresolved commitment');
  add(a, s.staleHighValue, 12, 'stale high-value relationship');
  add(a, s.sensitiveData, 10, 'sensitive data');
  add(a, s.factionLink, 8, 'faction link');
  add(a, s.donorLink, 10, 'donor link');
  add(a, s.complianceFlag, 16, 'compliance flag');
  add(a, s.candidateOrPolicyOrFptpDependency, 10, 'candidate/policy/FPTP dependency');
  return mk(RelationshipScoreType.RISK, a, confidence);
}

// -----------------------------------------------------------------------------
// 17.7 Briefing priority
// -----------------------------------------------------------------------------
export function scoreBriefingPriority(s: BriefingSignals, confidence: Confidence = Confidence.LOW): ScoreResult {
  const a: Acc = { score: 10, drivers: [] };
  add(a, s.policyAffectsStakeholder, 18, 'policy affects stakeholder');
  add(a, s.candidateSelectionAffectsActor, 14, 'candidate selection affects actor');
  add(a, s.fptpAffectsLocalStakeholders, 12, 'FPTP decision affects local stakeholders');
  add(a, s.highInfluence, 16, 'high influence');
  add(a, s.attitudeUnknownOrHostile, 12, 'attitude unknown/hostile');
  add(a, s.priorCommitment, 10, 'prior commitment exists');
  add(a, s.expectsConsultation, 10, 'expects consultation');
  add(a, s.factionSensitiveIssue, 10, 'faction-sensitive issue');
  return mk(RelationshipScoreType.BRIEFING_PRIORITY, a, confidence);
}

// -----------------------------------------------------------------------------
// Status derivation
// -----------------------------------------------------------------------------
export function deriveStatus(input: { attitude?: Attitude; stalenessScore: number; riskScore: number; repairabilityScore?: number; sensitive?: boolean; archived?: boolean }): RelationshipStatus {
  if (input.archived) return RelationshipStatus.ARCHIVED;
  if (input.sensitive) return RelationshipStatus.SENSITIVE;
  if (HOSTILE_ATTITUDES.has(input.attitude as never)) {
    return (input.repairabilityScore ?? 50) >= 50 ? RelationshipStatus.NEEDS_REPAIR : RelationshipStatus.HOSTILE;
  }
  if (input.stalenessScore >= 60) return RelationshipStatus.STALE;
  if (input.attitude === Attitude.UNKNOWN) return RelationshipStatus.UNKNOWN;
  return RelationshipStatus.ACTIVE;
}

// -----------------------------------------------------------------------------
// Access path scoring (§8.7)
// -----------------------------------------------------------------------------
export function scoreAccessPath(edges: PathEdgeSignals[]): PathScore {
  if (!edges.length) return { pathQualityScore: 0, pathRiskScore: 0, blocked: true, rationale: 'empty path' };
  const blocked = edges.some((e) => e.restricted);
  let qualitySum = 0;
  let risk = 0;
  for (const e of edges) {
    const strength = (e.strength ?? 3) * 20;
    const trust = (e.trustLevel ?? 3) * 20;
    const conf = ORDINAL[e.confidence === Confidence.CONFIRMED ? 'CRITICAL' : e.confidence] ?? 40;
    const recencyPenalty = (e.daysSinceInteraction ?? 0) > STALE_DAYS ? 20 : 0;
    qualitySum += clamp((strength * 0.4 + trust * 0.3 + conf * 0.3) - recencyPenalty);
    if (HOSTILE_ATTITUDES.has(e.attitude as never)) risk += 30;
    if (e.restricted) risk += 40;
    if (e.inferred) risk += 10;
  }
  // Average edge quality, then discount for path length (longer paths are weaker).
  const avgQuality = qualitySum / edges.length;
  const lengthDiscount = Math.max(0, (edges.length - 1) * 12);
  const pathQualityScore = Math.round(clamp(avgQuality - lengthDiscount));
  const pathRiskScore = Math.round(clamp(risk));
  const rationale = blocked
    ? 'Path blocked: passes through a restricted/sensitive relationship.'
    : `Path of length ${edges.length}; quality ${pathQualityScore}, risk ${pathRiskScore}.`;
  return { pathQualityScore, pathRiskScore, blocked, rationale };
}

// -----------------------------------------------------------------------------
// Gap classification + severity
// -----------------------------------------------------------------------------
export function gapSeverity(gapType: RelationshipGapType, highInfluence: boolean): Severity {
  switch (gapType) {
    case RelationshipGapType.HOSTILE_RELATIONSHIP:
      return highInfluence ? Severity.HIGH : Severity.MEDIUM;
    case RelationshipGapType.NO_RELATIONSHIP:
    case RelationshipGapType.NO_RELATIONSHIP_OWNER:
      return highInfluence ? Severity.HIGH : Severity.MEDIUM;
    case RelationshipGapType.UNRESOLVED_COMMITMENT:
      return Severity.HIGH;
    case RelationshipGapType.STALE_RELATIONSHIP:
    case RelationshipGapType.WEAK_RELATIONSHIP:
      return highInfluence ? Severity.MEDIUM : Severity.LOW;
    case RelationshipGapType.UNKNOWN_ATTITUDE:
    case RelationshipGapType.NO_RECENT_BRIEFING:
      return Severity.MEDIUM;
    case RelationshipGapType.LOW_CONFIDENCE_DATA:
      return Severity.LOW;
    default:
      return Severity.MEDIUM;
  }
}

// -----------------------------------------------------------------------------
// Recommendation rules (§18)
// -----------------------------------------------------------------------------
export interface ProposedAction {
  title: string;
  actionType: ActionType;
  priority: ActionPriority;
  rationale: string;
  targetEntityId?: string;
  relationshipId?: string;
}

export function relationshipActions(input: {
  relationshipId?: string;
  targetEntityId?: string;
  stalenessScore: number;
  riskScore: number;
  strategicValue: number;
  attitude?: Attitude;
  repairabilityScore?: number;
  hasOwner?: boolean;
  hasOverdueCommitment?: boolean;
  lowConfidenceHighImpact?: boolean;
  briefingPriority?: number;
}): ProposedAction[] {
  const out: ProposedAction[] = [];
  const high = input.strategicValue >= 60;
  const hostile = HOSTILE_ATTITUDES.has(input.attitude as never);

  // 18.1 follow-up
  if (input.stalenessScore >= 60 && high) out.push({ title: 'Follow up with high-value contact', actionType: ActionType.FOLLOW_UP, priority: ActionPriority.HIGH, rationale: 'High-value relationship has gone stale.', targetEntityId: input.targetEntityId, relationshipId: input.relationshipId });
  if (input.hasOverdueCommitment) out.push({ title: 'Close overdue commitment', actionType: ActionType.FOLLOW_UP, priority: ActionPriority.HIGH, rationale: 'Open commitment is overdue.', targetEntityId: input.targetEntityId, relationshipId: input.relationshipId });
  // 18.2 repair
  if (hostile && high && (input.repairabilityScore ?? 0) >= 50) out.push({ title: 'Repair relationship', actionType: ActionType.REPAIR_RELATIONSHIP, priority: ActionPriority.HIGH, rationale: 'Hostile but repairable high-value relationship.', targetEntityId: input.targetEntityId, relationshipId: input.relationshipId });
  // 18.3 briefing
  if ((input.briefingPriority ?? 0) >= 55) out.push({ title: 'Brief stakeholder', actionType: ActionType.BRIEF, priority: ActionPriority.MEDIUM, rationale: 'High briefing priority.', targetEntityId: input.targetEntityId, relationshipId: input.relationshipId });
  // 18.4 assign owner
  if (high && input.hasOwner === false) out.push({ title: 'Assign relationship owner', actionType: ActionType.ASSIGN_RELATIONSHIP_OWNER, priority: ActionPriority.MEDIUM, rationale: 'High-value relationship has no owner.', targetEntityId: input.targetEntityId, relationshipId: input.relationshipId });
  // 18.5 verify
  if (input.lowConfidenceHighImpact) out.push({ title: 'Verify relationship evidence', actionType: ActionType.GATHER_LOCAL_DATA, priority: ActionPriority.MEDIUM, rationale: 'Low-confidence but high-impact relationship.', targetEntityId: input.targetEntityId, relationshipId: input.relationshipId });
  // 18.6 consult broker
  if (hostile && (input.repairabilityScore ?? 0) < 50 && high) out.push({ title: 'Consult broker for access', actionType: ActionType.CONSULT_FACTION_BROKER, priority: ActionPriority.MEDIUM, rationale: 'Direct repair unlikely; route via a broker.', targetEntityId: input.targetEntityId, relationshipId: input.relationshipId });
  return out;
}
