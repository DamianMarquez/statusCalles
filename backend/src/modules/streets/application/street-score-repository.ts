import type { ReportViewportQuery } from '../../reports/application/report-repository.js';
import type { ReportFeedbackSummary } from '../../reports/domain/report-feedback.js';
import type { StreetReport } from '../../reports/domain/street-report.js';

export interface StreetScoreReportInput {
  report: StreetReport;
  feedback: ReportFeedbackSummary;
}

export interface StreetScoreRepository {
  findReportsInViewport(query: ReportViewportQuery, asOf: Date): Promise<StreetScoreReportInput[]>;
}
