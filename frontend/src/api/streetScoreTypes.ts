import type { ViewportBounds } from './reportTypes.js';

export type StreetScoreLevel = 'GOOD' | 'FAIR' | 'BAD' | 'VERY_BAD' | 'IMPASSABLE';
export type StreetScoreConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface StreetScoreFactorDto {
  code: string;
  source: 'COMMUNITY' | 'OFFICIAL' | 'SYSTEM';
  label: string;
  impact: number;
  detail: string;
}

export interface StreetScoreAreaDto {
  id: string;
  bounds: ViewportBounds;
  center: { latitude: number; longitude: number };
  score: number;
  condition: StreetScoreLevel;
  confidence: StreetScoreConfidence;
  sourceStatus: {
    community: 'AVAILABLE' | 'UNAVAILABLE';
    officialIncidents: 'AVAILABLE' | 'UNAVAILABLE';
    traffic: 'AVAILABLE' | 'UNAVAILABLE';
  };
  factors: StreetScoreFactorDto[];
  calculatedAt: string;
  reasons: {
    activeReports: number;
    highSeverityReports: number;
    confirmations: number;
    resolvedReports: number;
    latestReportAt: string;
  };
}

export interface StreetScoreResultDto {
  id: string;
  targetType: 'SEGMENT' | 'STREET' | 'AREA';
  officialName?: string;
  score: number;
  level: StreetScoreLevel;
  confidence: StreetScoreConfidence;
  sourceStatus: {
    community: 'AVAILABLE' | 'UNAVAILABLE';
    officialIncidents: 'AVAILABLE' | 'UNAVAILABLE';
    traffic: 'AVAILABLE' | 'UNAVAILABLE';
  };
  factors: StreetScoreFactorDto[];
  metrics: {
    reports: number;
    activeReports: number;
    recentReports: number;
    highSeverityReports: number;
    confirmations: number;
    resolvedReports: number;
    officialIncidents: number;
    trafficLevel: 'LOW' | 'MODERATE' | 'HIGH' | null;
    latestReportAt: string | null;
  };
  calculatedAt: string;
  segments?: StreetScoreResultDto[];
}
