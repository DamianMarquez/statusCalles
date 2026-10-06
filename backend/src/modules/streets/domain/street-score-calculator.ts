import type { ReportFeedbackSummary } from '../../reports/domain/report-feedback.js';
import { reportFreshnessPolicy } from '../../reports/domain/report-freshness-policy.js';
import type { StreetReport } from '../../reports/domain/street-report.js';

export const streetScoreConfig = {
  cellLatitudeDegrees: 0.00225,
  cellLongitudeDegrees: 0.00275,
  minimumActiveReports: 2,
  severityPenalty: { LOW: 8, MEDIUM: 16, HIGH: 32, CRITICAL: 50 },
  confirmationBoostPerVote: 0.08,
  maximumConfirmationBoost: 1.4,
  resolutionReductionPerVote: 0.15,
  minimumResolutionMultiplier: 0.25,
  concentrationBoostPerAdditionalReport: 0.1,
  maximumConcentrationBoost: 1.5,
} as const;

export interface StreetScoreInput {
  report: StreetReport;
  feedback: ReportFeedbackSummary;
}

export interface StreetScoreArea {
  id: string;
  bounds: { south: number; north: number; west: number; east: number };
  center: { latitude: number; longitude: number };
  score: number;
  condition: 'VERY_POOR' | 'POOR' | 'FAIR' | 'GOOD';
  reasons: {
    activeReports: number;
    highSeverityReports: number;
    confirmations: number;
    resolvedReports: number;
    latestReportAt: Date;
  };
}

interface Cell {
  south: number;
  west: number;
  reports: StreetScoreInput[];
}

function conditionFor(score: number): StreetScoreArea['condition'] {
  if (score < 35) return 'VERY_POOR';
  if (score < 60) return 'POOR';
  if (score < 80) return 'FAIR';
  return 'GOOD';
}

export class StreetScoreCalculator {
  calculate(inputs: StreetScoreInput[], asOf: Date): StreetScoreArea[] {
    const cells = new Map<string, Cell>();

    for (const input of inputs) {
      const { latitude, longitude } = input.report.location;
      const row = Math.floor((latitude + 90) / streetScoreConfig.cellLatitudeDegrees);
      const column = Math.floor((longitude + 180) / streetScoreConfig.cellLongitudeDegrees);
      const id = `${row}:${column}`;
      const south = row * streetScoreConfig.cellLatitudeDegrees - 90;
      const west = column * streetScoreConfig.cellLongitudeDegrees - 180;
      const cell = cells.get(id) ?? { south, west, reports: [] };
      cell.reports.push(input);
      cells.set(id, cell);
    }

    return [...cells.entries()]
      .map(([id, cell]) => this.calculateCell(id, cell, asOf))
      .filter((area): area is StreetScoreArea => area !== null)
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  }

  private calculateCell(id: string, cell: Cell, asOf: Date): StreetScoreArea | null {
    const activeReports = cell.reports.filter(
      ({ report, feedback }) =>
        report.status !== 'RESOLVED' &&
        reportFreshnessPolicy.evaluate(report, feedback, asOf).status === 'ACTIVE',
    );
    if (activeReports.length < streetScoreConfig.minimumActiveReports) return null;

    const concentrationBoost = Math.min(
      streetScoreConfig.maximumConcentrationBoost,
      1 + (activeReports.length - 1) * streetScoreConfig.concentrationBoostPerAdditionalReport,
    );
    const totalPenalty = activeReports.reduce((total, { report, feedback }) => {
      const freshness = reportFreshnessPolicy.evaluate(report, feedback, asOf).freshness;
      const ageWeight = reportFreshnessPolicy.confirmationWeight(freshness.lastActivityAt, asOf);
      const confirmationMultiplier = Math.min(
        streetScoreConfig.maximumConfirmationBoost,
        1 + feedback.weightedConfirmations * streetScoreConfig.confirmationBoostPerVote,
      );
      const resolutionMultiplier = Math.max(
        streetScoreConfig.minimumResolutionMultiplier,
        1 - feedback.weightedResolvedReports * streetScoreConfig.resolutionReductionPerVote,
      );
      return (
        total +
        streetScoreConfig.severityPenalty[report.severity] *
          ageWeight *
          confirmationMultiplier *
          resolutionMultiplier
      );
    }, 0);
    const score = Math.max(0, Math.min(100, Math.round(100 - totalPenalty * concentrationBoost)));
    const latestReportAt = activeReports.reduce(
      (latest, { report }) => (report.createdAt > latest ? report.createdAt : latest),
      activeReports[0]!.report.createdAt,
    );

    return {
      id,
      bounds: {
        south: cell.south,
        north: cell.south + streetScoreConfig.cellLatitudeDegrees,
        west: cell.west,
        east: cell.west + streetScoreConfig.cellLongitudeDegrees,
      },
      center: {
        latitude: cell.south + streetScoreConfig.cellLatitudeDegrees / 2,
        longitude: cell.west + streetScoreConfig.cellLongitudeDegrees / 2,
      },
      score,
      condition: conditionFor(score),
      reasons: {
        activeReports: activeReports.length,
        highSeverityReports: activeReports.filter(
          ({ report }) => report.severity === 'HIGH' || report.severity === 'CRITICAL',
        ).length,
        confirmations: activeReports.reduce((sum, { feedback }) => sum + feedback.confirmations, 0),
        resolvedReports:
          cell.reports.filter(({ report }) => report.status === 'RESOLVED').length +
          cell.reports.reduce((sum, { feedback }) => sum + feedback.resolvedReports, 0),
        latestReportAt,
      },
    };
  }
}

export const streetScoreCalculator = new StreetScoreCalculator();
