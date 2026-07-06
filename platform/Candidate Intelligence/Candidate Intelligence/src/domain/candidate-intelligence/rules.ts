// =============================================================================
// rules.ts — deterministic candidate-intelligence scoring (brief §7, §11, §12)
// -----------------------------------------------------------------------------
// Pure functions only. Services fetch ontology/temporal data, pass structured
// signals here, and persist the outputs. No black box (brief §0/§25): every
// dimension score carries positive/negative drivers; the blend, confidence,
// recommendation label, comparison ranking, material-change thresholds and
// action triggers are all explicit and unit-tested.
// =============================================================================
import {
  Confidence,
  Severity,
  ActionType,
  ActionPriority,
  type Likelihood,
} from '../ontology/enums.js';
import { ChangeType } from '../temporal/enums.js';
import {
  CandidateDimensionType as D,
  CandidateOverallRecommendation as Rec,
  CandidateComparisonRecommendationLabel as CmpLabel,
} from './enums.js';
import type {
  WeightConfig,
  DimensionResult,
  DimensionScores,
  EvidenceQuality,
  ExperienceSignals,
  LocalConnectionSignals,
  StakeholderCoverageSignals,
  LocalAssociationSignals,
  FactionSignals,
  IssueCredibilitySignals,
  MediaSignals,
  CampaignCapacitySignals,
  RiskSignals,
  DevelopmentSignals,
  ComparisonEntryResult,
} from './types.js';

// Default candidate-seat-fit weights (brief §7.1). Positive weights sum to 100;
// risk is applied as a negative discount.
export const DEFAULT_WEIGHTS: WeightConfig = {
  politicalExperienceWeight: 10,
  localConnectionWeight: 18,
  stakeholderCoverageWeight: 14,
  localAssociationSupportWeight: 14,
  factionAcceptabilityWeight: 10,
  issueCredibilityWeight: 10,
  mediaReadinessWeight: 8,
  campaignCapacityWeight: 8,
  riskProfileWeight: -12,
  developmentPotentialWeight: 8,
};

// Material-change thresholds (brief §8.4).
export const MATERIAL_OVERALL_DELTA = 10;
export const MATERIAL_RISK_DELTA = 10;
export const MATERIAL_LOCAL_ASSOC_DELTA = 15;
export const MATERIAL_FACTION_DELTA = 15;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const sev = (s: Severity): number => ({ LOW: 6, MEDIUM: 14, HIGH: 26, CRITICAL: 40 }[s] ?? 0);

interface Acc {
  score: number;
  pos: string[];
  neg: string[];
}
function add(a: Acc, cond: boolean | undefined, pts: number, label: string) {
  if (!cond) return;
  a.score += pts;
  (pts >= 0 ? a.pos : a.neg).push(label);
}
function mk(dim: DimensionResult['dimensionType'], a: Acc, confidence: Confidence, missingData: string[] = [], evidenceIds: string[] = []): DimensionResult {
  return {
    dimensionType: dim,
    score: Math.round(clamp(a.score)),
    confidence,
    rationale: `${dim.replace(/_/g, ' ').toLowerCase()} = ${Math.round(clamp(a.score))}/100`,
    positiveDrivers: a.pos,
    negativeDrivers: a.neg,
    evidenceIds,
    missingData,
  };
}

// -----------------------------------------------------------------------------
// Dimension scorers (brief §11). Each returns a 0..100 DimensionResult.
// -----------------------------------------------------------------------------
export function scorePoliticalExperience(s: ExperienceSignals, confidence: Confidence = Confidence.LOW): DimensionResult {
  const a: Acc = { score: 25, pos: [], neg: [] };
  add(a, s.priorElectedOffice, 18, 'prior elected office');
  add(a, s.parliamentaryExperience, 14, 'parliamentary experience');
  add(a, s.councilExperience, 10, 'council experience');
  add(a, s.partyRole, 8, 'party role');
  add(a, s.campaignLeadership, 12, 'campaign leadership');
  add(a, s.publicSectorExperience, 8, 'public-sector experience');
  add(a, s.leadershipExperience, 8, 'leadership experience');
  add(a, s.strongPublicSpeaking, 6, 'strong public speaking');
  add(a, s.previousCandidacy, 8, 'previous candidacy');
  add(a, s.noPoliticalExperience, -30, 'no political experience');
  add(a, s.failedPriorCampaignUnmitigated, -12, 'failed prior campaign (unmitigated)');
  add(a, s.poorOperationalReliability, -8, 'poor operational reliability');
  return mk(D.POLITICAL_EXPERIENCE, a, confidence);
}

export function scoreLocalConnection(s: LocalConnectionSignals, confidence: Confidence = Confidence.LOW): DimensionResult {
  const a: Acc = { score: 30, pos: [], neg: [] };
  add(a, s.livesInConstituency, 22, 'lives in constituency');
  add(a, s.workedInConstituency, 12, 'worked in constituency');
  add(a, s.localRoots, 12, 'family/local roots');
  add(a, s.previousLocalCampaigning, 8, 'previous local campaigning');
  if (s.localEndorsementCount) add(a, true, Math.min(s.localEndorsementCount * 5, 15), `${s.localEndorsementCount} local endorsement(s)`);
  if (s.localStakeholderStrength != null) add(a, true, Math.round((s.localStakeholderStrength - 50) * 0.2), 'local stakeholder strength');
  add(a, s.relevantIssueWork, 8, 'relevant local issue work');
  add(a, s.parachuteRisk, -20, 'parachute-candidate risk');
  add(a, s.localAssociationHostility, -15, 'local association hostility');
  add(a, s.localMediaAuthenticityCriticism, -10, 'local media authenticity criticism');
  add(a, s.weakLocalIssueKnowledge, -8, 'weak local issue knowledge');
  const missing = s.localStakeholderStrength == null ? ['local stakeholder strength unknown'] : [];
  return mk(D.LOCAL_CONNECTION, a, confidence, missing);
}

export function scoreStakeholderCoverage(s: StakeholderCoverageSignals, confidence: Confidence = Confidence.LOW): DimensionResult {
  const coverage = s.keyStakeholderCount > 0 ? s.highInfluenceCoveredCount / s.keyStakeholderCount : 0;
  const a: Acc = { score: Math.round(coverage * 70), pos: [], neg: [] };
  if (coverage > 0) a.pos.push(`${Math.round(coverage * 100)}% of key stakeholders covered`);
  add(a, !!s.recentPositiveInteractions, Math.min((s.recentPositiveInteractions ?? 0) * 2, 10), 'recent positive interactions');
  add(a, !!s.ownersAssignedCount, Math.min((s.ownersAssignedCount ?? 0) * 2, 8), 'relationship owners assigned');
  add(a, !!s.completedFollowups, Math.min((s.completedFollowups ?? 0) * 2, 8), 'completed follow-ups');
  add(a, !!s.endorsements, Math.min((s.endorsements ?? 0) * 3, 9), 'stakeholder endorsements');
  add(a, !!s.keyGaps, -Math.min((s.keyGaps ?? 0) * 6, 30), 'key stakeholder gaps');
  add(a, !!s.staleHighValue, -Math.min((s.staleHighValue ?? 0) * 5, 20), 'stale high-value relationships');
  add(a, !!s.hostileStakeholders, -Math.min((s.hostileStakeholders ?? 0) * 6, 24), 'hostile stakeholders');
  add(a, !!s.overdueCommitments, -Math.min((s.overdueCommitments ?? 0) * 4, 16), 'overdue commitments');
  const missing = s.keyStakeholderCount === 0 ? ['no key stakeholders mapped for this seat'] : [];
  return mk(D.STAKEHOLDER_COVERAGE, a, confidence, missing);
}

export function scoreLocalAssociationSupport(s: LocalAssociationSignals, confidence: Confidence = Confidence.LOW): DimensionResult {
  const a: Acc = { score: s.chairAttitudeScore ?? 45, pos: [], neg: [] };
  if (s.chairAttitudeScore != null) a.pos.push(`chair attitude ${s.chairAttitudeScore}/100`);
  add(a, s.councillorSupport, 10, 'councillor support');
  add(a, s.activistSupport, 8, 'activist support');
  add(a, s.selectionCommitteeSupport, 12, 'selection committee support');
  add(a, !!s.completedMeetings, Math.min((s.completedMeetings ?? 0) * 4, 12), 'completed local meetings');
  add(a, !!s.fulfilledCommitments, Math.min((s.fulfilledCommitments ?? 0) * 4, 8), 'fulfilled commitments');
  add(a, s.opposition, -25, 'local association opposition');
  add(a, s.unresolvedGrievance, -12, 'unresolved local grievance');
  add(a, s.factionalSelectionRisk, -12, 'factional selection risk');
  add(a, s.imposedWithoutConsultation, -15, 'imposed without consultation');
  add(a, s.missedMeetingOrCommitment, -10, 'missed meeting/commitment');
  const missing = s.chairAttitudeScore == null ? ['local association chair attitude unknown'] : [];
  return mk(D.LOCAL_ASSOCIATION_SUPPORT, a, confidence, missing);
}

export function scoreFactionAcceptability(s: FactionSignals, confidence: Confidence = Confidence.LOW): DimensionResult {
  const a: Acc = { score: s.factionMoodScore ?? 50, pos: [], neg: [] };
  add(a, s.brokerSupport, 15, 'faction broker support');
  add(a, s.crossFactionAcceptability, 12, 'cross-faction acceptability');
  add(a, s.highInfluenceOpposition, -22, 'high-influence faction opposition');
  add(a, s.linkedToHostileFaction, -15, 'linked to hostile faction');
  add(a, s.policyFactionDispute, -10, 'policy-linked faction dispute');
  add(a, s.proxyFightRisk, -12, 'selection could become proxy faction fight');
  add(a, s.missedCommitmentToFactionFigure, -10, 'missed commitment to faction figure');
  return mk(D.FACTION_ACCEPTABILITY, a, confidence);
}

export function scoreIssueCredibility(s: IssueCredibilitySignals, confidence: Confidence = Confidence.LOW): DimensionResult {
  const a: Acc = { score: 30, pos: [], neg: [] };
  add(a, s.demonstratedExpertise, 18, 'demonstrated expertise');
  add(a, s.consistentStatements, 12, 'consistent public statements');
  add(a, s.localIssueInvolvement, 12, 'local issue involvement');
  add(a, s.stakeholderSupportOnIssue, 10, 'stakeholder support on issue');
  add(a, s.clearPosition, 8, 'clear policy position');
  add(a, s.contradictoryStatements, -18, 'contradictory statements');
  add(a, s.lackOfKnowledge, -15, 'lack of issue knowledge');
  add(a, s.highSalienceNoCredibility, -12, 'high local salience, low credibility');
  add(a, s.policyRadiusRisk, -8, 'policy-radius risk');
  add(a, s.vulnerableToAttack, -10, 'vulnerable to attack on issue');
  return mk(D.ISSUE_CREDIBILITY, a, confidence);
}

export function scoreMediaReadiness(s: MediaSignals, confidence: Confidence = Confidence.LOW): DimensionResult {
  const a: Acc = { score: 35, pos: [], neg: [] };
  add(a, s.successfulInterviews, 14, 'successful interviews');
  add(a, s.disciplinedMessaging, 12, 'disciplined messaging');
  add(a, s.goodPublicSpeaking, 10, 'good public speaking');
  add(a, s.lowAttackSurface, 10, 'low attack surface');
  add(a, s.preparedLines, 8, 'prepared lines');
  add(a, s.hostileInterviewFailures, -18, 'hostile interview failures');
  add(a, s.riskyOldPosts, -14, 'risky old posts/statements');
  add(a, s.unresolvedMediaVulnerability, -12, 'unresolved media vulnerability');
  add(a, s.poorMessageDiscipline, -10, 'poor message discipline');
  add(a, s.noTrainingInHighRiskSeat, -8, 'no media training in high-risk seat');
  return mk(D.MEDIA_READINESS, a, confidence);
}

export function scoreCampaignCapacity(s: CampaignCapacitySignals, confidence: Confidence = Confidence.LOW): DimensionResult {
  const a: Acc = { score: 35, pos: [], neg: [] };
  add(a, s.strongTeam, 14, 'strong team');
  add(a, s.volunteerAppeal, 10, 'volunteer appeal');
  add(a, s.fundraisingAbility, 12, 'fundraising ability');
  add(a, s.localInfrastructure, 10, 'local campaign infrastructure');
  add(a, s.operationalReliability, 9, 'operational reliability');
  add(a, s.weakAvailability, -12, 'weak availability');
  add(a, s.weakVolunteerBase, -10, 'weak volunteer base');
  add(a, s.noCampaignTeam, -16, 'no campaign team');
  add(a, s.lowFundraising, -10, 'low fundraising capacity');
  add(a, s.repeatedMissedDeadlines, -10, 'repeated missed deadlines');
  return mk(D.CAMPAIGN_CAPACITY, a, confidence);
}

/** Risk profile: higher = worse (0..100). */
export function scoreRiskProfile(s: RiskSignals, confidence: Confidence = Confidence.LOW): DimensionResult {
  const a: Acc = { score: 10, pos: [], neg: [] };
  for (const sv of s.openRiskSeverities) add(a, true, sev(sv), `open ${sv} risk`);
  add(a, s.unresolvedVetting, 18, 'unresolved vetting issue');
  add(a, s.mediaVulnerability, 12, 'media vulnerability');
  add(a, s.factionHostility, 12, 'faction hostility');
  add(a, s.localBacklash, 10, 'local backlash risk');
  add(a, s.policyContradiction, 10, 'policy contradiction');
  add(a, s.complianceFlag, 18, 'compliance flag');
  add(a, s.donorReputationConcern, 10, 'donor/reputation concern');
  add(a, s.unresolvedCommitment, 6, 'unresolved commitment');
  add(a, s.hostileHighProfileStakeholder, 8, 'hostile high-profile stakeholder');
  // For risk, the accumulated "positive drivers" are actually risk-raising; relabel.
  const out = mk(D.RISK_PROFILE, a, confidence);
  out.negativeDrivers = a.pos; // risk-raising factors
  out.positiveDrivers = [];
  out.rationale = `candidate risk = ${out.score}/100 (higher is worse)`;
  return out;
}

export function scoreDevelopmentPotential(s: DevelopmentSignals, confidence: Confidence = Confidence.LOW): DimensionResult {
  const a: Acc = { score: 40, pos: [], neg: [] };
  add(a, s.weaknessesFixable, 15, 'weaknesses are fixable');
  add(a, s.candidateResponsive, 12, 'candidate responsive');
  add(a, s.clearActionsExist, 10, 'clear development actions exist');
  add(a, s.relationshipsCanBeBuilt, 10, 'relationships can be built');
  add(a, s.improvingTrend, 12, 'improving trend');
  if (s.daysUntilSelection != null) {
    if (s.daysUntilSelection >= 90) add(a, true, 10, 'ample time before selection');
    else if (s.daysUntilSelection >= 30) add(a, true, 4, 'some time before selection');
    else add(a, true, -8, 'short timeline before selection');
  }
  add(a, s.fatalOrStructuralWeakness, -30, 'fatal/structural weakness');
  add(a, s.candidateUnwilling, -20, 'candidate unwilling/unable to act');
  add(a, s.noPathToLocalLegitimacy, -20, 'no credible path to local legitimacy');
  add(a, s.unresolvedHighSeverityRisk, -12, 'unresolved high-severity risk');
  return mk(D.DEVELOPMENT_POTENTIAL, a, confidence);
}

// -----------------------------------------------------------------------------
// Confidence (brief §7.3)
// -----------------------------------------------------------------------------
export function computeConfidence(q: EvidenceQuality): Confidence {
  let pts = 0;
  if (q.evidenceCount >= 8) pts += 2;
  else if (q.evidenceCount >= 3) pts += 1;
  if (q.confirmedRelationshipCount >= 5) pts += 2;
  else if (q.confirmedRelationshipCount >= 2) pts += 1;
  if (q.missingFieldCount > 5) pts -= 2;
  else if (q.missingFieldCount > 2) pts -= 1;
  if (q.staleEvidence) pts -= 1;
  if (q.conflictingSources) pts -= 1;
  if (q.daysSinceLastAssessment != null && q.daysSinceLastAssessment > 180) pts -= 1;

  if (pts >= 4 && !q.conflictingSources && q.evidenceCount >= 8) return Confidence.CONFIRMED;
  if (pts >= 3) return Confidence.HIGH;
  if (pts >= 1) return Confidence.MEDIUM;
  return Confidence.LOW;
}

export function isDataThin(q: EvidenceQuality): boolean {
  return q.evidenceCount < 2 || q.missingFieldCount > 6;
}

// -----------------------------------------------------------------------------
// Weighted blend (brief §7.2)
// -----------------------------------------------------------------------------
export function blendOverall(scores: DimensionScores, weights: WeightConfig = DEFAULT_WEIGHTS): { overall: number; base: number; riskPenalty: number } {
  const positive: [keyof WeightConfig, number][] = [
    ['politicalExperienceWeight', scores.POLITICAL_EXPERIENCE],
    ['localConnectionWeight', scores.LOCAL_CONNECTION],
    ['stakeholderCoverageWeight', scores.STAKEHOLDER_COVERAGE],
    ['localAssociationSupportWeight', scores.LOCAL_ASSOCIATION_SUPPORT],
    ['factionAcceptabilityWeight', scores.FACTION_ACCEPTABILITY],
    ['issueCredibilityWeight', scores.ISSUE_CREDIBILITY],
    ['mediaReadinessWeight', scores.MEDIA_READINESS],
    ['campaignCapacityWeight', scores.CAMPAIGN_CAPACITY],
    ['developmentPotentialWeight', scores.DEVELOPMENT_POTENTIAL],
  ];
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [key, value] of positive) {
    const w = weights[key];
    weightedSum += w * value;
    weightTotal += w;
  }
  const base = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const riskPenalty = (Math.abs(weights.riskProfileWeight) / (weightTotal || 1)) * scores.RISK_PROFILE;
  return { overall: Math.round(clamp(base - riskPenalty)), base: Math.round(base), riskPenalty: Math.round(riskPenalty) };
}

// -----------------------------------------------------------------------------
// Overall recommendation label (brief §6.1 enum)
// -----------------------------------------------------------------------------
export function recommendationLabel(input: { overall: number; riskScore: number; developmentPotential: number; dataThin: boolean }): Rec {
  const { overall, riskScore, developmentPotential, dataThin } = input;
  if (dataThin) return Rec.NEEDS_MORE_DATA;
  if (riskScore >= 75 && overall < 60) return Rec.DO_NOT_SELECT;
  if (riskScore >= 55 && overall >= 58) return Rec.HIGH_UPSIDE_HIGH_RISK;
  if (overall >= 72 && riskScore < 45) return Rec.STRONG_FIT;
  if (overall < 45) return Rec.WEAK_FIT;
  if (overall < 58 && developmentPotential >= 60 && riskScore < 75) return Rec.DEVELOP_BEFORE_SELECTION;
  return Rec.VIABLE_WITH_ACTIONS;
}

// -----------------------------------------------------------------------------
// Comparison ranking + per-entry labels (brief §10.3, §6.7)
// -----------------------------------------------------------------------------
export function comparisonEntryLabel(rank: number, overall: number, rec: Rec): CmpLabel {
  if (rec === Rec.NEEDS_MORE_DATA) return CmpLabel.NEEDS_MORE_DATA;
  if (rec === Rec.DO_NOT_SELECT) return CmpLabel.REJECT;
  if (rank === 1 && (rec === Rec.STRONG_FIT || rec === Rec.VIABLE_WITH_ACTIONS || rec === Rec.HIGH_UPSIDE_HIGH_RISK)) return CmpLabel.SELECT;
  if (rec === Rec.DEVELOP_BEFORE_SELECTION) return CmpLabel.DEVELOP;
  if (overall >= 60) return CmpLabel.SHORTLIST;
  if (overall >= 45) return CmpLabel.HOLD;
  return CmpLabel.REJECT;
}

export interface Superlatives {
  winner?: string;
  safest?: string;
  highestUpside?: string;
  bestLocalFit?: string;
  mostFactionallyAcceptable?: string;
  highestRisk?: string;
}

export function computeSuperlatives(entries: ComparisonEntryResult[]): Superlatives {
  if (!entries.length) return {};
  const by = (fn: (e: ComparisonEntryResult) => number, max = true) =>
    entries.reduce((best, e) => (max ? (fn(e) > fn(best) ? e : best) : fn(e) < fn(best) ? e : best)).candidateEntityId;
  return {
    winner: by((e) => e.overallFitScore),
    safest: by((e) => e.dimensionScores.RISK_PROFILE, false),
    highestUpside: by((e) => e.dimensionScores.DEVELOPMENT_POTENTIAL + e.overallFitScore * 0.4),
    bestLocalFit: by((e) => e.dimensionScores.LOCAL_CONNECTION),
    mostFactionallyAcceptable: by((e) => e.dimensionScores.FACTION_ACCEPTABILITY),
    highestRisk: by((e) => e.dimensionScores.RISK_PROFILE),
  };
}

// -----------------------------------------------------------------------------
// Material change detection (brief §8.4)
// -----------------------------------------------------------------------------
export interface ProposedChange {
  changeType: ChangeType;
  fieldName: string;
  deltaNumeric?: number;
  rationale: string;
  significant: boolean;
}

export function detectMaterialChanges(
  before: { overall: number; risk: number; localAssociation: number; faction: number; recommendation: Rec; viable: boolean },
  after: { overall: number; risk: number; localAssociation: number; faction: number; recommendation: Rec; viable: boolean },
  flags: { newHighOrCriticalRisk?: boolean } = {},
): ProposedChange[] {
  const out: ProposedChange[] = [];
  const dOverall = after.overall - before.overall;
  if (Math.abs(dOverall) >= MATERIAL_OVERALL_DELTA) {
    out.push({ changeType: dOverall > 0 ? ChangeType.CANDIDATE_IMPROVED : ChangeType.CANDIDATE_DETERIORATED, fieldName: 'overallFitScore', deltaNumeric: dOverall, rationale: `Overall fit moved ${dOverall > 0 ? '+' : ''}${dOverall}.`, significant: true });
  }
  const dRisk = after.risk - before.risk;
  if (Math.abs(dRisk) >= MATERIAL_RISK_DELTA) {
    out.push({ changeType: dRisk > 0 ? ChangeType.RISK_ESCALATED : ChangeType.RISK_DEESCALATED, fieldName: 'riskScore', deltaNumeric: dRisk, rationale: `Risk score moved ${dRisk > 0 ? '+' : ''}${dRisk}.`, significant: true });
  }
  const dLA = after.localAssociation - before.localAssociation;
  if (Math.abs(dLA) >= MATERIAL_LOCAL_ASSOC_DELTA) {
    out.push({ changeType: dLA > 0 ? ChangeType.RELATIONSHIP_STRENGTHENED : ChangeType.RELATIONSHIP_WEAKENED, fieldName: 'localAssociationSupportScore', deltaNumeric: dLA, rationale: `Local association support moved ${dLA > 0 ? '+' : ''}${dLA}.`, significant: true });
  }
  const dFaction = after.faction - before.faction;
  if (Math.abs(dFaction) >= MATERIAL_FACTION_DELTA) {
    out.push({ changeType: dFaction > 0 ? ChangeType.FACTION_BECAME_LESS_HOSTILE : ChangeType.FACTION_BECAME_MORE_HOSTILE, fieldName: 'factionAcceptabilityScore', deltaNumeric: dFaction, rationale: `Faction acceptability moved ${dFaction > 0 ? '+' : ''}${dFaction}.`, significant: true });
  }
  if (after.recommendation !== before.recommendation) {
    out.push({ changeType: ChangeType.STATUS_CHANGED, fieldName: 'overallRecommendation', rationale: `Recommendation changed ${before.recommendation} → ${after.recommendation}.`, significant: true });
  }
  if (flags.newHighOrCriticalRisk) {
    out.push({ changeType: ChangeType.RISK_ESCALATED, fieldName: 'risk', rationale: 'New high/critical candidate risk appeared.', significant: true });
  }
  if (before.viable !== after.viable) {
    out.push({ changeType: after.viable ? ChangeType.CANDIDATE_IMPROVED : ChangeType.CANDIDATE_DETERIORATED, fieldName: 'viability', rationale: after.viable ? 'Candidate became viable.' : 'Candidate became non-viable.', significant: true });
  }
  return out;
}

export function isViable(overall: number, riskScore: number): boolean {
  return overall >= 55 && riskScore < 60;
}

// -----------------------------------------------------------------------------
// Development / risk action triggers (brief §12)
// -----------------------------------------------------------------------------
export interface ProposedAction {
  title: string;
  actionType: ActionType;
  priority: ActionPriority;
  rationale: string;
  dimensionType?: DimensionResult['dimensionType'];
}

export function developmentActions(scores: DimensionScores, opts: { dataThin?: boolean } = {}): ProposedAction[] {
  const out: ProposedAction[] = [];
  if (scores.LOCAL_CONNECTION < 40) out.push({ title: 'Strengthen local links', actionType: ActionType.STRENGTHEN_LOCAL_LINKS, priority: ActionPriority.HIGH, rationale: 'Local connection is weak.', dimensionType: D.LOCAL_CONNECTION });
  if (scores.STAKEHOLDER_COVERAGE < 40) out.push({ title: 'Brief key local stakeholders', actionType: ActionType.BRIEF, priority: ActionPriority.MEDIUM, rationale: 'Stakeholder coverage is low.', dimensionType: D.STAKEHOLDER_COVERAGE });
  if (scores.LOCAL_ASSOCIATION_SUPPORT < 45) out.push({ title: 'Meet local association leadership', actionType: ActionType.MEET_LOCAL_ASSOCIATION, priority: ActionPriority.HIGH, rationale: 'Local association support is weak.', dimensionType: D.LOCAL_ASSOCIATION_SUPPORT });
  if (scores.FACTION_ACCEPTABILITY < 45) out.push({ title: 'Consult faction broker before shortlisting', actionType: ActionType.CONSULT_FACTION_BROKER, priority: ActionPriority.MEDIUM, rationale: 'Faction acceptability is low.', dimensionType: D.FACTION_ACCEPTABILITY });
  if (scores.ISSUE_CREDIBILITY < 40) out.push({ title: 'Attend local issue briefing', actionType: ActionType.BRIEF, priority: ActionPriority.MEDIUM, rationale: 'Issue credibility is low.', dimensionType: D.ISSUE_CREDIBILITY });
  if (scores.MEDIA_READINESS < 40) out.push({ title: 'Prepare media training', actionType: ActionType.PREPARE_MEDIA_TRAINING, priority: ActionPriority.MEDIUM, rationale: 'Media readiness is low.', dimensionType: D.MEDIA_READINESS });
  if (scores.RISK_PROFILE >= 60) out.push({ title: 'Conduct vetting / mitigation', actionType: ActionType.CONDUCT_VETTING, priority: ActionPriority.HIGH, rationale: 'Candidate risk is high.', dimensionType: D.RISK_PROFILE });
  if (scores.RISK_PROFILE >= 75) out.push({ title: 'Escalate to compliance review', actionType: ActionType.ESCALATE_COMPLIANCE_REVIEW, priority: ActionPriority.URGENT, rationale: 'Candidate risk is critical.', dimensionType: D.RISK_PROFILE });
  if (opts.dataThin) out.push({ title: 'Gather more local data', actionType: ActionType.GATHER_LOCAL_DATA, priority: ActionPriority.MEDIUM, rationale: 'Confidence is limited by thin data.' });
  return out;
}

export function estimateDevelopmentImpact(actionType: ActionType): { dimension?: DimensionResult['dimensionType']; expectedScoreImpact: number } {
  switch (actionType) {
    case ActionType.STRENGTHEN_LOCAL_LINKS: return { dimension: D.LOCAL_CONNECTION, expectedScoreImpact: 12 };
    case ActionType.MEET_LOCAL_ASSOCIATION: return { dimension: D.LOCAL_ASSOCIATION_SUPPORT, expectedScoreImpact: 15 };
    case ActionType.BRIEF: return { dimension: D.STAKEHOLDER_COVERAGE, expectedScoreImpact: 8 };
    case ActionType.PREPARE_MEDIA_TRAINING: return { dimension: D.MEDIA_READINESS, expectedScoreImpact: 12 };
    case ActionType.CONSULT_FACTION_BROKER: return { dimension: D.FACTION_ACCEPTABILITY, expectedScoreImpact: 10 };
    case ActionType.CONDUCT_VETTING: return { dimension: D.RISK_PROFILE, expectedScoreImpact: -15 };
    default: return { expectedScoreImpact: 5 };
  }
}
