import type { ReportFeedbackSummary, ReportFeedbackType } from '../domain/report-feedback.js';
import type { ReportFeedbackRepository } from './report-feedback-repository.js';

export class ReportFeedbackService {
  constructor(
    private readonly repository: ReportFeedbackRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  now(): Date {
    return this.clock();
  }

  submit(
    input: {
      reportId: string;
      voterId: string;
      type: ReportFeedbackType;
    },
    asOf = this.now(),
  ): Promise<ReportFeedbackSummary | null> {
    return this.repository.submit(input, asOf);
  }

  summariesForReports(
    reportIds: string[],
    voterId: string | null,
    asOf = this.now(),
  ): Promise<Map<string, ReportFeedbackSummary>> {
    return this.repository.summariesForReports(reportIds, voterId, asOf);
  }
}
