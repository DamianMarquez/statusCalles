import type { ReportViewportQuery } from '../../reports/application/report-repository.js';
import { streetScoreCalculator } from '../domain/street-score-calculator.js';
import { noDataScore } from '../domain/stored-street-score.js';
import type { StreetScoreRepository } from './street-score-repository.js';
import type { StreetScoreLevel } from '../domain/street-score-calculator.js';
import type { StreetRoadClass } from '../domain/street-road-class.js';
import { STREET_LAYER_ZOOM_CONFIG, visibleRoadClassesAtZoom } from '../domain/street-road-class.js';

export class StreetScoreService {
  constructor(
    private readonly repository: StreetScoreRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async findConditionInViewport(
    query: ReportViewportQuery,
    zoom: number,
    levels?: StreetScoreLevel[],
    roadClasses: StreetRoadClass[] = ['PRIMARY', 'SECONDARY', 'LOCAL'],
  ) {
    const calculatedAt = this.clock();
    const visibleAtZoom = visibleRoadClassesAtZoom(zoom);
    const effectiveClasses = visibleAtZoom.filter(
      (roadClass) =>
        roadClasses.includes(roadClass as StreetRoadClass) ||
        (roadClass === 'UNKNOWN' && roadClasses.includes('LOCAL')),
    ) as StreetRoadClass[];
    // Una sola lectura: los puntajes ya están calculados y guardados.
    const items = await this.repository.findConditionFeatures(query, zoom, effectiveClasses);
    const targetType =
      zoom >= STREET_LAYER_ZOOM_CONFIG.detailedSegmentMinZoom
        ? ('SEGMENT' as const)
        : ('STREET' as const);
    const features = items
      .map((item) => {
        const stored = item.score ?? noDataScore(calculatedAt);
        const properties = {
          id: item.id,
          streetId: item.streetId,
          streetName: item.streetName,
          roadClass: item.roadClass,
          roadInformation: item.roadInformation,
          targetType,
          score: stored.score,
          level: stored.level,
          // Relleno histórico para consumidores que no distinguen "sin datos".
          condition: stored.hasEvidence && stored.level ? stored.level : ('GOOD' as const),
          hasReports: stored.metrics.reports > 0,
          hasEvidence: stored.hasEvidence,
          confidence: stored.confidence,
          factors: stored.factors,
          metrics: stored.metrics,
          availability: stored.availability,
          calculatedAt: stored.calculatedAt,
        };
        return { type: 'Feature' as const, id: item.id, geometry: item.geometry, properties };
      })
      .filter((feature) => levels === undefined || levels.includes(feature.properties.condition));
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
