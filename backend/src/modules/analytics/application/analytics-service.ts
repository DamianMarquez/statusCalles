import type { AnalyticsFilters, AnalyticsRepository } from './analytics-repository.js';
import type { StreetScoreService } from '../../streets/application/street-score-service.js';

export class AnalyticsService {
  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly streetScores?: StreetScoreService,
  ) {}

  overview(filters: AnalyticsFilters) {
    return this.repository.overview(filters);
  }

  reports(filters: AnalyticsFilters) {
    return this.repository.reports(filters);
  }

  neighborhoods(filters: AnalyticsFilters) {
    return this.repository.neighborhoods(filters);
  }

  communes(filters: AnalyticsFilters) {
    return this.repository.communes(filters);
  }

  trends(filters: AnalyticsFilters, bucket: 'day' | 'week' | 'month') {
    return this.repository.trends(filters, bucket);
  }

  heatmap(
    filters: AnalyticsFilters,
    bounds: { south: number; north: number; west: number; east: number; cellSize: number },
  ) {
    return this.repository.heatmap(filters, bounds);
  }

  async streets(_filters: AnalyticsFilters, limit: number) {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
    const candidates = (await this.repository.streets({}, boundedLimit)) as Array<{
      id: string;
      officialName: string;
      reports: number;
      active: number;
      high_severity: number;
    }>;
    if (!this.streetScores) return candidates.slice(0, limit);
    const scored = await Promise.all(
      candidates.map(async (candidate) => {
        const result = await this.streetScores!.findForStreet(candidate.id);
        return {
          ...candidate,
          score: result
            ? { score: result.score, level: result.level, confidence: result.confidence }
            : null,
        };
      }),
    );
    return scored
      .filter((item) => item.score)
      .sort(
        (left, right) => left.score!.score - right.score!.score || left.id.localeCompare(right.id),
      )
      .slice(0, boundedLimit);
  }

  async segments(_filters: AnalyticsFilters, limit: number) {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
    const segments = (await this.repository.segments({}, boundedLimit)) as Array<{
      id: string;
      streetId: string;
      officialName: string;
      reports: number;
    }>;
    if (!this.streetScores) return segments;
    const scored = await Promise.all(
      segments.map(async (segment) => {
        const result = await this.streetScores!.findForSegment(segment.id);
        return {
          ...segment,
          score: result
            ? { score: result.score, level: result.level, confidence: result.confidence }
            : null,
        };
      }),
    );
    return scored.filter((item) => item.score).sort((a, b) => a.score!.score - b.score!.score);
  }

  moderationOverview() {
    return this.repository.moderationOverview();
  }

  adminOverview() {
    return this.repository.adminOverview();
  }

  officialOverview() {
    return this.repository.officialOverview();
  }

  proximity(
    filters: AnalyticsFilters,
    point: { latitude: number; longitude: number; radiusMeters: number },
  ) {
    return this.repository.proximity(filters, point);
  }
}
