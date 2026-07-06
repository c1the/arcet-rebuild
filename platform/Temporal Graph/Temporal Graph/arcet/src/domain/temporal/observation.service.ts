// =============================================================================
// observation.service.ts — timestamped values for time series (§6.5)
// =============================================================================
import { prisma, type Tx } from '../ontology/db.js';
import { Confidence } from '../ontology/enums.js';
import { ObservationType } from './enums.js';
import { recordObservationSchema } from './validators.js';
import type { ActorContext, ObservationFilters, ObservationPoint, RecordObservationInput, UUID } from './types.js';

export const ObservationService = {
  async recordObservation(input: RecordObservationInput, actor?: ActorContext, tx?: Tx) {
    const data = recordObservationSchema.parse(input);
    const client = tx ?? prisma;
    return client.temporalObservation.create({
      data: {
        subjectEntityId: data.subjectEntityId,
        contextEntityId: data.contextEntityId,
        relationshipId: data.relationshipId,
        riskId: data.riskId,
        scoreId: data.scoreId,
        actionRecommendationId: data.actionRecommendationId,
        observationType: data.observationType,
        observedAt: data.observedAt ?? new Date(),
        validFrom: data.validFrom,
        validTo: data.validTo,
        valueNumeric: data.valueNumeric,
        valueText: data.valueText,
        valueJson: (data.valueJson ?? undefined) as never,
        confidence: data.confidence ?? Confidence.LOW,
        sourceModule: data.sourceModule,
        sourceEvidenceId: data.sourceEvidenceId,
        sourceTemporalEventId: data.sourceTemporalEventId,
        createdByUserId: actor?.userId,
      },
    });
  },

  async getObservationsForEntity(entityId: UUID, observationType?: ObservationType, filters: ObservationFilters = {}) {
    return prisma.temporalObservation.findMany({
      where: {
        subjectEntityId: entityId,
        ...(observationType ? { observationType } : {}),
        ...(filters.contextEntityId ? { contextEntityId: filters.contextEntityId } : {}),
        ...this._dateWhere(filters),
      },
      orderBy: { observedAt: 'asc' },
      take: filters.limit ?? 500,
    });
  },

  async getLatestObservation(entityId: UUID, observationType: ObservationType, contextEntityId?: UUID) {
    return prisma.temporalObservation.findFirst({
      where: { subjectEntityId: entityId, observationType, ...(contextEntityId ? { contextEntityId } : {}) },
      orderBy: { observedAt: 'desc' },
    });
  },

  /** Returns numeric points (observedAt, value) for trend analysis. */
  async getObservationTrendPoints(entityId: UUID, observationType: ObservationType, filters: ObservationFilters = {}): Promise<ObservationPoint[]> {
    const rows = await prisma.temporalObservation.findMany({
      where: { subjectEntityId: entityId, observationType, valueNumeric: { not: null }, ...this._dateWhere(filters), ...(filters.contextEntityId ? { contextEntityId: filters.contextEntityId } : {}) },
      orderBy: { observedAt: 'asc' },
      take: filters.limit ?? 500,
    });
    return rows.filter((r) => r.valueNumeric != null).map((r) => ({ observedAt: r.observedAt, value: r.valueNumeric as number }));
  },

  async getObservationsBetween(startDate: Date, endDate: Date, observationType?: ObservationType) {
    return prisma.temporalObservation.findMany({
      where: { observedAt: { gte: startDate, lte: endDate }, ...(observationType ? { observationType } : {}) },
      orderBy: { observedAt: 'asc' },
    });
  },

  _dateWhere(filters: ObservationFilters) {
    if (!filters.startDate && !filters.endDate) return {};
    return { observedAt: { ...(filters.startDate ? { gte: filters.startDate } : {}), ...(filters.endDate ? { lte: filters.endDate } : {}) } };
  },
};
