// =============================================================================
// rules.ts — deterministic temporal rules (brief §17, §6.6–6.8)
// -----------------------------------------------------------------------------
// Pure functions: they take already-fetched data and return computed temporal
// results plus *proposed* changes/risks/actions/observations. The services
// fetch inputs and persist outputs. No DB, no hidden state, fully explainable —
// every proposal carries the `rule` id and a `rationale`. No ML in the MVP.
// =============================================================================
import {
  RiskType,
  Severity,
  Likelihood,
  Urgency,
  RiskLinkRole,
  ActionType,
  ActionPriority,
  type Attitude,
  type InfluenceLevel,
} from '../ontology/enums.js';
import { ChangeType, TrendDirection } from './enums.js';
import type { ObservationPoint, DecayResult, CommitmentUrgency, FPTPStalenessResult } from './types.js';

export interface ProposedChange {
  rule: string;
  changeType: ChangeType;
  fieldName?: string;
  deltaNumeric?: number;
  rationale: string;
  significant: boolean;
}
export interface ProposedRisk {
  rule: string;
  riskType: RiskType;
  title: string;
  severity: Severity;
  likelihood: Likelihood;
  urgency: Urgency;
  rationale: string;
  links: { entityId: string; role: RiskLinkRole }[];
}
export interface ProposedAction {
  rule: string;
  title: string;
  actionType: ActionType;
  priority: ActionPriority;
  rationale: string;
  targetEntityId?: string;
}

const DAY = 24 * 60 * 60 * 1000;

// Decay day-bands (§6.7 / §17.1)
export const STALE_MILD_DAYS = 30;
export const STALE_DAYS = 90;
export const STALE_HIGH_DAYS = 180;

// Significance thresholds (§6.4 / §17.3)
export const SIGNIFICANT_SCORE_DELTA = 10;
export const CANDIDATE_FIT_SIGNIFICANT_DELTA = 8;
export const FPTP_MATERIAL_SCORE_DELTA = 10;

const HOSTILE_ATTITUDES = new Set(['HOSTILE', 'HOSTILE_TO', 'SCEPTICAL']);
const HIGH_INFLUENCE = new Set(['HIGH', 'CRITICAL']);

// -----------------------------------------------------------------------------
// Trend computation (§6.6)
// -----------------------------------------------------------------------------
export interface TrendComputation {
  direction: TrendDirection;
  magnitude: number;
  slopePerDay: number;
  volatility: number;
  first: ObservationPoint | null;
  last: ObservationPoint | null;
  n: number;
}

export function computeTrend(
  points: ObservationPoint[],
  opts: { higherIsBetter?: boolean; stableBand?: number; volatilityFactor?: number } = {},
): TrendComputation {
  const higherIsBetter = opts.higherIsBetter ?? true;
  const stableBand = opts.stableBand ?? 3; // score units within which we call it stable
  const volatilityFactor = opts.volatilityFactor ?? 1.5;

  const sorted = [...points].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const n = sorted.length;
  if (n < 2) {
    return { direction: TrendDirection.UNKNOWN, magnitude: 0, slopePerDay: 0, volatility: 0, first: sorted[0] ?? null, last: sorted[0] ?? null, n };
  }
  const first = sorted[0];
  const last = sorted[n - 1];
  const magnitude = last.value - first.value;
  const days = Math.max((last.observedAt.getTime() - first.observedAt.getTime()) / DAY, 1);
  const slopePerDay = magnitude / days;

  const deltas: number[] = [];
  for (let i = 1; i < n; i++) deltas.push(sorted[i].value - sorted[i - 1].value);
  const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const volatility = Math.sqrt(deltas.reduce((a, d) => a + (d - meanDelta) ** 2, 0) / deltas.length);

  let direction: TrendDirection;
  if (Math.abs(magnitude) <= stableBand && volatility <= stableBand) {
    direction = TrendDirection.STABLE;
  } else if (volatility > volatilityFactor * Math.abs(magnitude) && Math.abs(magnitude) <= stableBand * 2) {
    direction = TrendDirection.VOLATILE;
  } else {
    const rising = magnitude > 0;
    const good = higherIsBetter ? rising : !rising;
    direction = good ? TrendDirection.IMPROVING : TrendDirection.WORSENING;
  }
  return { direction, magnitude, slopePerDay, volatility, first, last, n };
}

// -----------------------------------------------------------------------------
// Relationship decay (§6.7 / §17.1)
// -----------------------------------------------------------------------------
export interface RelationshipDecayInput {
  relationshipId: string;
  targetEntityId: string;
  lastInteractionAt: Date | null;
  strength: number; // 1..5
  attitude: Attitude;
  influenceLevel: InfluenceLevel;
  hasOverdueCommitment: boolean;
  recentPositiveSignal?: boolean;
  recentHostileSignal?: boolean;
}

export function relationshipDecay(
  input: RelationshipDecayInput,
  now = Date.now(),
): { decay: DecayResult; risks: ProposedRisk[]; actions: ProposedAction[]; changes: ProposedChange[] } {
  const isHostile = HOSTILE_ATTITUDES.has(input.attitude as string);
  const highInfluence = HIGH_INFLUENCE.has(input.influenceLevel as string);
  const daysSince = input.lastInteractionAt == null ? null : Math.floor((now - input.lastInteractionAt.getTime()) / DAY);

  // Base staleness from days since interaction; high influence escalates faster.
  let staleness = 0;
  const d = daysSince ?? STALE_HIGH_DAYS + 1; // unknown last contact ⇒ treat as very stale
  if (d >= STALE_HIGH_DAYS) staleness = 90;
  else if (d >= STALE_DAYS) staleness = 65;
  else if (d >= STALE_MILD_DAYS) staleness = 35;
  else staleness = Math.max(0, (d / STALE_MILD_DAYS) * 20);
  if (highInfluence) staleness = Math.min(100, staleness * 1.2);
  if (input.hasOverdueCommitment) staleness = Math.min(100, staleness + 15);
  if (input.recentPositiveSignal) staleness = Math.max(0, staleness - 20);

  let decayScore = staleness;
  const risks: ProposedRisk[] = [];
  const actions: ProposedAction[] = [];
  const changes: ProposedChange[] = [];

  let band: DecayResult['band'];
  let rationale: string;
  let recommendedAction: string | undefined;

  if (isHostile) {
    // Hostile: lack of contact is NOT ordinary decay — it is unmanaged risk.
    band = 'UNMANAGED_HOSTILE';
    decayScore = Math.min(100, Math.max(decayScore, 60));
    rationale = `Hostile relationship with no recent constructive contact${daysSince != null ? ` (${daysSince}d)` : ''}; treat as unmanaged, not ordinary decay.`;
    recommendedAction = 'De-escalation / management plan';
    risks.push({
      rule: 'REL_UNMANAGED_HOSTILE',
      riskType: RiskType.RELATIONSHIP_RISK,
      title: 'Unmanaged hostile relationship',
      severity: highInfluence ? Severity.HIGH : Severity.MEDIUM,
      likelihood: Likelihood.LIKELY,
      urgency: Urgency.MEDIUM,
      rationale,
      links: [{ entityId: input.targetEntityId, role: RiskLinkRole.PRIMARY_SUBJECT }],
    });
  } else if (d >= STALE_DAYS && input.strength >= 4) {
    band = d >= STALE_HIGH_DAYS ? 'HIGH' : 'STALE';
    rationale = `High-value relationship (strength ${input.strength}/5) with no interaction for ${daysSince}d.`;
    recommendedAction = 'Follow up with contact';
    changes.push({ rule: 'REL_STALE', changeType: ChangeType.RELATIONSHIP_STALE, deltaNumeric: staleness, rationale, significant: true });
    risks.push({
      rule: 'REL_STALE_HIGH_VALUE',
      riskType: RiskType.RELATIONSHIP_RISK,
      title: 'High-value relationship has gone stale',
      severity: Severity.MEDIUM,
      likelihood: Likelihood.LIKELY,
      urgency: highInfluence ? Urgency.HIGH : Urgency.MEDIUM,
      rationale,
      links: [{ entityId: input.targetEntityId, role: RiskLinkRole.PRIMARY_SUBJECT }],
    });
    actions.push({ rule: 'REL_STALE_HIGH_VALUE', title: 'Follow up with high-value contact', actionType: ActionType.FOLLOW_UP, priority: highInfluence ? ActionPriority.HIGH : ActionPriority.MEDIUM, rationale, targetEntityId: input.targetEntityId });
  } else if (d >= STALE_HIGH_DAYS) {
    band = 'HIGH';
    rationale = `No interaction for ${daysSince}d.`;
    recommendedAction = 'Re-establish contact';
    actions.push({ rule: 'REL_STALE', title: 'Re-establish contact', actionType: ActionType.FOLLOW_UP, priority: ActionPriority.LOW, rationale, targetEntityId: input.targetEntityId });
  } else if (d >= STALE_MILD_DAYS) {
    band = 'MILD';
    rationale = `Mild staleness (${daysSince}d since last interaction).`;
  } else {
    band = 'FRESH';
    rationale = input.recentPositiveSignal ? 'Recent positive interaction; relationship fresh.' : `Recent interaction${daysSince != null ? ` (${daysSince}d)` : ''}.`;
  }

  if (input.recentHostileSignal && !isHostile) {
    changes.push({ rule: 'REL_HOSTILE_SIGNAL', changeType: ChangeType.ATTITUDE_WORSENED, rationale: 'Recent hostile public statement worsened attitude.', significant: true });
  }

  return {
    decay: {
      relationshipId: input.relationshipId,
      stalenessScore: Math.round(staleness),
      decayScore: Math.round(decayScore),
      daysSinceInteraction: daysSince,
      band,
      isHostile,
      hasOverdueCommitment: input.hasOverdueCommitment,
      rationale,
      recommendedAction,
    },
    risks,
    actions,
    changes,
  };
}

// -----------------------------------------------------------------------------
// Commitment urgency (§6.7)
// -----------------------------------------------------------------------------
export function commitmentUrgency(
  input: { commitmentId: string; status: string; dueAt: Date | null },
  now = Date.now(),
): CommitmentUrgency {
  const daysUntilDue = input.dueAt == null ? null : Math.ceil((input.dueAt.getTime() - now) / DAY);
  const overdue = (input.status === 'OVERDUE') || (daysUntilDue != null && daysUntilDue < 0 && input.status !== 'COMPLETED' && input.status !== 'CANCELLED');
  let urgency: CommitmentUrgency['urgency'] = 'LOW';
  if (overdue) urgency = 'IMMEDIATE';
  else if (daysUntilDue != null && daysUntilDue <= 3) urgency = 'HIGH';
  else if (daysUntilDue != null && daysUntilDue <= 14) urgency = 'MEDIUM';
  const rationale = overdue
    ? 'Commitment is overdue.'
    : daysUntilDue == null
    ? 'No due date set.'
    : `${daysUntilDue} day(s) until due.`;
  return { commitmentId: input.commitmentId, status: input.status as never, daysUntilDue, overdue, urgency, rationale };
}

// -----------------------------------------------------------------------------
// Significance + candidate movement (§6.4 / §17.3)
// -----------------------------------------------------------------------------
export function isSignificantChange(changeType: ChangeType, deltaNumeric?: number | null): boolean {
  const alwaysSignificant: ChangeType[] = [
    ChangeType.RISK_ESCALATED,
    ChangeType.RELATIONSHIP_STALE,
    ChangeType.FPTP_RECOMMENDATION_CHANGED,
    ChangeType.CANDIDATE_IMPROVED,
    ChangeType.CANDIDATE_DETERIORATED,
    ChangeType.COMPLIANCE_FLAG_ADDED,
    ChangeType.POLICY_RADIUS_EXPANDED,
    ChangeType.FACTION_BECAME_MORE_HOSTILE,
  ];
  if (alwaysSignificant.includes(changeType)) return true;
  if ((changeType === ChangeType.SCORE_INCREASED || changeType === ChangeType.SCORE_DECREASED) && deltaNumeric != null) {
    return Math.abs(deltaNumeric) >= SIGNIFICANT_SCORE_DELTA;
  }
  return false;
}

export function candidateMovement(oldFit: number, newFit: number): ProposedChange | null {
  const delta = newFit - oldFit;
  if (Math.abs(delta) < CANDIDATE_FIT_SIGNIFICANT_DELTA) return null;
  const improved = delta > 0;
  return {
    rule: improved ? 'CAND_IMPROVED' : 'CAND_DETERIORATED',
    changeType: improved ? ChangeType.CANDIDATE_IMPROVED : ChangeType.CANDIDATE_DETERIORATED,
    fieldName: 'overallFitScore',
    deltaNumeric: delta,
    rationale: `Candidate-seat fit moved ${delta > 0 ? '+' : ''}${delta.toFixed(1)} (from ${oldFit} to ${newFit}).`,
    significant: true,
  };
}

// -----------------------------------------------------------------------------
// FPTP staleness (§8.2 / §17.4)
// -----------------------------------------------------------------------------
export interface FPTPStalenessInput {
  fptpScenarioId: string;
  deltas: Partial<Record<
    | 'candidateSeatFit'
    | 'candidateRisk'
    | 'localAssociationSupport'
    | 'stakeholderCoverage'
    | 'constituencyCompetitiveness'
    | 'tacticalVotingRisk'
    | 'spoilerRisk'
    | 'localPartyStrength',
    number
  >>;
  majorLocalIssueGainedMomentum?: boolean;
  newPolicyImpactOnConstituency?: boolean;
  factionRiskEscalated?: boolean;
  newElectionOrPollingEvidence?: boolean;
}

export function fptpStaleness(input: FPTPStalenessInput): FPTPStalenessResult {
  const reasons: string[] = [];
  const staleAssumptions: string[] = [];
  const labels: Record<string, string> = {
    candidateSeatFit: 'candidate-seat fit',
    candidateRisk: 'candidate risk',
    localAssociationSupport: 'local association support',
    stakeholderCoverage: 'stakeholder coverage',
    constituencyCompetitiveness: 'constituency competitiveness',
    tacticalVotingRisk: 'tactical voting risk',
    spoilerRisk: 'spoiler risk',
    localPartyStrength: 'local party strength',
  };
  for (const [k, v] of Object.entries(input.deltas)) {
    if (v != null && Math.abs(v) >= FPTP_MATERIAL_SCORE_DELTA) {
      reasons.push(`${labels[k] ?? k} changed by ${v > 0 ? '+' : ''}${v}`);
      staleAssumptions.push(labels[k] ?? k);
    }
  }
  if (input.majorLocalIssueGainedMomentum) reasons.push('a major local issue gained momentum');
  if (input.newPolicyImpactOnConstituency) reasons.push('a new policy-radius impact affects the constituency');
  if (input.factionRiskEscalated) reasons.push('faction risk escalated');
  if (input.newElectionOrPollingEvidence) reasons.push('new election/polling evidence was added');

  const stale = reasons.length > 0;
  return { fptpScenarioId: input.fptpScenarioId, stale, reasons, staleAssumptions, recommendRerun: stale };
}

// -----------------------------------------------------------------------------
// Faction escalation (§17.6)
// -----------------------------------------------------------------------------
export function factionEscalation(
  input: { subjectEntityId: string; factionEntityId: string; factionName: string; hostileHighInfluenceOpponentsInWindow: number; overdueCommitmentToFactionMember: boolean },
): { risks: ProposedRisk[]; changes: ProposedChange[] } {
  const risks: ProposedRisk[] = [];
  const changes: ProposedChange[] = [];
  const escalate = input.hostileHighInfluenceOpponentsInWindow >= 2 || input.overdueCommitmentToFactionMember;
  if (escalate) {
    changes.push({ rule: 'FACTION_ESCALATION', changeType: ChangeType.FACTION_BECAME_MORE_HOSTILE, rationale: `${input.hostileHighInfluenceOpponentsInWindow} high-influence faction figures opposed within the window${input.overdueCommitmentToFactionMember ? '; an overdue commitment affects a faction member' : ''}.`, significant: true });
    risks.push({
      rule: 'FACTION_ESCALATION',
      riskType: RiskType.FACTION_RISK,
      title: `Escalating opposition from ${input.factionName}`,
      severity: Severity.HIGH,
      likelihood: Likelihood.LIKELY,
      urgency: Urgency.MEDIUM,
      rationale: 'Coordinated faction opposition or an unmet commitment to faction members.',
      links: [
        { entityId: input.subjectEntityId, role: RiskLinkRole.PRIMARY_SUBJECT },
        { entityId: input.factionEntityId, role: RiskLinkRole.CAUSE },
      ],
    });
  }
  return { risks, changes };
}

// -----------------------------------------------------------------------------
// Policy radius movement (§17.5)
// -----------------------------------------------------------------------------
export function policyRadiusMovement(
  input: { stakeholderAttitudeWorsened?: boolean; briefingCompleted?: boolean; complianceFlagAdded?: boolean; localIssueSalienceIncreased?: boolean },
): ProposedChange[] {
  const changes: ProposedChange[] = [];
  if (input.stakeholderAttitudeWorsened || input.localIssueSalienceIncreased) {
    changes.push({ rule: 'POLICY_RADIUS_EXPAND', changeType: ChangeType.POLICY_RADIUS_EXPANDED, rationale: input.localIssueSalienceIncreased ? 'A local issue gained salience in the target constituency.' : 'A stakeholder attitude worsened.', significant: true });
  }
  if (input.briefingCompleted) {
    changes.push({ rule: 'POLICY_BRIEFED', changeType: ChangeType.POLICY_RADIUS_REDUCED, rationale: 'A briefing was completed, reducing stakeholder risk.', significant: false });
  }
  if (input.complianceFlagAdded) {
    changes.push({ rule: 'POLICY_COMPLIANCE', changeType: ChangeType.COMPLIANCE_FLAG_ADDED, rationale: 'A compliance flag was added to the policy radius.', significant: true });
  }
  return changes;
}
