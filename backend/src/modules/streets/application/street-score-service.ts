import type { ReportViewportQuery } from '../../reports/application/report-repository.js';
import { streetScoreCalculator } from '../domain/street-score-calculator.js';
import type { StreetScoreRepository } from './street-score-repository.js';

export class StreetScoreService {
  constructor(
    private readonly repository: StreetScoreRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async findInViewport(query: ReportViewportQuery) {
    const asOf = this.clock();
    const inputs = await this.repository.findReportsInViewport(query, asOf);
    return streetScoreCalculator.calculate(inputs, asOf);
  }

  async findForStreet(streetId: string) {
    const calculatedAt = this.clock();
    const street = await this.repository.findStreetScore(streetId, calculatedAt);
    if (!street) return null;
    return streetScoreCalculator.calculateStreet({
      targetId: street.id,
      officialName: street.officialName,
      segments: street.segments,
      calculatedAt,
    });
  }

  async findForSegment(segmentId: string) {
    const calculatedAt = this.clock();
    const segment = await this.repository.findSegmentScore(segmentId, calculatedAt);
    if (!segment) return null;
    return streetScoreCalculator.calculateSegment({
      targetId: segment.id,
      reports: segment.reports,
      calculatedAt,
    });
  }
}
