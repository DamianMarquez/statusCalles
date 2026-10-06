import type { ViewportBounds } from './reportTypes.js';

export interface StreetScoreAreaDto {
  id: string;
  bounds: ViewportBounds;
  center: { latitude: number; longitude: number };
  score: number;
  condition: 'VERY_POOR' | 'POOR' | 'FAIR' | 'GOOD';
  reasons: {
    activeReports: number;
    highSeverityReports: number;
    confirmations: number;
    resolvedReports: number;
    latestReportAt: string;
  };
}
