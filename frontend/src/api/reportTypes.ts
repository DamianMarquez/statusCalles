import type { ReportSeverity, ReportStatus, ReportType } from './reportCatalog.js';
export type { ReportSeverity, ReportStatus, ReportType } from './reportCatalog.js';
export type ReportFeedbackType = 'CONFIRM' | 'RESOLVED';
export type ReportFreshnessLevel = 'FRESH' | 'AGING' | 'STALE' | 'RESOLVED';

export interface ReportFeedbackSummary {
  confirmations: number;
  resolvedReports: number;
  userFeedback: ReportFeedbackType | null;
}

export interface ReportFreshness {
  level: ReportFreshnessLevel;
  confidence: number;
  lastActivityAt: string;
  evaluatedAt: string;
}

export interface ReportDto {
  id: string;
  type: ReportType;
  severity: ReportSeverity;
  description: string;
  location: {
    latitude: number;
    longitude: number;
  };
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  publiclyVisible?: boolean;
  street?: {
    id: string;
    officialName: string;
    neighborhoodName: string | null;
    communeName: string | null;
  } | null;
  feedback: ReportFeedbackSummary;
  freshness: ReportFreshness;
}

export interface OwnedReportDto extends ReportDto {
  publiclyVisible: boolean;
  feedbackCount: number;
  latestActivityAt: string;
}

export interface ReportPageDto {
  items: ReportDto[];
  hasMore: boolean;
}

export interface OwnedReportPageDto {
  items: OwnedReportDto[];
  hasMore: boolean;
}

export type ReportPeriod = '24h' | '3d' | '7d' | '30d' | '90d';

export interface MapReportFilters {
  types?: ReportType[];
  statuses?: ReportStatus[];
  fromDate?: string;
  toDate?: string;
  period?: ReportPeriod;
  minSeverity?: ReportSeverity;
  onlyMine?: boolean;
}

export interface ViewportBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface CreateReportInput {
  type: ReportType;
  severity: ReportSeverity;
  description?: string;
  latitude: number;
  longitude: number;
}
