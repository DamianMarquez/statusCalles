import type { ReportFeedbackSummary, ReportFeedbackType } from '../domain/report-feedback.js';
import type { ReportFeedbackRepository } from './report-feedback-repository.js';

export class ReportFeedbackService {
  constructor(private readonly repository: ReportFeedbackRepository) {}

  submit(input: {
    reportId: string;
    voterId: string;
    type: ReportFeedbackType;
  }): Promise<ReportFeedbackSummary | null> {
    return this.repository.submit(input);
  }

  summariesForReports(
    reportIds: string[],
    voterId: string | null,
  ): Promise<Map<string, ReportFeedbackSummary>> {
    return this.repository.summariesForReports(reportIds, voterId);
  }
}
