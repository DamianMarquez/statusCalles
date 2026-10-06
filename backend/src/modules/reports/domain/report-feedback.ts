export const REPORT_FEEDBACK_TYPES = ['CONFIRM', 'RESOLVED'] as const;
export type ReportFeedbackType = (typeof REPORT_FEEDBACK_TYPES)[number];

export interface ReportFeedbackSummary {
  confirmations: number;
  resolvedReports: number;
  userFeedback: ReportFeedbackType | null;
}

export const emptyReportFeedbackSummary: ReportFeedbackSummary = {
  confirmations: 0,
  resolvedReports: 0,
  userFeedback: null,
};
