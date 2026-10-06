import type { StreetReport } from '../domain/street-report.js';
import {
  emptyReportFeedbackSummary,
  type ReportFeedbackSummary,
} from '../domain/report-feedback.js';
import {
  reportFreshnessPolicy,
  type ReportLifecycleStatus,
  type ReportFreshness,
} from '../domain/report-freshness-policy.js';

export interface ReportFeedbackDto {
  confirmations: number;
  resolvedReports: number;
  userFeedback: ReportFeedbackSummary['userFeedback'];
}

export interface ReportDto {
  id: string;
  type: StreetReport['type'];
  severity: StreetReport['severity'];
  description: string;
  location: StreetReport['location'];
  status: ReportLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  street: StreetReport['street'];
  feedback: ReportFeedbackDto;
  freshness: Omit<ReportFreshness, 'lastActivityAt' | 'evaluatedAt'> & {
    lastActivityAt: string;
    evaluatedAt: string;
  };
}

export function toReportDto(
  report: StreetReport,
  feedback: ReportFeedbackSummary = emptyReportFeedbackSummary,
  evaluatedAt: Date,
): ReportDto {
  const lifecycle = reportFreshnessPolicy.evaluate(report, feedback, evaluatedAt);
  return {
    id: report.id,
    type: report.type,
    severity: report.severity,
    description: report.description,
    location: report.location,
    status: lifecycle.status,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    street: report.street ?? null,
    feedback: {
      confirmations: feedback.confirmations,
      resolvedReports: feedback.resolvedReports,
      userFeedback: feedback.userFeedback,
    },
    freshness: {
      ...lifecycle.freshness,
      lastActivityAt: lifecycle.freshness.lastActivityAt.toISOString(),
      evaluatedAt: lifecycle.freshness.evaluatedAt.toISOString(),
    },
  };
}
