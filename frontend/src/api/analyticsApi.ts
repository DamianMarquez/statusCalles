const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export interface AnalyticsFilters {
  from?: string;
  to?: string;
}

export interface AnalyticsOverview {
  total: number;
  active: number;
  resolved: number;
  stale: number;
  average_resolution_hours: number;
  confirmed: number;
  confirmed_percent: number;
  stale_percent: number;
}

export interface AnalyticsReportDistribution {
  byType: Array<{ type: string; count: number }>;
  bySeverity: Array<{ severity: number; count: number }>;
}

export interface AnalyticsNeighborhood {
  id: number | null;
  name: string | null;
  communeId: number | null;
  communeName: string | null;
  reports: number;
  active: number;
  resolved: number;
}

export interface AnalyticsTrend {
  period: string;
  reports: number;
  high_severity: number;
  resolved: number;
}

export interface AnalyticsHeatCell {
  latitude: number;
  longitude: number;
  reports: number;
  active: number;
  high_severity: number;
}

export interface AnalyticsScoreRank {
  id: string;
  officialName?: string;
  streetId?: string;
  reports: number;
  score: { score: number; level: string } | null;
}

export interface OfficialAnalytics {
  infrastructure: Array<{ type: string; count: number }>;
  sources: Array<{
    slug: string;
    name: string;
    status: string;
    lastSyncAt: string | null;
    lastRecordCount: number | null;
  }>;
  realtime_traffic_available: boolean;
}

function query(filters: AnalyticsFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return params.toString();
}

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('No pudimos conectarnos con Analytics.');
  }
  if (!response.ok) throw new Error('No pudimos cargar los datos de Analytics.');
  return (await response.json()) as T;
}

export async function getAnalyticsDashboard(filters: AnalyticsFilters, signal: AbortSignal) {
  const params = query(filters);
  const suffix = params ? `?${params}` : '';
  const heatmapParams = new URLSearchParams(params);
  heatmapParams.set('south', '-34.72');
  heatmapParams.set('north', '-34.52');
  heatmapParams.set('west', '-58.54');
  heatmapParams.set('east', '-58.33');
  heatmapParams.set('cellSize', '0.008');
  const [overview, reports, neighborhoods, communes, trends, streets, segments, heatmap, official] =
    await Promise.all([
      get<AnalyticsOverview>(`/api/analytics/overview${suffix}`, signal),
      get<AnalyticsReportDistribution>(`/api/analytics/reports${suffix}`, signal),
      get<AnalyticsNeighborhood[]>(`/api/analytics/neighborhoods${suffix}`, signal),
      get<AnalyticsNeighborhood[]>(`/api/analytics/communes${suffix}`, signal),
      get<AnalyticsTrend[]>(`/api/analytics/trends${suffix}`, signal),
      get<AnalyticsScoreRank[]>(`/api/analytics/streets${suffix}`, signal),
      get<AnalyticsScoreRank[]>(`/api/analytics/segments${suffix}`, signal),
      get<{ cells: AnalyticsHeatCell[] }>(`/api/analytics/heatmap?${heatmapParams}`, signal),
      get<OfficialAnalytics>('/api/analytics/official', signal),
    ]);
  return {
    overview,
    reports,
    neighborhoods,
    communes,
    trends,
    streets,
    segments,
    heatmap: heatmap.cells,
    official,
  };
}
