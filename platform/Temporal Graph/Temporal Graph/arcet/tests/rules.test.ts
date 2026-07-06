// =============================================================================
// rules.test.ts — pure unit tests for the deterministic rules engine (§20, §22)
// These run with NO database and NO generated Prisma client.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  relationshipRules,
  candidateRules,
  factionRules,
  fptpRules,
  complianceVisibilityFor,
  complianceFlagFor,
  actionRequiresComplianceReview,
} from '../src/domain/ontology/rules.js';
import {
  ActionType,
  RiskType,
  Visibility,
  DataClassification,
  ComplianceFlagType,
  FPTPRecommendationLabel,
} from '../src/domain/ontology/enums.js';

const NOW = new Date('2026-06-01T00:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000);

describe('relationshipRules', () => {
  it('flags a strong relationship that has gone stale (risk + follow-up)', () => {
    const { actions, risks } = relationshipRules(
      { id: 'r1', sourceEntityId: 'a', targetEntityId: 'b', strength: 5, lastInteractionAt: daysAgo(120), hasOwner: true },
      NOW,
    );
    expect(risks.map((r) => r.rule)).toContain('REL_STALE_HIGH_VALUE');
    expect(risks[0].riskType).toBe(RiskType.RELATIONSHIP_RISK);
    expect(actions.map((a) => a.actionType)).toContain(ActionType.FOLLOW_UP);
  });

  it('does not flag a strong relationship with recent contact', () => {
    const { risks } = relationshipRules(
      { id: 'r2', sourceEntityId: 'a', targetEntityId: 'b', strength: 5, lastInteractionAt: daysAgo(10), hasOwner: true },
      NOW,
    );
    expect(risks).toHaveLength(0);
  });

  it('recommends assigning an owner when none exists', () => {
    const { actions } = relationshipRules(
      { id: 'r3', sourceEntityId: 'a', targetEntityId: 'b', strength: 2, lastInteractionAt: daysAgo(5), hasOwner: false },
      NOW,
    );
    expect(actions.map((a) => a.actionType)).toContain(ActionType.ASSIGN_RELATIONSHIP_OWNER);
  });
});

describe('candidateRules', () => {
  it('recommends local links + association meeting for weak local scores', () => {
    const { actions } = candidateRules({
      candidateEntityId: 'c1',
      localConnectionScore: 20,
      localAssociationSupportScore: 15,
      riskScore: 10,
      issueCredibilityScore: 90,
    });
    const types = actions.map((a) => a.actionType);
    expect(types).toContain(ActionType.STRENGTHEN_LOCAL_LINKS);
    expect(types).toContain(ActionType.MEET_LOCAL_ASSOCIATION);
  });

  it('raises a candidate risk and vetting action for a high risk score', () => {
    const { actions, risks } = candidateRules({
      candidateEntityId: 'c2',
      localConnectionScore: 80,
      localAssociationSupportScore: 80,
      riskScore: 75,
      issueCredibilityScore: 80,
    });
    expect(risks.map((r) => r.riskType)).toContain(RiskType.CANDIDATE_RISK);
    expect(actions.map((a) => a.actionType)).toContain(ActionType.CONDUCT_VETTING);
  });

  it('only flags issue credibility when the issue is high-salience', () => {
    const without = candidateRules({
      candidateEntityId: 'c3', localConnectionScore: 80, localAssociationSupportScore: 80, riskScore: 0, issueCredibilityScore: 10,
    });
    expect(without.actions.some((a) => a.rule === 'CAND_WEAK_ISSUE_CREDIBILITY')).toBe(false);
    const withSalience = candidateRules({
      candidateEntityId: 'c3', localConnectionScore: 80, localAssociationSupportScore: 80, riskScore: 0, issueCredibilityScore: 10, highSalienceLocalIssue: true,
    });
    expect(withSalience.actions.some((a) => a.rule === 'CAND_WEAK_ISSUE_CREDIBILITY')).toBe(true);
  });

  it('treats null scores as non-triggering (no false positives)', () => {
    const { actions, risks } = candidateRules({
      candidateEntityId: 'c4', localConnectionScore: null, localAssociationSupportScore: null, riskScore: null, issueCredibilityScore: null,
    });
    expect(actions).toHaveLength(0);
    expect(risks).toHaveLength(0);
  });
});

describe('factionRules', () => {
  it('creates a faction risk when hostile high-influence members exist', () => {
    const { risks } = factionRules({
      subjectEntityId: 'cand', factionEntityId: 'fac', factionName: 'Reform Bloc', hostileHighInfluenceMembers: 2,
    });
    expect(risks).toHaveLength(1);
    expect(risks[0].riskType).toBe(RiskType.FACTION_RISK);
    expect(risks[0].links.map((l) => l.entityId)).toEqual(expect.arrayContaining(['cand', 'fac']));
  });

  it('recommends a broker consult when policy touches a hostile faction', () => {
    const { actions } = factionRules({
      subjectEntityId: 'pol', factionEntityId: 'fac', factionName: 'Reform Bloc', hostileHighInfluenceMembers: 0, policyTouchesHostileFaction: true,
    });
    expect(actions.map((a) => a.actionType)).toContain(ActionType.CONSULT_FACTION_BROKER);
  });
});

describe('fptpRules', () => {
  const base = { constituencyEntityId: 'x', winProbability: 0, futureElectionValue: 0, strategicValue: 0, candidateFit: 80, seatStrategicallyImportant: false };

  it('symbolic run when win prob low but future value high', () => {
    expect(fptpRules({ ...base, winProbability: 0.1, futureElectionValue: 70 }).label).toBe(FPTPRecommendationLabel.SYMBOLIC_RUN);
  });
  it('do not invest when win prob low and strategic value low', () => {
    expect(fptpRules({ ...base, winProbability: 0.1, strategicValue: 10 }).label).toBe(FPTPRecommendationLabel.DO_NOT_INVEST);
  });
  it('change candidate when fit weak in an important seat', () => {
    const out = fptpRules({ ...base, winProbability: 0.3, candidateFit: 20, seatStrategicallyImportant: true });
    expect(out.label).toBe(FPTPRecommendationLabel.CHANGE_CANDIDATE);
    expect(out.actions.map((a) => a.actionType)).toContain(ActionType.COMPARE_CANDIDATES);
  });
  it('compete hard when win probability is favourable', () => {
    expect(fptpRules({ ...base, winProbability: 0.6 }).label).toBe(FPTPRecommendationLabel.COMPETE_HARD);
  });
  it('falls back to gather more data when no decisive branch fires', () => {
    // low win prob, but strategic value not low and fit acceptable: none of the
    // decisive branches match, so the recommendation defaults to gathering data.
    expect(
      fptpRules({ ...base, winProbability: 0.1, futureElectionValue: 20, strategicValue: 55, candidateFit: 70 }).label,
    ).toBe(FPTPRecommendationLabel.GATHER_MORE_DATA);
  });
});

describe('compliance rules', () => {
  it('forces special-category data to compliance-only visibility', () => {
    expect(complianceVisibilityFor(DataClassification.SPECIAL_CATEGORY_RISK)).toBe(Visibility.COMPLIANCE_ONLY);
  });
  it('restricts personal data', () => {
    expect(complianceVisibilityFor(DataClassification.PERSONAL_DATA)).toBe(Visibility.RESTRICTED);
  });
  it('leaves public data unrestricted', () => {
    expect(complianceVisibilityFor(DataClassification.PUBLIC)).toBeNull();
  });
  it('maps classifications to the right flag types', () => {
    expect(complianceFlagFor(DataClassification.INFERRED_DATA)).toBe(ComplianceFlagType.INFERRED_POLITICAL_OPINION);
    expect(complianceFlagFor(DataClassification.SENSITIVE_PERSONAL_DATA)).toBe(ComplianceFlagType.SENSITIVE_DATA);
  });
  it('requires review when an action uses restricted data', () => {
    expect(actionRequiresComplianceReview(true)).toBe(true);
    expect(actionRequiresComplianceReview(false)).toBe(false);
  });
});
