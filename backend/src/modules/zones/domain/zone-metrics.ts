import {
  STREET_SCORE_BANDS,
  type StreetScoreLevel,
} from '../../streets/domain/street-score-calculator.js';

export type ZoneLevel = 'commune' | 'neighborhood';

/** Decisiones de producto de las zonas: todas ajustables aquí. */
export const ZONE_METRICS_CONFIG = {
  /** Con menos tramos con puntaje que esto, el estado de la zona es "datos insuficientes". */
  minScoredSegments: 5,
  /** Pesos del índice de intervención vial (por cada marca). */
  interventionWeights: { publicWork: 10, reportedWork: 10, reportedCut: 10, calming: 1 },
  /** Cortes de clases de reportes críticos (cantidad por zona). */
  criticalClassBreaks: [1, 3, 6],
} as const;

/** Datos crudos de una zona, tal como salen de la base. */
export interface ZoneRaw {
  id: number;
  name: string;
  /** Solo en barrios: comuna a la que pertenecen. */
  communeId: number | null;
  geometry: unknown;
  totalKm: number;
  segments: number;
  scoredSegments: number;
  scoreSum: number;
  scoredKm: number;
  surfaceKm: Record<string, number>;
  publicWorks: number;
  calming: Record<string, number>;
  reportedWorks: number;
  reportedCuts: number;
  criticalReports: number;
  highReports: number;
  activeReports: number;
}

export interface ZoneMetrics {
  condition: {
    avgScore: number | null;
    level: StreetScoreLevel | null;
    scoredSegments: number;
    /** Porcentaje de kilómetros de la zona con puntaje calculado. */
    coveragePct: number;
    sufficient: boolean;
  };
  surface: {
    dominant: { type: string; pct: number } | null;
    top: Array<{ type: string; pct: number }>;
    /** Porcentaje de kilómetros con tipo de pavimento conocido. */
    knownPct: number;
  };
  intervention: {
    /** Ponderado por cada 10 km de calle. */
    index: number;
    publicWorks: number;
    reportedWorks: number;
    reportedCuts: number;
    calming: number;
    calmingByType: Record<string, number>;
    calmingPerKm: number;
  };
  critical: {
    critical: number;
    high: number;
    activeReports: number;
    /** 0 = ninguno, 1 = pocos, 2 = varios, 3 = muchos. */
    class: 0 | 1 | 2 | 3;
  };
  totalKm: number;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function scoreToLevel(score: number): StreetScoreLevel {
  const rounded = Math.round(score);
  return (
    STREET_SCORE_BANDS.find((band) => rounded >= band.minimum && rounded <= band.maximum) ??
    STREET_SCORE_BANDS[STREET_SCORE_BANDS.length - 1]!
  ).level;
}

export function criticalClass(count: number): 0 | 1 | 2 | 3 {
  const [few, several, many] = ZONE_METRICS_CONFIG.criticalClassBreaks;
  if (count >= many) return 3;
  if (count >= several) return 2;
  if (count >= few) return 1;
  return 0;
}

export function computeZoneMetrics(raw: ZoneRaw): ZoneMetrics {
  const sufficient = raw.scoredSegments >= ZONE_METRICS_CONFIG.minScoredSegments;
  const avgScore = raw.scoredSegments > 0 ? round(raw.scoreSum / raw.scoredSegments) : null;

  const knownKm = Object.values(raw.surfaceKm).reduce((sum, km) => sum + km, 0);
  const top = Object.entries(raw.surfaceKm)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 3)
    .map(([type, km]) => ({ type, pct: knownKm > 0 ? round((km / knownKm) * 100) : 0 }));

  const weights = ZONE_METRICS_CONFIG.interventionWeights;
  const calmingTotal = Object.values(raw.calming).reduce((sum, count) => sum + count, 0);
  const weighted =
    raw.publicWorks * weights.publicWork +
    raw.reportedWorks * weights.reportedWork +
    raw.reportedCuts * weights.reportedCut +
    calmingTotal * weights.calming;

  return {
    condition: {
      avgScore: sufficient ? avgScore : null,
      level: sufficient && avgScore !== null ? scoreToLevel(avgScore) : null,
      scoredSegments: raw.scoredSegments,
      coveragePct: raw.totalKm > 0 ? round((raw.scoredKm / raw.totalKm) * 100) : 0,
      sufficient,
    },
    surface: {
      dominant: top[0] ?? null,
      top,
      knownPct: raw.totalKm > 0 ? round((knownKm / raw.totalKm) * 100) : 0,
    },
    intervention: {
      index: raw.totalKm > 0 ? round((weighted / raw.totalKm) * 10) : 0,
      publicWorks: raw.publicWorks,
      reportedWorks: raw.reportedWorks,
      reportedCuts: raw.reportedCuts,
      calming: calmingTotal,
      calmingByType: raw.calming,
      calmingPerKm: raw.totalKm > 0 ? round(calmingTotal / raw.totalKm, 2) : 0,
    },
    critical: {
      critical: raw.criticalReports,
      high: raw.highReports,
      activeReports: raw.activeReports,
      class: criticalClass(raw.criticalReports + raw.highReports),
    },
    totalKm: round(raw.totalKm),
  };
}
