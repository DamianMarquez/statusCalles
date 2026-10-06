import type { CreateStreetReport, ReportStatus, StreetReport } from '../domain/street-report.js';
import type {
  NearbyReportsQuery,
  ReportRepository,
  ReportViewportQuery,
} from './report-repository.js';
import type { StreetLocationResolver } from '../../streets/application/street-location-resolver.js';

export class ReportService {
  constructor(
    private readonly repository: ReportRepository,
    private readonly streetResolver?: StreetLocationResolver,
  ) {}

  async create(input: CreateStreetReport, userId?: string | null): Promise<StreetReport> {
    const street = await this.streetResolver?.resolveStreetFromLocation(
      input.location.latitude,
      input.location.longitude,
    );
    return this.repository.create(input, userId, street);
  }

  findNearby(query: NearbyReportsQuery): Promise<StreetReport[]> {
    return this.repository.findNearby(query);
  }

  findInViewport(query: ReportViewportQuery): Promise<StreetReport[]> {
    return this.repository.findInViewport(query);
  }

  findSimilar(input: CreateStreetReport) {
    return this.repository.findSimilar(input);
  }

  findById(id: string): Promise<StreetReport | null> {
    return this.repository.findById(id);
  }

  findByStreetId(id: string, limit?: number): Promise<StreetReport[]> {
    return this.repository.findByStreetId(id, limit);
  }

  isOwner(id: string, userId: string): Promise<boolean> {
    return this.repository.isOwner(id, userId);
  }

  updateStatus(id: string, status: ReportStatus): Promise<StreetReport | null> {
    return this.repository.updateStatus(id, status);
  }
}
