import type {
  ScoreFactor,
  ScoreMetrics,
  ScoreResult,
  StreetScoreConfidence,
  StreetScoreLevel,
} from './street-score-calculator.js';

/**
 * Puntaje ya calculado y serializado, tal como se guarda y se entrega al mapa.
 * Las fechas son ISO-8601 para poder enviarlo sin transformar.
 */
export interface StoredScore {
  score: number | null;
  level: StreetScoreLevel | null;
  hasEvidence: boolean;
  confidence: StreetScoreConfidence | null;
  factors: ScoreFactor[];
  metrics: Omit<ScoreMetrics, 'latestReportAt'> & { latestReportAt: string | null };
  availability: ScoreResult['availability'];
  calculatedAt: string;
}

export function toStoredScore(result: ScoreResult): StoredScore {
  return {
    score: result.hasEvidence ? result.score : null,
    level: result.hasEvidence ? result.level : null,
    hasEvidence: result.hasEvidence,
    confidence: result.hasEvidence ? result.confidence : null,
    // Sin evidencia el detalle es solo la línea base neutral: no se envía.
    factors: result.hasEvidence ? result.factors : [],
    metrics: {
      ...result.metrics,
      latestReportAt: result.metrics.latestReportAt?.toISOString() ?? null,
    },
    availability: result.availability,
    calculatedAt: result.calculatedAt.toISOString(),
  };
}

/** Solo se guardan tramos/calles con evidencia o con señales de circulación. */
export function isStorableScore(result: ScoreResult): boolean {
  return result.hasEvidence || result.availability.status !== 'UNKNOWN';
}

export function noDataScore(calculatedAt: Date): StoredScore {
  return {
    score: null,
    level: null,
    hasEvidence: false,
    confidence: null,
    factors: [],
    metrics: {
      reports: 0,
      activeReports: 0,
      recentReports: 0,
      highSeverityReports: 0,
      confirmations: 0,
      resolvedReports: 0,
      officialIncidents: 0,
      trafficLevel: null,
      latestReportAt: null,
    },
    availability: { status: 'UNKNOWN', signals: [] },
    calculatedAt: calculatedAt.toISOString(),
  };
}
