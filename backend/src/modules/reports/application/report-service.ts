import type { CreateStreetReport, ReportStatus, StreetReport } from '../domain/street-report.js';
import type {
  NearbyReportsQuery,
  ReportRepository,
  ReportViewportQuery,
} from './report-repository.js';

export class ReportService {
  constructor(private readonly repository: ReportRepository) {}

  create(input: CreateStreetReport, userId?: string | null): Promise<StreetReport> {
    return this.repository.create(input, userId);
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

  isOwner(id: string, userId: string): Promise<boolean> {
    return this.repository.isOwner(id, userId);
  }

  updateStatus(id: string, status: ReportStatus): Promise<StreetReport | null> {
    return this.repository.updateStatus(id, status);
  }
}
