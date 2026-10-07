import type {
  CreateStreetReport,
  ReportSeverity,
  ReportStatus,
  ReportType,
  StreetReport,
} from '../domain/street-report.js';
import type { StreetLocationResolution } from '../../streets/application/street-location-resolver.js';

export interface NearbyReportsQuery {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface ReportViewportQuery {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface ReportFilters {
  types?: ReportType[];
  statuses?: ReportStatus[];
  fromDate?: Date;
  toDate?: Date;
  minSeverity?: ReportSeverity;
  userId?: string;
  period?: '24h' | '3d' | '7d' | '30d' | '90d';
  limit?: number;
}

export interface ReportPage {
  items: ViewportReport[];
  hasMore: boolean;
}

export interface ViewportReport {
  report: StreetReport;
  publiclyVisible: boolean;
}

export interface OwnedReport {
  report: StreetReport;
  publiclyVisible: boolean;
  feedbackCount: number;
  latestFeedbackAt: Date | null;
}

export interface ReportRepository {
  create(
    input: CreateStreetReport,
    userId?: string | null,
    street?: StreetLocationResolution | null,
  ): Promise<StreetReport>;
  findNearby(query: NearbyReportsQuery): Promise<StreetReport[]>;
  findInViewport(query: ReportViewportQuery & ReportFilters): Promise<ReportPage>;
  findMine(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: OwnedReport[]; hasMore: boolean }>;
  findSimilar(
    input: CreateStreetReport,
  ): Promise<{ id: string; distanceMeters: number; createdAt: Date } | null>;
  findById(id: string): Promise<StreetReport | null>;
  findByStreetId(id: string, limit?: number): Promise<StreetReport[]>;
  isOwner(id: string, userId: string): Promise<boolean>;
  updateStatus(id: string, status: ReportStatus): Promise<StreetReport | null>;
}
