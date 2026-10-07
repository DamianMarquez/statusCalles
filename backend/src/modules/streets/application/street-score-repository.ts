import type { ReportViewportQuery } from '../../reports/application/report-repository.js';
import type { ReportFeedbackSummary } from '../../reports/domain/report-feedback.js';
import type { StreetReport } from '../../reports/domain/street-report.js';

export interface StreetScoreReportInput {
  report: StreetReport;
  feedback: ReportFeedbackSummary;
  actorId?: string | null;
  segmentId?: string | null;
}

export interface StreetScoreStreetInput {
  id: string;
  officialName: string;
  segments: Array<{
    id: string;
    reports: StreetScoreReportInput[];
  }>;
}

export interface StreetScoreRepository {
  findReportsInViewport(query: ReportViewportQuery, asOf: Date): Promise<StreetScoreReportInput[]>;
  findStreetScore(streetId: string, asOf: Date): Promise<StreetScoreStreetInput | null>;
  findSegmentScore(
    segmentId: string,
    asOf: Date,
  ): Promise<{
    id: string;
    reports: StreetScoreReportInput[];
  } | null>;
  findSegmentScores(
    segmentIds: string[],
    asOf: Date,
  ): Promise<Array<{ id: string; reports: StreetScoreReportInput[] }>>;
}
