import type { ReportFeedbackSummary, ReportFeedbackType } from '../domain/report-feedback.js';
import type { ReportFeedbackRepository } from './report-feedback-repository.js';
import type { ScoreRefresher } from '../../streets/application/street-score-refresher.js';

export class ReportFeedbackService {
  constructor(
    private readonly repository: ReportFeedbackRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly scoreRefresher?: ScoreRefresher,
  ) {}

  now(): Date {
    return this.clock();
  }

  async submit(
    input: {
      reportId: string;
      userId: string;
      type: ReportFeedbackType;
    },
    asOf = this.now(),
  ): Promise<ReportFeedbackSummary | null> {
    const summary = await this.repository.submit(input, asOf);
    if (summary) await this.scoreRefresher?.refreshForReport(input.reportId);
    return summary;
  }

  summariesForReports(
    reportIds: string[],
    userId: string | null,
    asOf = this.now(),
  ): Promise<Map<string, ReportFeedbackSummary>> {
    return this.repository.summariesForReports(reportIds, userId, asOf);
  }
}
