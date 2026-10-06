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
}
