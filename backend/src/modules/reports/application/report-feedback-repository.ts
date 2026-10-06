import type { ReportFeedbackSummary, ReportFeedbackType } from '../domain/report-feedback.js';

export interface SubmitReportFeedback {
  reportId: string;
  userId: string;
  type: ReportFeedbackType;
}

export interface ReportFeedbackRepository {
  submit(input: SubmitReportFeedback, asOf: Date): Promise<ReportFeedbackSummary | null>;
  summariesForReports(
    reportIds: string[],
    userId: string | null,
    asOf: Date,
  ): Promise<Map<string, ReportFeedbackSummary>>;
}
