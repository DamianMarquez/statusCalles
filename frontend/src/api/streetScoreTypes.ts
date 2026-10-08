import type { StreetScoreLevel } from '../components/map/streetConditionCatalog.js';

export type { StreetScoreLevel };
export type StreetScoreConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface StreetScoreFactorDto {
  code: string;
  source: 'COMMUNITY' | 'OFFICIAL' | 'SYSTEM';
  label: string;
  impact: number;
  detail: string;
}

export interface StreetScoreMetricsDto {
  reports: number;
  activeReports: number;
  recentReports: number;
  highSeverityReports: number;
  confirmations: number;
  resolvedReports: number;
  officialIncidents: number;
  trafficLevel: 'LOW' | 'MODERATE' | 'HIGH' | null;
  latestReportAt: string | null;
}

export interface StreetScoreResultDto {
  id: string;
  targetType: 'SEGMENT' | 'STREET';
  officialName?: string;
  score: number | null;
  hasEvidence: boolean;
  level: StreetScoreLevel | null;
  confidence: StreetScoreConfidence;
  availability: { status: 'OPEN' | 'RESTRICTED' | 'BLOCKED' | 'UNKNOWN'; signals: string[] };
  sourceStatus: {
    community: 'AVAILABLE' | 'UNAVAILABLE';
    officialIncidents: 'AVAILABLE' | 'UNAVAILABLE';
    traffic: 'AVAILABLE' | 'UNAVAILABLE';
  };
  factors: StreetScoreFactorDto[];
  metrics: StreetScoreMetricsDto;
  calculatedAt: string;
  segments?: StreetScoreResultDto[];
}

export interface StreetConditionProperties extends Omit<
  StreetScoreResultDto,
  'id' | 'score' | 'level' | 'confidence' | 'targetType'
> {
  id: string;
  streetId: string;
  streetName: string;
  targetType: 'SEGMENT' | 'STREET';
  score: number | null;
  level: StreetScoreLevel | null;
  confidence: StreetScoreConfidence | null;
}

export interface StreetConditionFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'LineString' | 'MultiLineString'; coordinates: number[][] | number[][][] };
  properties: StreetConditionProperties;
}

export interface StreetConditionFeatureCollection {
  type: 'FeatureCollection';
  features: StreetConditionFeature[];
}
