// =============================================================================
// candidate-intelligence-rules.test.ts — pure scoring rules (no DB)
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  scorePoliticalExperience,
  scoreLocalConnection,
  scoreStakeholderCoverage,
  scoreRiskProfile,
  scoreDevelopmentPotential,
  blendOverall,
  computeConfidence,
  isDataThin,
  recommendationLabel,
  comparisonEntryLabel,
  computeSuperlatives,
  detectMaterialChanges,
  developmentActions,
  estimateDevelopmentImpact,
  isViable,
} from '../src/domain/candidate-intelligence/rules.js';
import {
  CandidateDimensionType as D,
  CandidateOverallRecommendation as Rec,
  CandidateComparisonRecommendationLabel as CmpLabel,
} from '../src/domain/candidate-intelligence/enums.js';
import { Confidence, Severity, ActionType } from '../src/domain/ontology/enums.js';
import type { DimensionScores, ComparisonEntryResult } from '../src/domain/candidate-intelligence/types.js';

const scores = (over: Partial<DimensionScores> = {}): DimensionScores => ({
  POLITICAL_EXPERIENCE: 70, LOCAL_CONNECTION: 70, STAKEHOLDER_COVERAGE: 70,
  LOCAL_ASSOCIATION_SUPPORT: 70, FACTION_ACCEPTABILITY: 70, ISSUE_CREDIBILITY: 70,
  MEDIA_READINESS: 70, CAMPAIGN_CAPACITY: 70, RISK_PROFILE: 20, DEVELOPMENT_POTENTIAL: 70,
  ...over,
});

describe('dimension scorers', () => {
  it('political experience: empty baseline 25, accumulates positives', () => {
    expect(scorePoliticalExperience({}).score).toBe(25);
    const s = scorePoliticalExperience({ priorElectedOffice: true, parliamentaryExperience: true, campaignLeadership: true });
    expect(s.score).toBe(25 + 18 + 14 + 12);
    expect(s.positiveDrivers).toContain('prior elected office');
  });

  it('local connection: lives-in + roots raises; parachute risk lowers', () => {
    const strong = scoreLocalConnection({ livesInConstituency: true, localRoots: true, relevantIssueWork: true });
    const weak = scoreLocalConnection({ parachuteRisk: true, weakLocalIssueKnowledge: true });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(weak.negativeDrivers).toContain('parachute-candidate risk');
  });

  it('stakeholder coverage scales with covered ratio', () => {
    const full = scoreStakeholderCoverage({ keyStakeholderCount: 4, highInfluenceCoveredCount: 4 });
    const half = scoreStakeholderCoverage({ keyStakeholderCount: 4, highInfluenceCoveredCount: 2 });
    expect(full.score).toBeGreaterThan(half.score);
    const none = scoreStakeholderCoverage({ keyStakeholderCount: 0, highInfluenceCoveredCount: 0 });
    expect(none.missingData.length).toBeGreaterThan(0);
  });

  it('risk profile: higher = worse; severities + vetting accumulate', () => {
    const r = scoreRiskProfile({ openRiskSeverities: [Severity.HIGH, Severity.MEDIUM], unresolvedVetting: true });
    expect(r.score).toBe(10 + 26 + 14 + 18);
    expect(r.negativeDrivers).toContain('open HIGH risk');
    expect(r.positiveDrivers.length).toBe(0);
  });

  it('development potential: short timeline penalised, fixable raises', () => {
    const good = scoreDevelopmentPotential({ weaknessesFixable: true, candidateResponsive: true, daysUntilSelection: 120 });
    const bad = scoreDevelopmentPotential({ fatalOrStructuralWeakness: true, daysUntilSelection: 10 });
    expect(good.score).toBeGreaterThan(bad.score);
  });
});

describe('blendOverall', () => {
  it('is a weighted average of positives minus a risk discount', () => {
    const b = blendOverall(scores(), DEFAULT_WEIGHTS);
    expect(b.base).toBe(70);
    expect(b.riskPenalty).toBe(2); // 0.12 * 20 = 2.4 → 2
    expect(b.overall).toBe(68); // round(70 - 2.4)
  });

  it('weights local connection heavily', () => {
    const b = blendOverall(scores({ LOCAL_CONNECTION: 80 }), DEFAULT_WEIGHTS);
    expect(b.base).toBe(72); // 7180/100 = 71.8 → 72
    expect(b.overall).toBe(69); // round(71.8 - 2.4) = round(69.4)
  });

  it('risk reduces the score', () => {
    const low = blendOverall(scores({ RISK_PROFILE: 10 }));
    const high = blendOverall(scores({ RISK_PROFILE: 80 }));
    expect(high.overall).toBeLessThan(low.overall);
  });
});

describe('computeConfidence', () => {
  it('returns CONFIRMED only with strong, non-conflicting evidence', () => {
    expect(computeConfidence({ evidenceCount: 10, confirmedRelationshipCount: 6, missingFieldCount: 0, daysSinceLastAssessment: 10, conflictingSources: false, staleEvidence: false })).toBe(Confidence.CONFIRMED);
  });
  it('downgrades to HIGH when sources conflict', () => {
    expect(computeConfidence({ evidenceCount: 10, confirmedRelationshipCount: 6, missingFieldCount: 0, daysSinceLastAssessment: 10, conflictingSources: true, staleEvidence: false })).toBe(Confidence.HIGH);
  });
  it('returns LOW and flags thin data when evidence is scarce', () => {
    const q = { evidenceCount: 1, confirmedRelationshipCount: 0, missingFieldCount: 8, daysSinceLastAssessment: null, conflictingSources: false, staleEvidence: false };
    expect(computeConfidence(q)).toBe(Confidence.LOW);
    expect(isDataThin(q)).toBe(true);
  });
});

describe('recommendationLabel', () => {
  it('NEEDS_MORE_DATA when data is thin', () => {
    expect(recommendationLabel({ overall: 80, riskScore: 10, developmentPotential: 70, dataThin: true })).toBe(Rec.NEEDS_MORE_DATA);
  });
  it('STRONG_FIT for high overall, low risk', () => {
    expect(recommendationLabel({ overall: 78, riskScore: 30, developmentPotential: 50, dataThin: false })).toBe(Rec.STRONG_FIT);
  });
  it('HIGH_UPSIDE_HIGH_RISK for strong-but-risky', () => {
    expect(recommendationLabel({ overall: 62, riskScore: 60, developmentPotential: 70, dataThin: false })).toBe(Rec.HIGH_UPSIDE_HIGH_RISK);
  });
  it('DO_NOT_SELECT for critical risk with weak overall', () => {
    expect(recommendationLabel({ overall: 40, riskScore: 80, developmentPotential: 50, dataThin: false })).toBe(Rec.DO_NOT_SELECT);
  });
  it('DEVELOP_BEFORE_SELECTION for developable mid candidate', () => {
    expect(recommendationLabel({ overall: 50, riskScore: 30, developmentPotential: 70, dataThin: false })).toBe(Rec.DEVELOP_BEFORE_SELECTION);
  });
  it('WEAK_FIT for low overall', () => {
    expect(recommendationLabel({ overall: 38, riskScore: 30, developmentPotential: 40, dataThin: false })).toBe(Rec.WEAK_FIT);
  });
});

describe('comparison labels + superlatives', () => {
  it('labels the top strong candidate SELECT and a do-not-select REJECT', () => {
    expect(comparisonEntryLabel(1, 78, Rec.STRONG_FIT)).toBe(CmpLabel.SELECT);
    expect(comparisonEntryLabel(2, 40, Rec.DO_NOT_SELECT)).toBe(CmpLabel.REJECT);
    expect(comparisonEntryLabel(3, 50, Rec.DEVELOP_BEFORE_SELECTION)).toBe(CmpLabel.DEVELOP);
  });

  it('computes superlatives across entries', () => {
    const entries: ComparisonEntryResult[] = [
      { candidateEntityId: 'A', rankOverall: 1, overallFitScore: 75, dimensionScores: scores({ LOCAL_CONNECTION: 85, RISK_PROFILE: 10 }), recommendationLabel: CmpLabel.SELECT, rationale: '' },
      { candidateEntityId: 'B', rankOverall: 2, overallFitScore: 60, dimensionScores: scores({ RISK_PROFILE: 70, DEVELOPMENT_POTENTIAL: 90 }), recommendationLabel: CmpLabel.SHORTLIST, rationale: '' },
    ];
    const s = computeSuperlatives(entries);
    expect(s.winner).toBe('A');
    expect(s.safest).toBe('A');
    expect(s.highestRisk).toBe('B');
    expect(s.bestLocalFit).toBe('A');
    expect(s.highestUpside).toBe('B');
  });
});

describe('detectMaterialChanges', () => {
  it('flags overall, local-association, recommendation and viability changes', () => {
    const before = { overall: 50, risk: 20, localAssociation: 40, faction: 50, recommendation: Rec.VIABLE_WITH_ACTIONS, viable: false };
    const after = { overall: 65, risk: 22, localAssociation: 60, faction: 52, recommendation: Rec.STRONG_FIT, viable: true };
    const changes = detectMaterialChanges(before, after);
    const fields = changes.map((c) => c.fieldName);
    expect(fields).toContain('overallFitScore');
    expect(fields).toContain('localAssociationSupportScore');
    expect(fields).toContain('overallRecommendation');
    expect(fields).toContain('viability');
    expect(changes.every((c) => c.significant)).toBe(true);
  });
  it('ignores sub-threshold movement', () => {
    const same = { overall: 50, risk: 20, localAssociation: 40, faction: 50, recommendation: Rec.VIABLE_WITH_ACTIONS, viable: true };
    expect(detectMaterialChanges(same, { ...same, overall: 55, risk: 25 })).toHaveLength(0);
  });
});

describe('development actions + impact', () => {
  it('triggers the right actions for weak dimensions', () => {
    const acts = developmentActions(scores({ LOCAL_CONNECTION: 30, STAKEHOLDER_COVERAGE: 35, LOCAL_ASSOCIATION_SUPPORT: 40, MEDIA_READINESS: 35, RISK_PROFILE: 65 }));
    const types = acts.map((a) => a.actionType);
    expect(types).toContain(ActionType.STRENGTHEN_LOCAL_LINKS);
    expect(types).toContain(ActionType.MEET_LOCAL_ASSOCIATION);
    expect(types).toContain(ActionType.PREPARE_MEDIA_TRAINING);
    expect(types).toContain(ActionType.CONDUCT_VETTING);
  });
  it('estimates development impact per action', () => {
    const e = estimateDevelopmentImpact(ActionType.MEET_LOCAL_ASSOCIATION);
    expect(e.dimension).toBe(D.LOCAL_ASSOCIATION_SUPPORT);
    expect(e.expectedScoreImpact).toBe(15);
  });
  it('isViable gates on overall and risk', () => {
    expect(isViable(60, 30)).toBe(true);
    expect(isViable(60, 70)).toBe(false);
    expect(isViable(40, 10)).toBe(false);
  });
});
