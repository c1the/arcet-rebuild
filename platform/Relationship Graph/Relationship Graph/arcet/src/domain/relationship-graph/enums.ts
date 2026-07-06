// =============================================================================
// enums.ts — relationship-graph enums mirroring the new Prisma enums.
// Defined independently of the generated client so the pure layer typechecks
// before `prisma generate`.
// =============================================================================

export const RelationshipStatus = {
  ACTIVE: 'ACTIVE',
  STALE: 'STALE',
  NEEDS_REPAIR: 'NEEDS_REPAIR',
  HOSTILE: 'HOSTILE',
  SENSITIVE: 'SENSITIVE',
  UNKNOWN: 'UNKNOWN',
  ARCHIVED: 'ARCHIVED',
} as const;
export type RelationshipStatus = (typeof RelationshipStatus)[keyof typeof RelationshipStatus];

export const RelationshipNoteType = {
  GENERAL: 'GENERAL',
  MEETING_NOTE: 'MEETING_NOTE',
  CALL_NOTE: 'CALL_NOTE',
  PRIVATE_NOTE: 'PRIVATE_NOTE',
  RISK_NOTE: 'RISK_NOTE',
  ACTION_NOTE: 'ACTION_NOTE',
  COMPLIANCE_NOTE: 'COMPLIANCE_NOTE',
  SOURCE_NOTE: 'SOURCE_NOTE',
} as const;
export type RelationshipNoteType = (typeof RelationshipNoteType)[keyof typeof RelationshipNoteType];

export const RelationshipGapContextType = {
  CANDIDATE: 'CANDIDATE',
  CONSTITUENCY: 'CONSTITUENCY',
  POLICY: 'POLICY',
  FACTION: 'FACTION',
  FPTP_SCENARIO: 'FPTP_SCENARIO',
  CANDIDATE_SELECTION: 'CANDIDATE_SELECTION',
  WAR_ROOM: 'WAR_ROOM',
} as const;
export type RelationshipGapContextType = (typeof RelationshipGapContextType)[keyof typeof RelationshipGapContextType];

export const RelationshipGapType = {
  NO_RELATIONSHIP: 'NO_RELATIONSHIP',
  WEAK_RELATIONSHIP: 'WEAK_RELATIONSHIP',
  STALE_RELATIONSHIP: 'STALE_RELATIONSHIP',
  HOSTILE_RELATIONSHIP: 'HOSTILE_RELATIONSHIP',
  NO_RELATIONSHIP_OWNER: 'NO_RELATIONSHIP_OWNER',
  NO_RECENT_BRIEFING: 'NO_RECENT_BRIEFING',
  UNRESOLVED_COMMITMENT: 'UNRESOLVED_COMMITMENT',
  UNKNOWN_ATTITUDE: 'UNKNOWN_ATTITUDE',
  LOW_CONFIDENCE_DATA: 'LOW_CONFIDENCE_DATA',
} as const;
export type RelationshipGapType = (typeof RelationshipGapType)[keyof typeof RelationshipGapType];

export const RelationshipGapStatus = {
  OPEN: 'OPEN',
  ACTION_CREATED: 'ACTION_CREATED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const;
export type RelationshipGapStatus = (typeof RelationshipGapStatus)[keyof typeof RelationshipGapStatus];

export const RelationshipScoreType = {
  RELATIONSHIP_STRENGTH: 'RELATIONSHIP_STRENGTH',
  TRUST: 'TRUST',
  INFLUENCE: 'INFLUENCE',
  ACCESS_VALUE: 'ACCESS_VALUE',
  STRATEGIC_VALUE: 'STRATEGIC_VALUE',
  STALENESS: 'STALENESS',
  RISK: 'RISK',
  REPAIRABILITY: 'REPAIRABILITY',
  BRIEFING_PRIORITY: 'BRIEFING_PRIORITY',
} as const;
export type RelationshipScoreType = (typeof RelationshipScoreType)[keyof typeof RelationshipScoreType];

export const RelationshipImportBatchStatus = {
  UPLOADED: 'UPLOADED',
  PROCESSING: 'PROCESSING',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type RelationshipImportBatchStatus = (typeof RelationshipImportBatchStatus)[keyof typeof RelationshipImportBatchStatus];

// Recommended tags (brief §7.1). Tags are stored as free strings to keep tagging
// flexible; this const documents the standard set.
export const RECOMMENDED_TAGS = [
  'KEY_STAKEHOLDER',
  'LOCAL_POWER_BROKER',
  'FACTION_BROKER',
  'GATEKEEPER',
  'HOSTILE',
  'REPAIRABLE',
  'SENSITIVE',
  'HIGH_ACCESS_VALUE',
  'LOCAL_ASSOCIATION',
  'MEDIA',
  'DONOR_RELATED',
  'POLICY_RELEVANT',
  'CANDIDATE_SELECTION_RELEVANT',
  'FPTP_RELEVANT',
  'COMPLIANCE_REVIEW_REQUIRED',
] as const;
export type RecommendedTag = (typeof RECOMMENDED_TAGS)[number];
