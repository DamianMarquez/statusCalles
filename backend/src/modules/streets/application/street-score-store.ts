import type { StoredScore } from '../domain/stored-street-score.js';
import type { StreetScoreReportInput } from './street-score-repository.js';

export interface StoredScoreRow {
  id: string;
  score: number | null;
  level: string | null;
  hasEvidence: boolean;
  result: StoredScore;
  calculatedAt: Date;
}

export interface StreetScoreUpdate {
  streetId: string;
  /** Puntaje agregado de la calle; null si no corresponde guardarlo. */
  street: StoredScoreRow | null;
  /** Puntajes de los tramos con evidencia o señales. */
  segments: StoredScoreRow[];
}

export interface StreetScoreStore {
  /** Reportes visibles agrupados por tramo, para las calles indicadas. */
  findStreetEvidence(
    streetIds: string[],
    asOf: Date,
  ): Promise<
    Array<{ streetId: string; segments: Array<{ id: string; reports: StreetScoreReportInput[] }> }>
  >;
  /** Reemplaza los puntajes guardados de cada calle por los nuevos. */
  saveStreetScores(updates: StreetScoreUpdate[]): Promise<void>;
  findStreetIdByReportId(reportId: string): Promise<string | null>;
  /** Calles con reportes visibles asignados a un tramo, o con puntajes ya guardados. */
  findStreetIdsToRefresh(): Promise<string[]>;
}
