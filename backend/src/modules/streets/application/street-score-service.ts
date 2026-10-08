import type { ReportViewportQuery } from '../../reports/application/report-repository.js';
import { streetScoreCalculator } from '../domain/street-score-calculator.js';
import type { StreetScoreRepository } from './street-score-repository.js';
import type { StreetScoreLevel } from '../domain/street-score-calculator.js';

export class StreetScoreService {
  constructor(
    private readonly repository: StreetScoreRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async findConditionInViewport(
    query: ReportViewportQuery,
    zoom: number,
    levels?: StreetScoreLevel[],
  ) {
    const calculatedAt = this.clock();
    const geometry = await this.repository.findConditionGeometry(query, zoom);
    const ids = [...new Set(geometry.flatMap((feature) => feature.segmentIds))];
    const evidence = await this.repository.findSegmentScores(ids, calculatedAt);
    const bySegment = new Map(evidence.map((segment) => [segment.id, segment.reports]));
    const features = geometry
      .map((item) => {
        const segments = item.segmentIds.map((id) => ({ id, reports: bySegment.get(id) ?? [] }));
        const score =
          zoom >= 15
            ? streetScoreCalculator.calculateSegment({
                targetId: item.id,
                reports: segments[0]?.reports ?? [],
                calculatedAt,
              })
            : streetScoreCalculator.calculateStreet({
                targetId: item.streetId,
                officialName: item.streetName,
                segments,
                calculatedAt,
              });
        const properties = {
          id: item.id,
          streetId: item.streetId,
          streetName: item.streetName,
          targetType: zoom >= 15 ? ('SEGMENT' as const) : ('STREET' as const),
          score: score.hasEvidence ? score.score : null,
          level: score.hasEvidence ? score.level : null,
          hasEvidence: score.hasEvidence,
          confidence: score.hasEvidence ? score.confidence : null,
          factors: score.factors,
          metrics: score.metrics,
          availability: score.availability,
          calculatedAt: calculatedAt.toISOString(),
        };
        return { type: 'Feature' as const, id: item.id, geometry: item.geometry, properties };
      })
      .filter(
        (feature) =>
          levels === undefined ||
          (feature.properties.level !== null && levels.includes(feature.properties.level)),
      );
    return { type: 'FeatureCollection' as const, features };
  }

  async findForStreet(streetId: string) {
    const calculatedAt = this.clock();
    const street = await this.repository.findStreetScore(streetId, calculatedAt);
    if (!street) return null;
    return streetScoreCalculator.calculateStreet({
      targetId: street.id,
      officialName: street.officialName,
      segments: street.segments,
      calculatedAt,
    });
  }

  async findForSegment(segmentId: string) {
    const calculatedAt = this.clock();
    const segment = await this.repository.findSegmentScore(segmentId, calculatedAt);
    if (!segment) return null;
    return streetScoreCalculator.calculateSegment({
      targetId: segment.id,
      reports: segment.reports,
      calculatedAt,
    });
  }

  async findForSegments(segmentIds: string[]) {
    const ids = [...new Set(segmentIds)];
    if (ids.length === 0) return [];
    const calculatedAt = this.clock();
    const inputs = await this.repository.findSegmentScores(ids, calculatedAt);
    const reportsById = new Map(inputs.map((segment) => [segment.id, segment.reports]));
    return ids.map((id) =>
      streetScoreCalculator.calculateSegment({
        targetId: id,
        reports: reportsById.get(id) ?? [],
        calculatedAt,
      }),
    );
  }
}
