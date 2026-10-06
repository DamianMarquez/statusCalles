import type { ReportFeedbackSummary, ReportFeedbackType } from '../domain/report-feedback.js';

export interface SubmitReportFeedback {
  reportId: string;
  voterId: string;
  type: ReportFeedbackType;
}

export interface ReportFeedbackRepository {
  submit(input: SubmitReportFeedback, asOf: Date): Promise<ReportFeedbackSummary | null>;
  summariesForReports(
    reportIds: string[],
    voterId: string | null,
    asOf: Date,
  ): Promise<Map<string, ReportFeedbackSummary>>;
}
