import type { CreateStreetReport, ReportStatus, StreetReport } from '../domain/street-report.js';

export interface NearbyReportsQuery {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface ReportRepository {
  create(input: CreateStreetReport): Promise<StreetReport>;
  findNearby(query: NearbyReportsQuery): Promise<StreetReport[]>;
  findById(id: string): Promise<StreetReport | null>;
  updateStatus(id: string, status: ReportStatus): Promise<StreetReport | null>;
}
