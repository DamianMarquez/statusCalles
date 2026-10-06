import type { CreateStreetReport, ReportStatus, StreetReport } from '../domain/street-report.js';
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

export interface ReportRepository {
  create(
    input: CreateStreetReport,
    userId?: string | null,
    street?: StreetLocationResolution | null,
  ): Promise<StreetReport>;
  findNearby(query: NearbyReportsQuery): Promise<StreetReport[]>;
  findInViewport(query: ReportViewportQuery): Promise<StreetReport[]>;
  findSimilar(
    input: CreateStreetReport,
  ): Promise<{ id: string; distanceMeters: number; createdAt: Date } | null>;
  findById(id: string): Promise<StreetReport | null>;
  findByStreetId(id: string, limit?: number): Promise<StreetReport[]>;
  isOwner(id: string, userId: string): Promise<boolean>;
  updateStatus(id: string, status: ReportStatus): Promise<StreetReport | null>;
}
