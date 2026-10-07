import type { ReportType } from '../../reports/domain/street-report.js';

export interface AnalyticsFilters {
  from?: Date;
  to?: Date;
  type?: ReportType;
  severity?: number;
  neighborhoodId?: number;
  communeId?: number;
}

export interface AnalyticsRepository {
  overview(filters: AnalyticsFilters): Promise<unknown>;
  reports(filters: AnalyticsFilters): Promise<unknown>;
  neighborhoods(filters: AnalyticsFilters): Promise<unknown>;
  communes(filters: AnalyticsFilters): Promise<unknown>;
  trends(filters: AnalyticsFilters, bucket: 'day' | 'week' | 'month'): Promise<unknown>;
  heatmap(
    filters: AnalyticsFilters,
    bounds: { south: number; north: number; west: number; east: number; cellSize: number },
  ): Promise<unknown>;
  streets(filters: AnalyticsFilters, limit: number): Promise<unknown>;
  segments(filters: AnalyticsFilters, limit: number): Promise<unknown>;
  moderationOverview(): Promise<unknown>;
  adminOverview(): Promise<unknown>;
  officialOverview(): Promise<unknown>;
  proximity(
    filters: AnalyticsFilters,
    point: { latitude: number; longitude: number; radiusMeters: number },
  ): Promise<unknown>;
}
