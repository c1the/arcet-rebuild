// =============================================================================
// seed.ts — realistic demo data (§21). Run with: npm run db:seed
// -----------------------------------------------------------------------------
// Produces the required counts and wires up the relationships/events/risks the
// acceptance demos rely on (candidate comparison, stale-relationship detection,
// policy blast radius, faction risk, FPTP scenarios, war-room summary).
//
// All data here is FICTIONAL and exists only to exercise the ontology. It is
// not real intelligence about real people. The MVP models candidates,
// stakeholders, factions and seats — never individual voters (see brief §24).
// =============================================================================
import { prisma } from './db.js';
import { EntityService } from './entity.service.js';
import { RelationshipService } from './relationship.service.js';
import { EvidenceService } from './evidence.service.js';
import { EventService } from './event.service.js';
import { RiskService } from './risk.service.js';
import { ActionService } from './action.service.js';
import { CandidateContextService } from './candidate-context.service.js';
import { FPTPContextService } from './fptp-context.service.js';
import { PolicyRadiusContextService } from './policy-radius-context.service.js';
import {
  Attitude,
  CandidateStatus,
  Confidence,
  DataClassification,
  EventType,
  FPTPRecommendationLabel,
  FPTPScenarioType,
  FactionMood,
  FactionType,
  InfluenceLevel,
  IssueCategory,
  LeadershipAlignment,
  OrganisationType,
  ParticipantRole,
  PersonType,
  PolicyImpactType,
  PolicyStatus,
  RelationshipType,
  Reliability,
  RiskLinkRole,
  RiskType,
  Severity,
  SourceType,
  StrategicPriority,
  TargetStatus,
  VettingStatus,
} from './enums.js';

const actor = { userId: 'seed-script' };
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function main() {
  console.log('Seeding Arcet ontology…');

  // ---- Organisations (10) --------------------------------------------------
  const partyMain = await EntityService.createOrganisation({ displayName: 'National Party (fictional)' }, { organisationType: OrganisationType.POLITICAL_PARTY, politicalRelevance: InfluenceLevel.CRITICAL }, actor);
  const partyRival = await EntityService.createOrganisation({ displayName: 'Opposition Party (fictional)' }, { organisationType: OrganisationType.POLITICAL_PARTY, politicalRelevance: InfluenceLevel.HIGH }, actor);
  const orgs = [partyMain, partyRival];
  const orgSpecs: { name: string; type: string }[] = [
    { name: 'Northbridge Local Association', type: OrganisationType.LOCAL_PARTY_ASSOCIATION },
    { name: 'Easthaven Local Association', type: OrganisationType.LOCAL_PARTY_ASSOCIATION },
    { name: 'Westfield Local Association', type: OrganisationType.LOCAL_PARTY_ASSOCIATION },
    { name: 'Riverside Chamber of Commerce', type: OrganisationType.BUSINESS },
    { name: 'County Gazette', type: OrganisationType.MEDIA_OUTLET },
    { name: 'Care Workers Union', type: OrganisationType.UNION },
    { name: 'Open Spaces Trust', type: OrganisationType.CHARITY },
    { name: 'Civic Futures Think Tank', type: OrganisationType.THINK_TANK },
  ];
  for (const s of orgSpecs) {
    orgs.push(await EntityService.createOrganisation({ displayName: s.name }, { organisationType: s.type as never, politicalRelevance: InfluenceLevel.MEDIUM }, actor));
  }
  const localAssociations = orgs.slice(2, 5); // the three local associations

  // ---- Constituencies (3) --------------------------------------------------
  const constituencySpecs = [
    { name: 'Northbridge', target: TargetStatus.MARGINAL, prio: StrategicPriority.CRITICAL, lps: 4, vol: 4, tac: 4, spo: 3 },
    { name: 'Easthaven', target: TargetStatus.TARGET, prio: StrategicPriority.HIGH, lps: 3, vol: 3, tac: 3, spo: 2 },
    { name: 'Westfield', target: TargetStatus.LONG_SHOT, prio: StrategicPriority.MEDIUM, lps: 2, vol: 5, tac: 2, spo: 4 },
  ];
  const constituencies = [];
  for (let i = 0; i < constituencySpecs.length; i++) {
    const s = constituencySpecs[i];
    const c = await EntityService.createConstituency(
      { displayName: s.name },
      {
        name: s.name,
        region: 'Fictional Region',
        country: 'United Kingdom',
        targetStatus: s.target,
        strategicPriority: s.prio,
        incumbentPartyEntityId: i === 0 ? partyRival.entity.id : partyMain.entity.id,
        localPartyStrength: s.lps,
        campaignReadiness: 3,
        stakeholderCoverageScore: 40 + i * 15,
        localIssueVolatility: s.vol,
        tacticalVotingRisk: s.tac,
        spoilerRisk: s.spo,
        overallCompetitiveness: 60 - i * 10,
      },
      actor,
    );
    constituencies.push(c);
    // link each local association to its constituency (soft pointer)
    await prisma.organisationProfile.update({ where: { entityId: localAssociations[i].entity.id }, data: { primaryConstituencyId: c.entity.id } });
  }

  // ---- Issues (8) ----------------------------------------------------------
  const issueSpecs: { name: string; cat: string; local: number }[] = [
    { name: 'Hospital waiting times', cat: IssueCategory.HEALTH, local: 5 },
    { name: 'New housing development', cat: IssueCategory.HOUSING, local: 5 },
    { name: 'Rail line closure', cat: IssueCategory.TRANSPORT, local: 4 },
    { name: 'School funding', cat: IssueCategory.EDUCATION, local: 3 },
    { name: 'High street decline', cat: IssueCategory.ECONOMY, local: 4 },
    { name: 'Green belt planning', cat: IssueCategory.PLANNING, local: 4 },
    { name: 'Council tax', cat: IssueCategory.TAX, local: 3 },
    { name: 'Flood defences', cat: IssueCategory.ENVIRONMENT, local: 5 },
  ];
  const issues = [];
  for (const s of issueSpecs) {
    issues.push(
      await EntityService.createIssue(
        { displayName: s.name },
        { name: s.name, issueCategory: s.cat as never, nationalRelevance: 3, localRelevance: s.local, mediaSensitivity: 3, factionSensitivity: 3, complianceSensitivity: 2 },
        actor,
      ),
    );
  }

  // ---- Factions (3) --------------------------------------------------------
  const factionSpecs = [
    { name: 'Traditionalist Bloc', type: FactionType.IDEOLOGICAL, mood: FactionMood.AGITATED, align: LeadershipAlignment.SCEPTICAL, risk: InfluenceLevel.HIGH },
    { name: 'Modernisers', type: FactionType.LEADERSHIP_CAMP, mood: FactionMood.CALM, align: LeadershipAlignment.SUPPORTIVE, risk: InfluenceLevel.MEDIUM },
    { name: 'Northbridge Selection Bloc', type: FactionType.CANDIDATE_SELECTION_BLOC, mood: FactionMood.WATCHING, align: LeadershipAlignment.NEUTRAL, risk: InfluenceLevel.MEDIUM },
  ];
  const factions = [];
  for (const s of factionSpecs) {
    factions.push(
      await EntityService.createFaction(
        { displayName: s.name },
        { name: s.name, factionType: s.type, currentMood: s.mood, leadershipAlignment: s.align, riskLevel: s.risk, influenceScore: 60, confidence: Confidence.MEDIUM },
        actor,
      ),
    );
  }

  // ---- People (20) + Candidates (5) ---------------------------------------
  // First 5 people double as candidates' underlying person entities.
  const people = [];
  const personTypesCycle = [PersonType.LOCAL_PARTY_OFFICER, PersonType.STAKEHOLDER, PersonType.JOURNALIST, PersonType.DONOR, PersonType.ACTIVIST, PersonType.ADVISER, PersonType.PUBLIC_OFFICIAL];
  for (let i = 0; i < 20; i++) {
    const pt = personTypesCycle[i % personTypesCycle.length];
    people.push(
      await EntityService.createPerson(
        { displayName: `Person ${i + 1}` },
        {
          firstName: 'Person',
          lastName: String(i + 1),
          personType: pt,
          isStakeholder: pt === PersonType.STAKEHOLDER,
          isJournalist: pt === PersonType.JOURNALIST,
          isDonor: pt === PersonType.DONOR,
          isLocalPartyFigure: pt === PersonType.LOCAL_PARTY_OFFICER,
          riskLevel: i % 5 === 0 ? InfluenceLevel.HIGH : InfluenceLevel.MEDIUM,
          confidence: Confidence.MEDIUM,
        },
        actor,
      ),
    );
  }

  const candidateSpecs = [
    { name: 'Candidate Alpha', seat: 0, local: 75, assoc: 70, media: 55, stake: 65, faction: 60, issue: 70, risk: 20, dev: 60, status: CandidateStatus.SHORT_LISTED },
    { name: 'Candidate Bravo', seat: 0, local: 45, assoc: 35, media: 80, stake: 50, faction: 40, issue: 60, risk: 55, dev: 70, status: CandidateStatus.SHORT_LISTED },
    { name: 'Candidate Charlie', seat: 0, local: 60, assoc: 55, media: 50, stake: 45, faction: 30, issue: 50, risk: 70, dev: 50, status: CandidateStatus.UNDER_REVIEW },
    { name: 'Candidate Delta', seat: 1, local: 70, assoc: 65, media: 60, stake: 60, faction: 65, issue: 65, risk: 25, dev: 65, status: CandidateStatus.SELECTED },
    { name: 'Candidate Echo', seat: 2, local: 30, assoc: 25, media: 45, stake: 30, faction: 50, issue: 40, risk: 60, dev: 80, status: CandidateStatus.PROSPECTIVE },
  ];
  const candidates = [];
  for (let i = 0; i < candidateSpecs.length; i++) {
    const s = candidateSpecs[i];
    const personEntityId = people[i].entity.id;
    const cand = await EntityService.createCandidate(
      { displayName: s.name },
      {
        personEntityId,
        currentTargetConstituencyId: constituencies[s.seat].entity.id,
        partyEntityId: partyMain.entity.id,
        candidateStatus: s.status,
        localConnectionScore: s.local,
        localAssociationSupportScore: s.assoc,
        mediaReadinessScore: s.media,
        stakeholderStrengthScore: s.stake,
        factionAcceptabilityScore: s.faction,
        issueCredibilityScore: s.issue,
        campaignCapacityScore: 55,
        politicalExperienceScore: 50,
        riskScore: s.risk,
        developmentPotentialScore: s.dev,
        overallReadinessScore: 55,
        vettingStatus: s.risk >= 60 ? VettingStatus.NEEDS_REVIEW : VettingStatus.IN_PROGRESS,
      },
      actor,
    );
    candidates.push(cand);
    await prisma.personProfile.update({ where: { entityId: personEntityId }, data: { isCandidate: true, isPolitician: true } });
  }

  // ---- Relationships (40) --------------------------------------------------
  let relCount = 0;
  const rel = async (src: string, tgt: string, type: string, opts: Partial<{ strength: number; attitude: string; influence: string; last: Date | null; ownerUser: string }> = {}) => {
    await RelationshipService.createRelationship(
      {
        sourceEntityId: src,
        targetEntityId: tgt,
        type: type as never,
        strength: opts.strength ?? 3,
        attitude: (opts.attitude as never) ?? Attitude.NEUTRAL,
        influenceLevel: (opts.influence as never) ?? InfluenceLevel.MEDIUM,
        confidence: Confidence.MEDIUM,
        lastInteractionAt: opts.last === undefined ? daysAgo(20) : opts.last,
        relationshipOwnerUserId: opts.ownerUser,
      },
      actor,
    );
    relCount++;
  };

  // Issues matter to constituencies (drives local salience + policy radius)
  await rel(issues[0].entity.id, constituencies[0].entity.id, RelationshipType.MATTERS_TO_CONSTITUENCY, { strength: 5, influence: InfluenceLevel.HIGH });
  await rel(issues[1].entity.id, constituencies[0].entity.id, RelationshipType.MATTERS_TO_CONSTITUENCY, { strength: 4, influence: InfluenceLevel.HIGH });
  await rel(issues[2].entity.id, constituencies[1].entity.id, RelationshipType.MATTERS_TO_CONSTITUENCY, { strength: 4 });
  await rel(issues[5].entity.id, constituencies[2].entity.id, RelationshipType.MATTERS_TO_CONSTITUENCY, { strength: 5, influence: InfluenceLevel.HIGH });
  await rel(issues[7].entity.id, constituencies[2].entity.id, RelationshipType.MATTERS_TO_CONSTITUENCY, { strength: 5, influence: InfluenceLevel.HIGH });

  // Candidates -> target constituency ties + association links
  await rel(candidates[0].entity.id, constituencies[0].entity.id, RelationshipType.INTERESTED_IN, { strength: 4, attitude: Attitude.SUPPORTIVE, influence: InfluenceLevel.HIGH });
  await rel(candidates[0].entity.id, localAssociations[0].entity.id, RelationshipType.SUPPORTS, { strength: 4, attitude: Attitude.SUPPORTIVE });
  await rel(candidates[1].entity.id, constituencies[0].entity.id, RelationshipType.INTERESTED_IN, { strength: 3 });
  // NOTE: Candidate Bravo deliberately has NO local association link -> gap demo
  await rel(candidates[3].entity.id, localAssociations[1].entity.id, RelationshipType.BELONGS_TO, { strength: 4, attitude: Attitude.SUPPORTIVE });

  // Stakeholders matter to constituencies (some without owners -> gap demo)
  await rel(people[1].entity.id, constituencies[0].entity.id, RelationshipType.MATTERS_TO_CONSTITUENCY, { strength: 4, influence: InfluenceLevel.HIGH, ownerUser: undefined, last: daysAgo(200) });
  await rel(people[5].entity.id, constituencies[0].entity.id, RelationshipType.MATTERS_TO_CONSTITUENCY, { strength: 5, influence: InfluenceLevel.CRITICAL, ownerUser: 'staffer-1', last: daysAgo(120) });
  await rel(people[6].entity.id, constituencies[1].entity.id, RelationshipType.MATTERS_TO_CONSTITUENCY, { strength: 3 });

  // Faction memberships (with some hostile high-influence members -> faction risk)
  await rel(people[0].entity.id, factions[0].entity.id, RelationshipType.MEMBER_OF_FACTION, { strength: 5, attitude: Attitude.HOSTILE, influence: InfluenceLevel.HIGH });
  await rel(people[10].entity.id, factions[0].entity.id, RelationshipType.MEMBER_OF_FACTION, { strength: 4, attitude: Attitude.SCEPTICAL, influence: InfluenceLevel.HIGH });
  await rel(people[2].entity.id, factions[1].entity.id, RelationshipType.MEMBER_OF_FACTION, { strength: 3, attitude: Attitude.SUPPORTIVE });
  await rel(candidates[2].entity.id, factions[0].entity.id, RelationshipType.LEANING_TOWARD_FACTION, { strength: 3, attitude: Attitude.MIXED });
  await rel(candidates[0].entity.id, factions[1].entity.id, RelationshipType.MEMBER_OF_FACTION, { strength: 3, attitude: Attitude.SUPPORTIVE });
  await rel(people[3].entity.id, factions[0].entity.id, RelationshipType.BROKER_FOR, { strength: 4, influence: InfluenceLevel.HIGH });

  // Issues associated with factions (drives policy faction risk)
  await rel(issues[1].entity.id, factions[0].entity.id, RelationshipType.ASSOCIATED_WITH_ISSUE, { strength: 4 });
  await rel(issues[5].entity.id, factions[0].entity.id, RelationshipType.ASSOCIATED_WITH_ISSUE, { strength: 3 });

  // Stakeholder interest in issues (policy blast radius)
  await rel(people[1].entity.id, issues[1].entity.id, RelationshipType.INTERESTED_IN, { strength: 4 });
  await rel(people[5].entity.id, issues[5].entity.id, RelationshipType.AFFECTED_BY, { strength: 5, influence: InfluenceLevel.HIGH });
  await rel(orgs[4].entity.id, issues[5].entity.id, RelationshipType.INTERESTED_IN, { strength: 3 });

  // Fill remaining relationships up to 40 with assorted KNOWS edges
  let pIdx = 7;
  while (relCount < 40) {
    const a = people[pIdx % people.length].entity.id;
    const b = people[(pIdx + 3) % people.length].entity.id;
    if (a !== b) await rel(a, b, RelationshipType.KNOWS, { strength: ((pIdx % 5) + 1), last: daysAgo(10 + (pIdx % 250)) });
    pIdx++;
  }

  // ---- Evidence (20) -------------------------------------------------------
  const evidence = [];
  const classifications = [DataClassification.PUBLIC, DataClassification.CLIENT_PRIVATE, DataClassification.PERSONAL_DATA, DataClassification.SPECIAL_CATEGORY_RISK];
  for (let i = 0; i < 20; i++) {
    evidence.push(
      await EvidenceService.createEvidence(
        {
          title: `Evidence source ${i + 1}`,
          sourceType: i % 4 === 0 ? SourceType.PUBLIC_ARTICLE : i % 4 === 1 ? SourceType.MEETING_NOTE : i % 4 === 2 ? SourceType.PUBLIC_RECORD : SourceType.USER_NOTE,
          summary: 'Fictional evidence used to back a relationship, score, or risk.',
          reliability: i % 3 === 0 ? Reliability.HIGH : Reliability.MEDIUM,
          dataClassification: classifications[i % classifications.length],
          observedAt: daysAgo(i * 3),
        },
        actor,
      ),
    );
  }
  // attach a few to entities/relationships
  await EvidenceService.attachEvidenceToEntity(candidates[0].entity.id, evidence[0].id, undefined, actor);
  await EvidenceService.attachEvidenceToEntity(constituencies[0].entity.id, evidence[1].id, undefined, actor);

  // ---- Election results (history for FPTP) --------------------------------
  for (let i = 0; i < constituencies.length; i++) {
    for (const back of [0, 1]) {
      await prisma.electionResult.create({
        data: {
          constituencyEntityId: constituencies[i].entity.id,
          electionDate: new Date(2019 + back * 0, 11, 12),
          partyEntityId: back === 0 ? partyRival.entity.id : partyMain.entity.id,
          votes: 20000 - back * 1500 - i * 1000,
          voteShare: 42 - back * 3 - i * 2,
          position: 1 + back,
          turnout: 65,
        },
      });
    }
  }

  // ---- Events (20) ---------------------------------------------------------
  for (let i = 0; i < 20; i++) {
    const type = [EventType.MEETING, EventType.CALL, EventType.PRESS_ARTICLE, EventType.ENDORSEMENT, EventType.CAMPAIGN_VISIT][i % 5];
    await EventService.createEvent(
      {
        eventType: type,
        title: `Event ${i + 1}: ${type}`,
        summary: 'Fictional event for the timeline.',
        occurredAt: daysAgo(i * 4),
        constituencyEntityId: constituencies[i % constituencies.length].entity.id,
        issueEntityId: issues[i % issues.length].entity.id,
        confidence: Confidence.MEDIUM,
        participants: [
          { entityId: candidates[i % candidates.length].entity.id, participantRole: ParticipantRole.SUBJECT },
          { entityId: people[i % people.length].entity.id, participantRole: ParticipantRole.ATTENDEE },
        ],
      },
      actor,
    );
  }

  // ---- Risks (10) ----------------------------------------------------------
  const riskSpecs: { type: string; title: string; sev: string; subj: string }[] = [
    { type: RiskType.CANDIDATE_RISK, title: 'Candidate Charlie vetting concern', sev: Severity.HIGH, subj: candidates[2].entity.id },
    { type: RiskType.FACTION_RISK, title: 'Traditionalist Bloc resistance', sev: Severity.HIGH, subj: factions[0].entity.id },
    { type: RiskType.CONSTITUENCY_RISK, title: 'Northbridge spoiler dynamics', sev: Severity.MEDIUM, subj: constituencies[0].entity.id },
    { type: RiskType.MEDIA_RISK, title: 'Negative local press cycle', sev: Severity.MEDIUM, subj: candidates[1].entity.id },
    { type: RiskType.RELATIONSHIP_RISK, title: 'Key stakeholder relationship cooling', sev: Severity.MEDIUM, subj: people[1].entity.id },
    { type: RiskType.POLICY_RISK, title: 'Housing policy backlash', sev: Severity.HIGH, subj: issues[1].entity.id },
    { type: RiskType.COMPLIANCE_RISK, title: 'Special-category data in notes', sev: Severity.CRITICAL, subj: people[0].entity.id },
    { type: RiskType.LOCAL_ASSOCIATION_RISK, title: 'Westfield association disengaged', sev: Severity.MEDIUM, subj: localAssociations[2].entity.id },
    { type: RiskType.FPTP_STRATEGY_RISK, title: 'Resource waste risk in Westfield', sev: Severity.MEDIUM, subj: constituencies[2].entity.id },
    { type: RiskType.DATA_QUALITY_RISK, title: 'Sparse stakeholder coverage data', sev: Severity.LOW, subj: constituencies[1].entity.id },
  ];
  for (const s of riskSpecs) {
    await RiskService.createRisk(
      { riskType: s.type as never, title: s.title, severity: s.sev as never, sourceModule: 'seed', links: [{ entityId: s.subj, role: RiskLinkRole.PRIMARY_SUBJECT }] },
      actor,
    );
  }

  // ---- Actions (15) --------------------------------------------------------
  for (let i = 0; i < 15; i++) {
    await ActionService.createRecommendation(
      {
        title: `Recommended action ${i + 1}`,
        actionType: [ActionService._enums.ActionType.FOLLOW_UP, ActionService._enums.ActionType.MEET, ActionService._enums.ActionType.BRIEF][i % 3],
        priority: [ActionService._enums.ActionPriority.HIGH, ActionService._enums.ActionPriority.MEDIUM, ActionService._enums.ActionPriority.URGENT][i % 3],
        targetEntityId: candidates[i % candidates.length].entity.id,
        dueDate: daysAgo(i % 3 === 0 ? 2 : -7), // some overdue
        sourceModule: 'seed',
        rationale: 'Seeded action for the action board / war room.',
      },
      actor,
    );
  }

  // ---- Candidate-seat assessments (5) -------------------------------------
  await CandidateContextService.calculateCandidateSeatAssessment(candidates[0].entity.id, constituencies[0].entity.id, actor);
  await CandidateContextService.calculateCandidateSeatAssessment(candidates[1].entity.id, constituencies[0].entity.id, actor);
  await CandidateContextService.calculateCandidateSeatAssessment(candidates[2].entity.id, constituencies[0].entity.id, actor);
  await CandidateContextService.calculateCandidateSeatAssessment(candidates[3].entity.id, constituencies[1].entity.id, actor);
  await CandidateContextService.calculateCandidateSeatAssessment(candidates[4].entity.id, constituencies[2].entity.id, actor);

  // ---- FPTP scenarios (5) --------------------------------------------------
  const scenarioSpecs = [
    { c: 0, cand: 0, type: FPTPScenarioType.RUN_HARD, wp: 0.52, label: FPTPRecommendationLabel.COMPETE_HARD },
    { c: 0, cand: 1, type: FPTPScenarioType.CHANGE_CANDIDATE, wp: 0.3, label: FPTPRecommendationLabel.COMPETE_SELECTIVELY },
    { c: 1, cand: 3, type: FPTPScenarioType.RUN_HARD, wp: 0.6, label: FPTPRecommendationLabel.COMPETE_HARD },
    { c: 2, cand: 4, type: FPTPScenarioType.STAND_ASIDE, wp: 0.12, label: FPTPRecommendationLabel.SYMBOLIC_RUN },
    { c: 2, cand: 4, type: FPTPScenarioType.GATHER_MORE_DATA, wp: 0.15, label: FPTPRecommendationLabel.GATHER_MORE_DATA },
  ];
  const scenarios = [];
  for (const s of scenarioSpecs) {
    scenarios.push(
      await FPTPContextService.saveFPTPScenario(
        {
          constituencyEntityId: constituencies[s.c].entity.id,
          candidateEntityId: candidates[s.cand].entity.id,
          scenarioType: s.type,
          title: `${s.type} — ${constituencySpecs[s.c].name}`,
          estimatedWinProbability: s.wp,
          estimatedVoteShareLow: 28,
          estimatedVoteShareMid: 34,
          estimatedVoteShareHigh: 40,
          strategicValueScore: 60,
          futureElectionValue: s.c === 2 ? 70 : 40,
          recommendationLabel: s.label,
          rationale: 'Seeded scenario for FPTP comparison.',
          confidence: Confidence.MEDIUM,
        },
        actor,
      ),
    );
  }
  await ActionService.generateFPTPActions(scenarios[0].id, actor);

  // ---- Policy (3) + policy impacts (5) ------------------------------------
  const policies = [];
  const policySpecs = [
    { title: 'Housing densification plan', issues: [1, 5], status: PolicyStatus.UNDER_REVIEW },
    { title: 'Rural transport package', issues: [2], status: PolicyStatus.DRAFT },
    { title: 'Flood resilience investment', issues: [7], status: PolicyStatus.APPROVED },
  ];
  for (const s of policySpecs) {
    policies.push(
      await EntityService.createPolicy(
        { displayName: s.title },
        { title: s.title, policyStatus: s.status, issueEntityIds: s.issues.map((i) => issues[i].entity.id), overallPoliticalRisk: Severity.MEDIUM, overallComplianceRisk: Severity.LOW },
        actor,
      ),
    );
  }
  // materialise impacts for the housing policy (touches issues 1 & 5 -> faction + stakeholders + constituencies)
  const impacts = await PolicyRadiusContextService.materialiseImpacts(policies[0].entity.id, actor);
  // ensure we have at least 5 policy impacts total
  let extra = 0;
  while (impacts.length + extra < 5) {
    await PolicyRadiusContextService.savePolicyImpact(
      { policyEntityId: policies[2].entity.id, affectedEntityId: constituencies[2].entity.id, impactType: PolicyImpactType.AFFECTS_CONSTITUENCY, severity: Severity.HIGH },
      actor,
    );
    extra++;
  }
  await ActionService.generatePolicyActions(policies[0].entity.id, actor);

  // ---- summary -------------------------------------------------------------
  const counts = {
    entities: await prisma.entity.count(),
    relationships: await prisma.relationship.count(),
    events: await prisma.politicalEvent.count(),
    evidence: await prisma.evidenceSource.count(),
    risks: await prisma.risk.count(),
    actions: await prisma.actionRecommendation.count(),
    seatAssessments: await prisma.candidateSeatAssessment.count(),
    fptpScenarios: await prisma.fPTPScenario.count(),
    policyImpacts: await prisma.policyImpact.count(),
  };
  console.log('Seed complete:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
