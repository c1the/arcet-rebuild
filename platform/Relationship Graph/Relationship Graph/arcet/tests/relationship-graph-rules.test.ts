// =============================================================================
// relationship-graph-rules.test.ts — pure scoring/path/gap/action rules (no DB)
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  scoreStrength,
  scoreTrust,
  scoreInfluence,
  scoreAccessValue,
  scoreStrategicValue,
  scoreStaleness,
  scoreRepairability,
  scoreRelationshipRisk,
  scoreBriefingPriority,
  deriveStatus,
  scoreAccessPath,
  gapSeverity,
  relationshipActions,
  STALE_DAYS,
  STALE_HIGH_DAYS,
} from '../src/domain/relationship-graph/rules.js';
import { RelationshipScoreType, RelationshipStatus, RelationshipGapType } from '../src/domain/relationship-graph/enums.js';
import { Attitude, InfluenceLevel, Confidence, Severity, ActionType } from '../src/domain/ontology/enums.js';
import type { PathEdgeSignals } from '../src/domain/relationship-graph/types.js';

describe('strength + trust', () => {
  it('strength rises with recent confirmed interaction, falls with hostility', () => {
    const strong = scoreStrength({ currentStrength: 4, recentMeeting: true, humanConfirmed: true, interactionCount: 5 });
    const weak = scoreStrength({ currentStrength: 2, daysSinceInteraction: 200, hostileStatement: true });
    expect(strong.value).toBeGreaterThan(weak.value);
    expect(strong.scoreType).toBe(RelationshipScoreType.RELATIONSHIP_STRENGTH);
  });
  it('trust falls hard on a broken commitment', () => {
    const ok = scoreTrust({ currentTrust: 4, commitmentsFulfilled: 2, positiveOutcome: true });
    const broken = scoreTrust({ currentTrust: 4, brokenCommitment: true, unresolvedGrievance: true });
    expect(ok.value).toBeGreaterThan(broken.value);
  });
});

describe('influence + access + strategic', () => {
  it('influence is driven by level + role/access', () => {
    const hi = scoreInfluence({ influenceLevel: InfluenceLevel.HIGH, formalRole: true, controlsAccess: true });
    const lo = scoreInfluence({ influenceLevel: InfluenceLevel.LOW });
    expect(hi.value).toBeGreaterThan(lo.value);
  });
  it('access value rewards gatekeepers/brokers', () => {
    const gate = scoreAccessValue({ controlsAccessToTarget: true, isGatekeeper: true });
    expect(gate.value).toBeGreaterThan(scoreAccessValue({}).value);
  });
  it('strategic value accumulates across affected decisions', () => {
    const s = scoreStrategicValue({ affectsCandidateSelection: true, affectsFPTP: true, affectsLocalAssociationSupport: true });
    expect(s.value).toBeGreaterThan(40);
  });
});

describe('staleness', () => {
  it('bands on days since interaction and escalates for high influence', () => {
    expect(scoreStaleness({ daysSinceInteraction: 5 }).value).toBeLessThan(scoreStaleness({ daysSinceInteraction: STALE_DAYS + 5 }).value);
    const hi = scoreStaleness({ daysSinceInteraction: STALE_DAYS + 5, influenceLevel: InfluenceLevel.HIGH });
    const lo = scoreStaleness({ daysSinceInteraction: STALE_DAYS + 5, influenceLevel: InfluenceLevel.LOW });
    expect(hi.value).toBeGreaterThanOrEqual(lo.value);
  });
  it('recent interaction reduces staleness', () => {
    expect(scoreStaleness({ daysSinceInteraction: 40, recentInteraction: true }).value).toBeLessThan(scoreStaleness({ daysSinceInteraction: 40 }).value);
  });
});

describe('repairability + risk + briefing', () => {
  it('repairability falls on fatal breach', () => {
    expect(scoreRepairability({ contactable: true, brokerExists: true }).value).toBeGreaterThan(scoreRepairability({ fatalBreach: true }).value);
  });
  it('risk rises for hostile high-influence with compliance flag', () => {
    const r = scoreRelationshipRisk({ attitude: Attitude.HOSTILE, influenceLevel: InfluenceLevel.HIGH, complianceFlag: true });
    expect(r.value).toBeGreaterThan(40);
    expect(r.scoreType).toBe(RelationshipScoreType.RISK);
  });
  it('briefing priority rises when policy affects a high-influence unknown-attitude stakeholder', () => {
    const b = scoreBriefingPriority({ policyAffectsStakeholder: true, highInfluence: true, attitudeUnknownOrHostile: true });
    expect(b.value).toBeGreaterThanOrEqual(55);
  });
});

describe('deriveStatus', () => {
  it('maps hostile+repairable to NEEDS_REPAIR, hostile+unrepairable to HOSTILE', () => {
    expect(deriveStatus({ attitude: Attitude.HOSTILE, stalenessScore: 10, riskScore: 50, repairabilityScore: 70 })).toBe(RelationshipStatus.NEEDS_REPAIR);
    expect(deriveStatus({ attitude: Attitude.HOSTILE, stalenessScore: 10, riskScore: 50, repairabilityScore: 20 })).toBe(RelationshipStatus.HOSTILE);
  });
  it('maps high staleness to STALE and flags sensitive/archived first', () => {
    expect(deriveStatus({ attitude: Attitude.NEUTRAL, stalenessScore: 70, riskScore: 10 })).toBe(RelationshipStatus.STALE);
    expect(deriveStatus({ attitude: Attitude.NEUTRAL, stalenessScore: 70, riskScore: 10, sensitive: true })).toBe(RelationshipStatus.SENSITIVE);
    expect(deriveStatus({ attitude: Attitude.NEUTRAL, stalenessScore: 70, riskScore: 10, archived: true })).toBe(RelationshipStatus.ARCHIVED);
  });
});

describe('scoreAccessPath', () => {
  const edge = (over: Partial<PathEdgeSignals> = {}): PathEdgeSignals => ({ relationshipId: 'r', fromEntityId: 'a', toEntityId: 'b', strength: 4, trustLevel: 4, influenceLevel: InfluenceLevel.HIGH, attitude: Attitude.SUPPORTIVE, confidence: Confidence.HIGH, daysSinceInteraction: 10, ...over });

  it('a short strong path scores higher than a long one', () => {
    const short = scoreAccessPath([edge()]);
    const long = scoreAccessPath([edge(), edge(), edge()]);
    expect(short.pathQualityScore).toBeGreaterThan(long.pathQualityScore);
    expect(short.blocked).toBe(false);
  });
  it('blocks a path through a restricted relationship', () => {
    const p = scoreAccessPath([edge(), edge({ restricted: true })]);
    expect(p.blocked).toBe(true);
    expect(p.pathRiskScore).toBeGreaterThan(0);
  });
  it('raises risk for hostile intermediaries', () => {
    expect(scoreAccessPath([edge({ attitude: Attitude.HOSTILE })]).pathRiskScore).toBeGreaterThan(scoreAccessPath([edge()]).pathRiskScore);
  });
});

describe('gapSeverity', () => {
  it('escalates no-relationship/owner gaps for high-influence targets', () => {
    expect(gapSeverity(RelationshipGapType.NO_RELATIONSHIP, true)).toBe(Severity.HIGH);
    expect(gapSeverity(RelationshipGapType.NO_RELATIONSHIP, false)).toBe(Severity.MEDIUM);
    expect(gapSeverity(RelationshipGapType.UNRESOLVED_COMMITMENT, false)).toBe(Severity.HIGH);
  });
});

describe('relationshipActions', () => {
  it('recommends follow-up for a stale high-value relationship', () => {
    const acts = relationshipActions({ stalenessScore: 70, riskScore: 30, strategicValue: 70 });
    expect(acts.some((a) => a.actionType === ActionType.FOLLOW_UP)).toBe(true);
  });
  it('recommends repair for a hostile-but-repairable high-value relationship', () => {
    const acts = relationshipActions({ stalenessScore: 20, riskScore: 60, strategicValue: 70, attitude: Attitude.HOSTILE, repairabilityScore: 70 });
    expect(acts.some((a) => a.actionType === ActionType.REPAIR_RELATIONSHIP)).toBe(true);
  });
  it('recommends consult-broker when hostile and not repairable', () => {
    const acts = relationshipActions({ stalenessScore: 20, riskScore: 70, strategicValue: 70, attitude: Attitude.HOSTILE, repairabilityScore: 20 });
    expect(acts.some((a) => a.actionType === ActionType.CONSULT_FACTION_BROKER)).toBe(true);
  });
  it('recommends assign-owner when a high-value relationship lacks an owner', () => {
    const acts = relationshipActions({ stalenessScore: 10, riskScore: 20, strategicValue: 70, hasOwner: false });
    expect(acts.some((a) => a.actionType === ActionType.ASSIGN_RELATIONSHIP_OWNER)).toBe(true);
  });
});
