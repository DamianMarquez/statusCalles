import type { ReportFeedbackSummary } from './report-feedback.js';
import type { StreetReport } from './street-report.js';

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export const reportFreshnessThresholds = {
  freshDays: 1,
  staleAfterDays: 30,
  confirmationHalfLifeDays: 30,
} as const;

export type ReportFreshnessLevel = 'FRESH' | 'AGING' | 'STALE' | 'RESOLVED';
export type ReportLifecycleStatus = 'ACTIVE' | 'STALE' | 'RESOLVED';

export interface ReportFreshness {
  level: ReportFreshnessLevel;
  confidence: number;
  lastActivityAt: Date;
  evaluatedAt: Date;
}

export interface ReportFreshnessResult {
  status: ReportLifecycleStatus;
  freshness: ReportFreshness;
}

export class ReportFreshnessPolicy {
  confirmationWeight(confirmedAt: Date, evaluatedAt: Date): number {
    const ageInDays = Math.max(
      0,
      (evaluatedAt.getTime() - confirmedAt.getTime()) / millisecondsPerDay,
    );
    return Math.exp((-Math.LN2 * ageInDays) / reportFreshnessThresholds.confirmationHalfLifeDays);
  }

  evaluate(
    report: Pick<StreetReport, 'status' | 'createdAt' | 'updatedAt'>,
    feedback: Pick<
      ReportFeedbackSummary,
      'weightedConfirmations' | 'weightedResolvedReports' | 'latestConfirmationAt'
    >,
    evaluatedAt: Date,
  ): ReportFreshnessResult {
    if (report.status === 'RESOLVED') {
      return {
        status: 'RESOLVED',
        freshness: {
          level: 'RESOLVED',
          confidence: 0,
          lastActivityAt: report.updatedAt,
          evaluatedAt,
        },
      };
    }

    const lastActivityAt =
      feedback.latestConfirmationAt && feedback.latestConfirmationAt > report.createdAt
        ? feedback.latestConfirmationAt
        : report.createdAt;
    const daysSinceActivity = Math.max(
      0,
      (evaluatedAt.getTime() - lastActivityAt.getTime()) / millisecondsPerDay,
    );
    const recencyConfidence = 15 * this.confirmationWeight(lastActivityAt, evaluatedAt);
    const voteConfidence =
      18 * feedback.weightedConfirmations - 12 * feedback.weightedResolvedReports;
    const confidence = Math.max(0, Math.min(100, Math.round(recencyConfidence + voteConfidence)));
    const stale = daysSinceActivity > reportFreshnessThresholds.staleAfterDays;
    const status: ReportLifecycleStatus = stale ? 'STALE' : 'ACTIVE';
    const level: ReportFreshnessLevel = stale
      ? 'STALE'
      : daysSinceActivity <= reportFreshnessThresholds.freshDays
        ? 'FRESH'
        : 'AGING';

    return {
      status,
      freshness: { level, confidence, lastActivityAt, evaluatedAt },
    };
  }
}

export const reportFreshnessPolicy = new ReportFreshnessPolicy();
