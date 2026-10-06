import type { CreateStreetReport, ReportStatus, StreetReport } from '../domain/street-report.js';
import type { NearbyReportsQuery, ReportRepository } from './report-repository.js';

export class ReportService {
  constructor(private readonly repository: ReportRepository) {}

  create(input: CreateStreetReport): Promise<StreetReport> {
    return this.repository.create(input);
  }

  findNearby(query: NearbyReportsQuery): Promise<StreetReport[]> {
    return this.repository.findNearby(query);
  }

  findById(id: string): Promise<StreetReport | null> {
    return this.repository.findById(id);
  }

  updateStatus(id: string, status: ReportStatus): Promise<StreetReport | null> {
    return this.repository.updateStatus(id, status);
  }
}
