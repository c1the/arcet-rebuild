// =============================================================================
// temporal-rules.test.ts — pure temporal rules (no DB; runs anywhere)
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  computeTrend,
  relationshipDecay,
  commitmentUrgency,
  isSignificantChange,
  candidateMovement,
  fptpStaleness,
  factionEscalation,
  policyRadiusMovement,
  STALE_DAYS,
  STALE_HIGH_DAYS,
} from '../src/domain/temporal/rules.js';
import { ChangeType, TrendDirection } from '../src/domain/temporal/enums.js';
import { Attitude, InfluenceLevel } from '../src/domain/ontology/enums.js';

const daysAgo = (n: number, base = Date.now()) => new Date(base - n * 86400000);
const pts = (vals: number[], stepDays = 7) =>
  vals.map((value, i) => ({ observedAt: new Date(Date.now() - (vals.length - 1 - i) * stepDays * 86400000), value }));

describe('computeTrend', () => {
  it('detects an improving trend when higher is better', () => {
    const t = computeTrend(pts([40, 50, 60, 72]), { higherIsBetter: true });
    expect(t.direction).toBe(TrendDirection.IMPROVING);
    expect(t.magnitude).toBe(32);
    expect(t.n).toBe(4);
  });

  it('inverts semantics when higher is worse (risk rising = worsening)', () => {
    const t = computeTrend(pts([10, 30, 55]), { higherIsBetter: false });
    expect(t.direction).toBe(TrendDirection.WORSENING);
  });

  it('calls a flat series stable', () => {
    const t = computeTrend(pts([50, 51, 49, 50]));
    expect(t.direction).toBe(TrendDirection.STABLE);
  });

  it('returns UNKNOWN with fewer than two points', () => {
    expect(computeTrend(pts([50])).direction).toBe(TrendDirection.UNKNOWN);
  });
});

describe('relationshipDecay', () => {
  const base = {
    relationshipId: 'r1',
    targetEntityId: 'e1',
    strength: 5,
    attitude: Attitude.NEUTRAL,
    influenceLevel: InfluenceLevel.MEDIUM,
    hasOverdueCommitment: false,
  };

  it('marks a fresh relationship when recently contacted', () => {
    const { decay } = relationshipDecay({ ...base, lastInteractionAt: daysAgo(5) });
    expect(decay.band).toBe('FRESH');
  });

  it('flags a stale high-value relationship past 90 days and proposes a follow-up + risk', () => {
    const out = relationshipDecay({ ...base, lastInteractionAt: daysAgo(STALE_DAYS + 5) });
    expect(['STALE', 'HIGH']).toContain(out.decay.band);
    expect(out.changes.some((c) => c.changeType === ChangeType.RELATIONSHIP_STALE)).toBe(true);
    expect(out.actions.length).toBeGreaterThan(0);
    expect(out.risks.length).toBeGreaterThan(0);
  });

  it('treats a hostile relationship as unmanaged, not ordinary decay', () => {
    const out = relationshipDecay({ ...base, attitude: Attitude.HOSTILE, lastInteractionAt: daysAgo(STALE_HIGH_DAYS + 10) });
    expect(out.decay.band).toBe('UNMANAGED_HOSTILE');
    expect(out.decay.isHostile).toBe(true);
    expect(out.risks[0].title).toMatch(/unmanaged hostile/i);
  });

  it('increases staleness when an overdue commitment exists', () => {
    const without = relationshipDecay({ ...base, lastInteractionAt: daysAgo(40) }).decay.stalenessScore;
    const withOverdue = relationshipDecay({ ...base, lastInteractionAt: daysAgo(40), hasOverdueCommitment: true }).decay.stalenessScore;
    expect(withOverdue).toBeGreaterThan(without);
  });
});

describe('commitmentUrgency', () => {
  it('marks past-due open commitments as overdue/immediate', () => {
    const u = commitmentUrgency({ commitmentId: 'c1', status: 'OPEN', dueAt: daysAgo(2) });
    expect(u.overdue).toBe(true);
    expect(u.urgency).toBe('IMMEDIATE');
  });
  it('flags an imminent due date as high urgency', () => {
    const u = commitmentUrgency({ commitmentId: 'c2', status: 'OPEN', dueAt: new Date(Date.now() + 2 * 86400000) });
    expect(u.urgency).toBe('HIGH');
  });
});

describe('isSignificantChange', () => {
  it('treats risk escalation and FPTP recommendation change as significant', () => {
    expect(isSignificantChange(ChangeType.RISK_ESCALATED)).toBe(true);
    expect(isSignificantChange(ChangeType.FPTP_RECOMMENDATION_CHANGED)).toBe(true);
  });
  it('uses the score-delta threshold', () => {
    expect(isSignificantChange(ChangeType.SCORE_DECREASED, -12)).toBe(true);
    expect(isSignificantChange(ChangeType.SCORE_DECREASED, -3)).toBe(false);
  });
});

describe('candidateMovement', () => {
  it('records improvement above the threshold', () => {
    const m = candidateMovement(50, 62);
    expect(m?.changeType).toBe(ChangeType.CANDIDATE_IMPROVED);
    expect(m?.significant).toBe(true);
  });
  it('ignores sub-threshold movement', () => {
    expect(candidateMovement(50, 53)).toBeNull();
  });
});

describe('fptpStaleness', () => {
  it('marks a scenario stale when a material input moved', () => {
    const r = fptpStaleness({ fptpScenarioId: 's1', deltas: { localAssociationSupport: 18 } });
    expect(r.stale).toBe(true);
    expect(r.recommendRerun).toBe(true);
    expect(r.staleAssumptions).toContain('local association support');
  });
  it('keeps a scenario fresh when nothing material changed', () => {
    const r = fptpStaleness({ fptpScenarioId: 's2', deltas: { candidateSeatFit: 3 } });
    expect(r.stale).toBe(false);
  });
});

describe('factionEscalation', () => {
  it('escalates on coordinated opposition', () => {
    const { risks, changes } = factionEscalation({ subjectEntityId: 'cand', factionEntityId: 'fac', factionName: 'Group A', hostileHighInfluenceOpponentsInWindow: 3, overdueCommitmentToFactionMember: false });
    expect(changes[0].changeType).toBe(ChangeType.FACTION_BECAME_MORE_HOSTILE);
    expect(risks.length).toBe(1);
  });
  it('does not escalate on a single opponent', () => {
    const { risks } = factionEscalation({ subjectEntityId: 'cand', factionEntityId: 'fac', factionName: 'Group A', hostileHighInfluenceOpponentsInWindow: 1, overdueCommitmentToFactionMember: false });
    expect(risks.length).toBe(0);
  });
});

describe('policyRadiusMovement', () => {
  it('expands the radius when a local issue gains salience', () => {
    const changes = policyRadiusMovement({ localIssueSalienceIncreased: true });
    expect(changes.some((c) => c.changeType === ChangeType.POLICY_RADIUS_EXPANDED)).toBe(true);
  });
  it('reduces stakeholder risk after a briefing', () => {
    const changes = policyRadiusMovement({ briefingCompleted: true });
    expect(changes.some((c) => c.changeType === ChangeType.POLICY_RADIUS_REDUCED)).toBe(true);
  });
});
