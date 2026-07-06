// =============================================================================
// rules.ts — deterministic MVP rules layer (§20)
// -----------------------------------------------------------------------------
// Pure functions: they take already-fetched data and return *proposed* actions,
// risks, and compliance restrictions. The service layer is responsible for
// fetching inputs and persisting outputs. Keeping rules pure makes them trivial
// to unit-test and keeps provenance explainable (every proposal carries a
// `rationale` and the `rule` id that produced it). No ML, no hidden state.
// =============================================================================
import {
  ActionType,
  ActionPriority,
  ApprovalRequirement,
  RiskType,
  Severity,
  Likelihood,
  Urgency,
  RiskLinkRole,
  Visibility,
  DataClassification,
  ComplianceFlagType,
  FPTPRecommendationLabel,
} from './enums.js';
import type { ActionType as TActionType } from './enums.js';

export interface ProposedAction {
  rule: string;
  title: string;
  actionType: TActionType;
  priority: ActionPriority;
  rationale: string;
  targetEntityId?: string;
  approvalRequirement?: ApprovalRequirement;
  expectedBenefit?: string;
  downsideIfIgnored?: string;
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

const STALE_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// Relationship rules
// -----------------------------------------------------------------------------
export interface RelationshipRuleInput {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  strength: number; // 1..5
  lastInteractionAt: Date | null;
  hasOwner: boolean;
}

export function relationshipRules(rel: RelationshipRuleInput, now = Date.now()): { actions: ProposedAction[]; risks: ProposedRisk[] } {
  const actions: ProposedAction[] = [];
  const risks: ProposedRisk[] = [];
  const cold = !rel.lastInteractionAt || rel.lastInteractionAt.getTime() < now - STALE_DAYS * DAY;

  // R1: strong relationship gone stale -> risk + follow-up
  if (rel.strength >= 4 && cold) {
    risks.push({
      rule: 'REL_STALE_HIGH_VALUE',
      riskType: RiskType.RELATIONSHIP_RISK,
      title: 'High-value relationship has gone stale',
      severity: Severity.MEDIUM,
      likelihood: Likelihood.LIKELY,
      urgency: Urgency.MEDIUM,
      rationale: `Relationship strength ${rel.strength}/5 with no interaction in over ${STALE_DAYS} days.`,
      links: [{ entityId: rel.targetEntityId, role: RiskLinkRole.PRIMARY_SUBJECT }],
    });
    actions.push({
      rule: 'REL_STALE_HIGH_VALUE',
      title: 'Follow up with high-value contact',
      actionType: ActionType.FOLLOW_UP,
      priority: ActionPriority.MEDIUM,
      rationale: `Re-establish contact; last interaction is older than ${STALE_DAYS} days.`,
      targetEntityId: rel.targetEntityId,
    });
  }

  // R2: no relationship owner -> assign owner
  if (!rel.hasOwner) {
    actions.push({
      rule: 'REL_NO_OWNER',
      title: 'Assign a relationship owner',
      actionType: ActionType.ASSIGN_RELATIONSHIP_OWNER,
      priority: ActionPriority.LOW,
      rationale: 'Relationship has no owner; accountability gap.',
      targetEntityId: rel.targetEntityId,
    });
  }
  return { actions, risks };
}

// -----------------------------------------------------------------------------
// Candidate rules
// -----------------------------------------------------------------------------
export interface CandidateRuleInput {
  candidateEntityId: string;
  localConnectionScore: number | null;
  localAssociationSupportScore: number | null;
  riskScore: number | null;
  issueCredibilityScore: number | null;
  highSalienceLocalIssue?: boolean;
}

export function candidateRules(c: CandidateRuleInput): { actions: ProposedAction[]; risks: ProposedRisk[] } {
  const actions: ProposedAction[] = [];
  const risks: ProposedRisk[] = [];

  if ((c.localConnectionScore ?? 100) < 40) {
    actions.push({
      rule: 'CAND_LOW_LOCAL_CONNECTION',
      title: 'Arrange local stakeholder meetings',
      actionType: ActionType.STRENGTHEN_LOCAL_LINKS,
      priority: ActionPriority.HIGH,
      rationale: 'Local connection score below threshold (40).',
      targetEntityId: c.candidateEntityId,
    });
  }
  if ((c.localAssociationSupportScore ?? 100) < 40) {
    actions.push({
      rule: 'CAND_LOW_ASSOCIATION_SUPPORT',
      title: 'Meet local association leadership',
      actionType: ActionType.MEET_LOCAL_ASSOCIATION,
      priority: ActionPriority.HIGH,
      rationale: 'Local association support score below threshold (40).',
      targetEntityId: c.candidateEntityId,
    });
  }
  if ((c.riskScore ?? 0) >= 60) {
    actions.push({
      rule: 'CAND_HIGH_RISK',
      title: 'Conduct vetting / mitigation review',
      actionType: ActionType.CONDUCT_VETTING,
      priority: ActionPriority.URGENT,
      rationale: 'Candidate risk score is high (>=60).',
      targetEntityId: c.candidateEntityId,
      approvalRequirement: ApprovalRequirement.SENIOR_REVIEW,
    });
    risks.push({
      rule: 'CAND_HIGH_RISK',
      riskType: RiskType.CANDIDATE_RISK,
      title: 'Candidate carries elevated risk',
      severity: Severity.HIGH,
      likelihood: Likelihood.POSSIBLE,
      urgency: Urgency.HIGH,
      rationale: 'Aggregate candidate risk score is high (>=60).',
      links: [{ entityId: c.candidateEntityId, role: RiskLinkRole.PRIMARY_SUBJECT }],
    });
  }
  if (c.highSalienceLocalIssue && (c.issueCredibilityScore ?? 100) < 40) {
    actions.push({
      rule: 'CAND_WEAK_ISSUE_CREDIBILITY',
      title: 'Develop credibility on high-salience local issue',
      actionType: ActionType.ADDRESS_VULNERABILITY,
      priority: ActionPriority.HIGH,
      rationale: 'Weak issue credibility on an issue with high local salience.',
      targetEntityId: c.candidateEntityId,
    });
  }
  return { actions, risks };
}

// -----------------------------------------------------------------------------
// Faction rules
// -----------------------------------------------------------------------------
export interface FactionRuleInput {
  subjectEntityId: string;
  factionEntityId: string;
  factionName: string;
  hostileHighInfluenceMembers: number;
  policyTouchesHostileFaction?: boolean;
}

export function factionRules(f: FactionRuleInput): { actions: ProposedAction[]; risks: ProposedRisk[] } {
  const actions: ProposedAction[] = [];
  const risks: ProposedRisk[] = [];
  if (f.hostileHighInfluenceMembers > 0) {
    risks.push({
      rule: 'FACTION_HOSTILE_HIGH_INFLUENCE',
      riskType: RiskType.FACTION_RISK,
      title: `Opposition from high-influence members of ${f.factionName}`,
      severity: Severity.HIGH,
      likelihood: Likelihood.LIKELY,
      urgency: Urgency.MEDIUM,
      rationale: `${f.hostileHighInfluenceMembers} high-influence faction member(s) are hostile.`,
      links: [
        { entityId: f.subjectEntityId, role: RiskLinkRole.PRIMARY_SUBJECT },
        { entityId: f.factionEntityId, role: RiskLinkRole.CAUSE },
      ],
    });
  }
  if (f.policyTouchesHostileFaction) {
    actions.push({
      rule: 'FACTION_POLICY_BROKER',
      title: `Consult broker for ${f.factionName}`,
      actionType: ActionType.CONSULT_FACTION_BROKER,
      priority: ActionPriority.MEDIUM,
      rationale: 'Policy affects an issue linked to a hostile faction.',
      targetEntityId: f.factionEntityId,
    });
  }
  return { actions, risks };
}

// -----------------------------------------------------------------------------
// FPTP rules
// -----------------------------------------------------------------------------
export interface FptpRuleInput {
  constituencyEntityId: string;
  candidateEntityId?: string;
  winProbability: number | null; // 0..1
  futureElectionValue: number | null; // 0..100
  strategicValue: number | null; // 0..100
  candidateFit: number | null; // 0..100
  seatStrategicallyImportant: boolean;
}

export function fptpRules(f: FptpRuleInput): { label: FPTPRecommendationLabel; rationale: string; actions: ProposedAction[] } {
  const wp = f.winProbability ?? 0;
  const future = f.futureElectionValue ?? 0;
  const strategic = f.strategicValue ?? 0;
  const fit = f.candidateFit ?? 0;
  const actions: ProposedAction[] = [];

  let label: FPTPRecommendationLabel = FPTPRecommendationLabel.GATHER_MORE_DATA;
  let rationale = 'Insufficient signal; gather more local data before committing resources.';

  if (wp < 0.25 && future >= 60) {
    label = FPTPRecommendationLabel.SYMBOLIC_RUN;
    rationale = 'Low win probability but high future-election value: run to build the seat.';
  } else if (wp < 0.25 && strategic < 40) {
    label = FPTPRecommendationLabel.DO_NOT_INVEST;
    rationale = 'Low win probability and low strategic value: do not invest.';
  } else if (fit < 40 && f.seatStrategicallyImportant) {
    label = FPTPRecommendationLabel.CHANGE_CANDIDATE;
    rationale = 'Weak candidate fit in a strategically important seat: change candidate or gather more data.';
    actions.push({
      rule: 'FPTP_WEAK_FIT_IMPORTANT_SEAT',
      title: 'Review candidate selection for strategic seat',
      actionType: ActionType.COMPARE_CANDIDATES,
      priority: ActionPriority.HIGH,
      rationale,
      targetEntityId: f.constituencyEntityId,
    });
  } else if (wp >= 0.5) {
    label = FPTPRecommendationLabel.COMPETE_HARD;
    rationale = 'Win probability is favourable: compete hard.';
  } else if (wp >= 0.25) {
    label = FPTPRecommendationLabel.COMPETE_SELECTIVELY;
    rationale = 'Competitive but uncertain: compete selectively with targeted resources.';
  }
  return { label, rationale, actions };
}

// -----------------------------------------------------------------------------
// Compliance rules
// -----------------------------------------------------------------------------
const SENSITIVE_CLASSIFICATIONS: DataClassification[] = [
  DataClassification.PERSONAL_DATA,
  DataClassification.SENSITIVE_PERSONAL_DATA,
  DataClassification.SPECIAL_CATEGORY_RISK,
  DataClassification.RESTRICTED,
  DataClassification.COMPLIANCE_ONLY,
];

/** Returns the visibility a piece of evidence should be forced to, if any. */
export function complianceVisibilityFor(classification: DataClassification): Visibility | null {
  if (classification === DataClassification.SPECIAL_CATEGORY_RISK || classification === DataClassification.COMPLIANCE_ONLY) {
    return Visibility.COMPLIANCE_ONLY;
  }
  if (SENSITIVE_CLASSIFICATIONS.includes(classification)) return Visibility.RESTRICTED;
  return null;
}

export function complianceFlagFor(classification: DataClassification): ComplianceFlagType | null {
  switch (classification) {
    case DataClassification.PERSONAL_DATA:
      return ComplianceFlagType.PERSONAL_DATA;
    case DataClassification.SENSITIVE_PERSONAL_DATA:
      return ComplianceFlagType.SENSITIVE_DATA;
    case DataClassification.SPECIAL_CATEGORY_RISK:
      return ComplianceFlagType.SPECIAL_CATEGORY_RISK;
    case DataClassification.INFERRED_DATA:
      return ComplianceFlagType.INFERRED_POLITICAL_OPINION;
    case DataClassification.RESTRICTED:
    case DataClassification.COMPLIANCE_ONLY:
      return ComplianceFlagType.RESTRICTED_SOURCE;
    default:
      return null;
  }
}

/** Whether an action that uses restricted data must be gated behind review. */
export function actionRequiresComplianceReview(usesRestrictedData: boolean): boolean {
  return usesRestrictedData;
}
