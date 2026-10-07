import type { ReportFeedbackSummary } from '../../reports/domain/report-feedback.js';
import { reportFreshnessPolicy } from '../../reports/domain/report-freshness-policy.js';
import type { StreetReport } from '../../reports/domain/street-report.js';

export const streetScoreConfig = {
  cellLatitudeDegrees: 0.00225,
  cellLongitudeDegrees: 0.00275,
  minimumActiveReports: 2,
  neutralScore: 75,
  severityPenalty: { LOW: 5, MEDIUM: 10, HIGH: 18, CRITICAL: 30 },
  severityFactorShare: 0.65,
  recencyFactorShare: 0.35,
  confirmationPenaltyPerVote: 0.6,
  maximumConfirmationPenalty: 6,
  resolutionCreditPerVote: 0.6,
  maximumResolutionCredit: 25,
  stabilityBonus: 5,
  maximumOfficialIncidentPenalty: 30,
  reporterContributionLimit: 1,
} as const;

export type StreetScoreSource = 'COMMUNITY' | 'OFFICIAL' | 'SYSTEM';
export type StreetScoreLevel = 'GOOD' | 'FAIR' | 'BAD' | 'VERY_BAD' | 'IMPASSABLE';
export type StreetScoreConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type StreetScoreSourceStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface ScoreFactor {
  code: string;
  source: StreetScoreSource;
  label: string;
  impact: number;
  detail: string;
}

export interface ScoreReportEvidence {
  report: StreetReport;
  feedback: ReportFeedbackSummary;
  actorId?: string | null;
}

export interface OfficialIncidentEvidence {
  id: string;
  type: 'TRAFFIC_CUT' | 'ROAD_WORK' | 'EVENT' | 'ACCIDENT' | 'OTHER';
  label?: string;
  active: boolean;
}

export interface TrafficEvidence {
  level: 'LOW' | 'MODERATE' | 'HIGH';
  measuredAt: Date;
}

export interface ScoreInput {
  targetId: string;
  targetType: 'SEGMENT' | 'STREET' | 'AREA';
  reports: ScoreReportEvidence[];
  officialIncidents?: OfficialIncidentEvidence[];
  traffic?: TrafficEvidence | null;
  calculatedAt: Date;
}

export interface ScoreMetrics {
  reports: number;
  activeReports: number;
  recentReports: number;
  highSeverityReports: number;
  confirmations: number;
  resolvedReports: number;
  officialIncidents: number;
  trafficLevel: TrafficEvidence['level'] | null;
  latestReportAt: Date | null;
}

export interface ScoreResult {
  id: string;
  targetType: ScoreInput['targetType'];
  score: number;
  level: StreetScoreLevel;
  confidence: StreetScoreConfidence;
  sourceStatus: {
    community: StreetScoreSourceStatus;
    officialIncidents: StreetScoreSourceStatus;
    traffic: StreetScoreSourceStatus;
  };
  factors: ScoreFactor[];
  metrics: ScoreMetrics;
  calculatedAt: Date;
  segments?: ScoreResult[];
}

export interface StreetScoreInput {
  report: StreetReport;
  feedback: ReportFeedbackSummary;
  actorId?: string | null;
}

export interface StreetScoreArea {
  id: string;
  bounds: { south: number; north: number; west: number; east: number };
  center: { latitude: number; longitude: number };
  score: number;
  condition: StreetScoreLevel;
  confidence: StreetScoreConfidence;
  sourceStatus: ScoreResult['sourceStatus'];
  factors: ScoreFactor[];
  calculatedAt: Date;
  reasons: {
    activeReports: number;
    highSeverityReports: number;
    confirmations: number;
    resolvedReports: number;
    latestReportAt: Date;
  };
}

export interface StreetSegmentScoreInput {
  id: string;
  reports: ScoreReportEvidence[];
  officialIncidents?: OfficialIncidentEvidence[];
  traffic?: TrafficEvidence | null;
}

interface Cell {
  south: number;
  west: number;
  reports: StreetScoreInput[];
}

const millisecondsPerDay = 86_400_000;

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function scoreLevel(score: number): StreetScoreLevel {
  if (score === 0) return 'IMPASSABLE';
  if (score < 30) return 'VERY_BAD';
  if (score < 55) return 'BAD';
  if (score < 80) return 'FAIR';
  return 'GOOD';
}

function addFactor(factors: ScoreFactor[], factor: ScoreFactor): void {
  if (factor.impact !== 0) factors.push({ ...factor, impact: roundOne(factor.impact) });
}

function lastActivityOf(input: ScoreReportEvidence): Date {
  const evaluation = reportFreshnessPolicy.evaluate(
    input.report,
    input.feedback,
    input.report.updatedAt,
  );
  return evaluation.freshness.lastActivityAt;
}

function reportContribution(input: ScoreReportEvidence, calculatedAt: Date): number {
  const lastActivity = lastActivityOf(input);
  const weight = reportFreshnessPolicy.confirmationWeight(lastActivity, calculatedAt);
  return streetScoreConfig.severityPenalty[input.report.severity] * weight;
}

function capSameReporter(
  reports: ScoreReportEvidence[],
  calculatedAt: Date,
): { reports: ScoreReportEvidence[]; cappedCount: number } {
  const grouped = new Map<string, ScoreReportEvidence[]>();
  for (const item of reports) {
    const key = item.actorId ? `user:${item.actorId}` : 'unattributed';
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  const selected = [...grouped.values()].map(
    (items) =>
      items
        .sort(
          (left, right) =>
            reportContribution(right, calculatedAt) - reportContribution(left, calculatedAt) ||
            left.report.id.localeCompare(right.report.id),
        )
        .slice(0, streetScoreConfig.reporterContributionLimit)[0]!,
  );
  return { reports: selected, cappedCount: reports.length - selected.length };
}

export class StreetScoreCalculator {
  /** Compatibility adapter for the map overlay; it applies the same V2 factors per 250 m cell. */
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
      .map(([id, cell]) => {
        const active = cell.reports.filter((item) => this.isActive(item, asOf));
        if (active.length < streetScoreConfig.minimumActiveReports) return null;
        const result = this.calculateScore({
          targetId: id,
          targetType: 'AREA',
          reports: cell.reports,
          calculatedAt: asOf,
        });
        const latestReportAt = result.metrics.latestReportAt;
        if (!latestReportAt) return null;
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
          score: result.score,
          condition: result.level,
          confidence: result.confidence,
          sourceStatus: result.sourceStatus,
          factors: result.factors,
          calculatedAt: result.calculatedAt,
          reasons: {
            activeReports: result.metrics.activeReports,
            highSeverityReports: result.metrics.highSeverityReports,
            confirmations: result.metrics.confirmations,
            resolvedReports: result.metrics.resolvedReports,
            latestReportAt,
          },
        } satisfies StreetScoreArea;
      })
      .filter((area): area is StreetScoreArea => area !== null)
      .sort((left, right) => left.score - right.score || left.id.localeCompare(right.id));
  }

  calculateSegment(input: Omit<ScoreInput, 'targetType'>): ScoreResult {
    return this.calculateScore({ ...input, targetType: 'SEGMENT' });
  }

  calculateStreet(
    input: Omit<ScoreInput, 'targetType' | 'reports'> & {
      officialName: string;
      segments: StreetSegmentScoreInput[];
    },
  ): ScoreResult & { officialName: string } {
    const segments = input.segments.map((segment) =>
      this.calculateSegment({
        targetId: segment.id,
        reports: segment.reports,
        officialIncidents: segment.officialIncidents,
        traffic: segment.traffic,
        calculatedAt: input.calculatedAt,
      }),
    );
    const evidenced = segments.filter(
      (segment) =>
        segment.metrics.reports > 0 ||
        segment.metrics.officialIncidents > 0 ||
        segment.metrics.trafficLevel !== null,
    );
    if (evidenced.length === 0) {
      const neutral = this.calculateScore({
        targetId: input.targetId,
        targetType: 'STREET',
        reports: [],
        calculatedAt: input.calculatedAt,
      });
      return { ...neutral, officialName: input.officialName, segments: [] };
    }

    const score = Math.round(
      evidenced.reduce((sum, item) => sum + item.score, 0) / evidenced.length,
    );
    const groupedFactors = new Map<string, ScoreFactor>();
    for (const segment of evidenced) {
      for (const factor of segment.factors) {
        const key = `${factor.source}:${factor.code}`;
        const aggregate = groupedFactors.get(key) ?? { ...factor, impact: 0 };
        aggregate.impact += factor.impact / evidenced.length;
        groupedFactors.set(key, aggregate);
      }
    }
    const confidence: StreetScoreConfidence = evidenced.some((item) => item.confidence === 'HIGH')
      ? 'HIGH'
      : evidenced.some((item) => item.confidence === 'MEDIUM')
        ? 'MEDIUM'
        : 'LOW';
    const metrics = this.combineMetrics(evidenced.map((item) => item.metrics));
    const sourceStatus = {
      community: 'AVAILABLE' as const,
      officialIncidents: evidenced.some(
        (item) => item.sourceStatus.officialIncidents === 'AVAILABLE',
      )
        ? ('AVAILABLE' as const)
        : ('UNAVAILABLE' as const),
      traffic: evidenced.some((item) => item.sourceStatus.traffic === 'AVAILABLE')
        ? ('AVAILABLE' as const)
        : ('UNAVAILABLE' as const),
    };
    groupedFactors.set('SYSTEM:SEGMENT_AGGREGATION', {
      code: 'SEGMENT_AGGREGATION',
      source: 'SYSTEM',
      label: 'Promedio de segmentos con evidencia',
      impact: 0,
      detail: `${evidenced.length} segmentos con señales; los tramos sin datos no alteran el promedio.`,
    });
    return {
      id: input.targetId,
      targetType: 'STREET',
      officialName: input.officialName,
      score,
      level: scoreLevel(score),
      confidence,
      factors: [...groupedFactors.values()].map((factor) => ({
        ...factor,
        impact: roundOne(factor.impact),
      })),
      metrics,
      sourceStatus,
      calculatedAt: input.calculatedAt,
      segments: evidenced,
    };
  }

  calculateScore(input: ScoreInput): ScoreResult {
    const factors: ScoreFactor[] = [
      {
        code: 'NEUTRAL_BASELINE',
        source: 'SYSTEM',
        label: 'Punto de partida neutral',
        impact: streetScoreConfig.neutralScore,
        detail:
          'El score comienza en 75; sin datos disponibles se interpreta como falta de evidencia, no como estado perfecto.',
      },
    ];
    const reportEvaluations = input.reports.map((evidence) => ({
      evidence,
      freshness: reportFreshnessPolicy.evaluate(
        evidence.report,
        evidence.feedback,
        input.calculatedAt,
      ),
    }));
    const active = reportEvaluations.filter(({ freshness }) => freshness.status === 'ACTIVE');
    const capped = capSameReporter(
      active.map(({ evidence }) => evidence),
      input.calculatedAt,
    );
    const selected = capped.reports;
    const severityImpact = selected.reduce((sum, evidence) => {
      const weight = reportFreshnessPolicy.confirmationWeight(
        lastActivityOf(evidence),
        input.calculatedAt,
      );
      return (
        sum -
        streetScoreConfig.severityPenalty[evidence.report.severity] *
          streetScoreConfig.severityFactorShare *
          weight
      );
    }, 0);
    const recencyImpact = selected.reduce((sum, evidence) => {
      const weight = reportFreshnessPolicy.confirmationWeight(
        lastActivityOf(evidence),
        input.calculatedAt,
      );
      return (
        sum -
        streetScoreConfig.severityPenalty[evidence.report.severity] *
          streetScoreConfig.recencyFactorShare *
          weight
      );
    }, 0);
    addFactor(factors, {
      code: 'REPORT_SEVERITY',
      source: 'COMMUNITY',
      label: 'Severidad de reportes activos',
      impact: severityImpact,
      detail: `${selected.length} aportes contabilizados; severidad crítica pesa más que la baja.`,
    });
    addFactor(factors, {
      code: 'REPORT_FRESHNESS',
      source: 'COMMUNITY',
      label: 'Antigüedad de reportes',
      impact: recencyImpact,
      detail: 'La señal disminuye con una vida media configurable de 30 días.',
    });

    const weightedConfirmations = selected.reduce(
      (sum, item) => sum + item.feedback.weightedConfirmations,
      0,
    );
    const confirmationPenalty = Math.min(
      streetScoreConfig.maximumConfirmationPenalty,
      weightedConfirmations * streetScoreConfig.confirmationPenaltyPerVote,
    );
    addFactor(factors, {
      code: 'COMMUNITY_CONFIRMATIONS',
      source: 'COMMUNITY',
      label: 'Confirmaciones comunitarias',
      impact: -confirmationPenalty,
      detail: `${selected.reduce((sum, item) => sum + item.feedback.confirmations, 0)} confirmaciones; la evidencia reciente aumenta la confianza en el problema.`,
    });

    const resolvedEvidence = capSameReporter(
      input.reports.filter(({ report }) => report.status === 'RESOLVED'),
      input.calculatedAt,
    );
    const weightedResolutions = selected.reduce(
      (sum, item) => sum + item.feedback.weightedResolvedReports,
      0,
    );
    const resolutionCredit = Math.min(
      streetScoreConfig.maximumResolutionCredit,
      resolvedEvidence.reports.length * 4 +
        weightedResolutions * streetScoreConfig.resolutionCreditPerVote,
    );
    addFactor(factors, {
      code: 'COMMUNITY_RESOLUTIONS',
      source: 'COMMUNITY',
      label: 'Resoluciones comunitarias',
      impact: resolutionCredit,
      detail: `${resolvedEvidence.reports.length} reportes resueltos y los votos recientes de resolución mejoran el score, con un máximo de ${streetScoreConfig.maximumResolutionCredit} puntos.`,
    });

    if (capped.cappedCount > 0) {
      factors.push({
        code: 'REPORTER_CONTRIBUTION_CAP',
        source: 'SYSTEM',
        label: 'Límite por persona',
        impact: 0,
        detail: `${capped.cappedCount} reportes del mismo usuario y segmento no sumaron impacto adicional; se conserva el de mayor severidad y recencia.`,
      });
    }

    const activeIncidents = (input.officialIncidents ?? []).filter((incident) => incident.active);
    const incidentPenalty = activeIncidents.reduce((sum, incident) => {
      const penalty =
        incident.type === 'TRAFFIC_CUT'
          ? 8
          : incident.type === 'ACCIDENT'
            ? 10
            : incident.type === 'ROAD_WORK'
              ? 3
              : 2;
      return sum + penalty;
    }, 0);
    addFactor(factors, {
      code: 'OFFICIAL_INCIDENTS',
      source: 'OFFICIAL',
      label: 'Cortes e incidentes oficiales',
      impact: -Math.min(streetScoreConfig.maximumOfficialIncidentPenalty, incidentPenalty),
      detail: activeIncidents.length
        ? `${activeIncidents.length} incidentes oficiales activos reducen el score.`
        : 'No hay incidentes oficiales activos disponibles para esta calle.',
    });

    if (input.traffic) {
      const weight = reportFreshnessPolicy.confirmationWeight(
        input.traffic.measuredAt,
        input.calculatedAt,
      );
      const penalty =
        (input.traffic.level === 'HIGH' ? 5 : input.traffic.level === 'MODERATE' ? 2 : 0) * weight;
      addFactor(factors, {
        code: 'OFFICIAL_TRAFFIC',
        source: 'OFFICIAL',
        label: 'Volumen de tráfico',
        impact: -penalty,
        detail: `Nivel ${input.traffic.level.toLowerCase()} medido en ${input.traffic.measuredAt.toISOString()}; la señal pierde peso con el tiempo.`,
      });
    }

    const latestActivity = reportEvaluations
      .map(({ evidence }) => lastActivityOf(evidence))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    if (
      active.length === 0 &&
      input.reports.length > 0 &&
      latestActivity &&
      input.calculatedAt.getTime() - latestActivity.getTime() >= 30 * millisecondsPerDay
    ) {
      addFactor(factors, {
        code: 'NO_RECENT_REPORTS',
        source: 'SYSTEM',
        label: 'Sin reportes recientes',
        impact: streetScoreConfig.stabilityBonus,
        detail: 'No hay reportes activos ni actividad comunitaria en los últimos 30 días.',
      });
    }

    const rawScore = factors.reduce((sum, factor) => sum + factor.impact, 0);
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    const metrics = {
      reports: input.reports.length,
      activeReports: active.length,
      recentReports: active.filter(({ freshness }) => freshness.freshness.level === 'FRESH').length,
      highSeverityReports: active.filter(
        ({ evidence }) =>
          evidence.report.severity === 'HIGH' || evidence.report.severity === 'CRITICAL',
      ).length,
      confirmations: input.reports.reduce((sum, item) => sum + item.feedback.confirmations, 0),
      resolvedReports:
        input.reports.filter(({ report }) => report.status === 'RESOLVED').length +
        input.reports.reduce((sum, item) => sum + item.feedback.resolvedReports, 0),
      officialIncidents: activeIncidents.length,
      trafficLevel: input.traffic?.level ?? null,
      latestReportAt: input.reports.length
        ? input.reports.reduce(
            (latest, item) => (item.report.createdAt > latest ? item.report.createdAt : latest),
            input.reports[0]!.report.createdAt,
          )
        : null,
    } satisfies ScoreMetrics;
    const confidence: StreetScoreConfidence =
      active.length >= 5 && new Set(selected.map((item) => item.actorId).filter(Boolean)).size >= 3
        ? 'HIGH'
        : active.length > 0 || activeIncidents.length > 0 || input.traffic
          ? 'MEDIUM'
          : 'LOW';
    return {
      id: input.targetId,
      targetType: input.targetType,
      score,
      level: scoreLevel(score),
      confidence,
      sourceStatus: {
        community: 'AVAILABLE',
        officialIncidents: input.officialIncidents === undefined ? 'UNAVAILABLE' : 'AVAILABLE',
        traffic: input.traffic == null ? 'UNAVAILABLE' : 'AVAILABLE',
      },
      factors,
      metrics,
      calculatedAt: input.calculatedAt,
    };
  }

  private isActive(input: StreetScoreInput, asOf: Date): boolean {
    return reportFreshnessPolicy.evaluate(input.report, input.feedback, asOf).status === 'ACTIVE';
  }

  private combineMetrics(metrics: ScoreMetrics[]): ScoreMetrics {
    const latestReportAt =
      metrics
        .map((item) => item.latestReportAt)
        .filter((value): value is Date => value !== null)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    return {
      reports: metrics.reduce((sum, item) => sum + item.reports, 0),
      activeReports: metrics.reduce((sum, item) => sum + item.activeReports, 0),
      recentReports: metrics.reduce((sum, item) => sum + item.recentReports, 0),
      highSeverityReports: metrics.reduce((sum, item) => sum + item.highSeverityReports, 0),
      confirmations: metrics.reduce((sum, item) => sum + item.confirmations, 0),
      resolvedReports: metrics.reduce((sum, item) => sum + item.resolvedReports, 0),
      officialIncidents: metrics.reduce((sum, item) => sum + item.officialIncidents, 0),
      trafficLevel: metrics.some((item) => item.trafficLevel === 'HIGH')
        ? 'HIGH'
        : metrics.some((item) => item.trafficLevel === 'MODERATE')
          ? 'MODERATE'
          : metrics.some((item) => item.trafficLevel === 'LOW')
            ? 'LOW'
            : null,
      latestReportAt,
    };
  }
}

export const streetScoreCalculator = new StreetScoreCalculator();
