import type { CreateStreetReport, ReportStatus, StreetReport } from '../domain/street-report.js';
import type {
  NearbyReportsQuery,
  ReportFilters,
  ReportPage,
  ReportRepository,
  ReportViewportQuery,
} from './report-repository.js';
import type { StreetLocationResolver } from '../../streets/application/street-location-resolver.js';
import type { ScoreRefresher } from '../../streets/application/street-score-refresher.js';

export class ReportService {
  constructor(
    private readonly repository: ReportRepository,
    private readonly streetResolver?: StreetLocationResolver,
    private readonly scoreRefresher?: ScoreRefresher,
  ) {}

  async create(input: CreateStreetReport, userId?: string | null): Promise<StreetReport> {
    const street = await this.streetResolver?.resolveStreetFromLocation(
      input.location.latitude,
      input.location.longitude,
    );
    const report = await this.repository.create(input, userId, street);
    await this.scoreRefresher?.refreshForReport(report.id);
    return report;
  }

  findNearby(query: NearbyReportsQuery): Promise<StreetReport[]> {
    return this.repository.findNearby(query);
  }

  findInViewport(query: ReportViewportQuery & ReportFilters): Promise<ReportPage> {
    return this.repository.findInViewport(query);
  }

  findMine(userId: string, limit: number, offset: number) {
    return this.repository.findMine(userId, limit, offset);
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

  async updateStatus(id: string, status: ReportStatus): Promise<StreetReport | null> {
    const report = await this.repository.updateStatus(id, status);
    if (report) await this.scoreRefresher?.refreshForReport(id);
    return report;
  }
}
