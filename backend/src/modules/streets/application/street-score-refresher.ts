import { streetScoreCalculator } from '../domain/street-score-calculator.js';
import { isStorableScore, toStoredScore } from '../domain/stored-street-score.js';
import type { ScoreResult } from '../domain/street-score-calculator.js';
import type { StoredScoreRow, StreetScoreStore, StreetScoreUpdate } from './street-score-store.js';

/** Lo que necesitan los servicios de reportes para mantener los puntajes al día. */
export interface ScoreRefresher {
  refreshForReport(reportId: string): Promise<void>;
}

function toRow(id: string, result: ScoreResult): StoredScoreRow {
  const stored = toStoredScore(result);
  return {
    id,
    score: stored.score,
    level: stored.level,
    hasEvidence: stored.hasEvidence,
    result: stored,
    calculatedAt: result.calculatedAt,
  };
}

/**
 * Mantiene los puntajes precalculados que lee el mapa. Se llama cuando cambia un reporte
 * y de forma periódica (la frescura de los reportes decae con el tiempo).
 */
export class StreetScoreRefresher implements ScoreRefresher {
  constructor(
    private readonly store: StreetScoreStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly onRefreshed?: () => void,
  ) {}

  async refreshStreets(streetIds: string[]): Promise<void> {
    const ids = [...new Set(streetIds)];
    if (ids.length === 0) return;
    const calculatedAt = this.clock();
    const evidence = await this.store.findStreetEvidence(ids, calculatedAt);
    const byStreet = new Map(evidence.map((item) => [item.streetId, item.segments]));
    const updates: StreetScoreUpdate[] = ids.map((streetId) => {
      const segments = byStreet.get(streetId) ?? [];
      const segmentRows: StoredScoreRow[] = [];
      for (const segment of segments) {
        const result = streetScoreCalculator.calculateSegment({
          targetId: segment.id,
          reports: segment.reports,
          calculatedAt,
        });
        if (isStorableScore(result)) segmentRows.push(toRow(segment.id, result));
      }
      const streetResult = streetScoreCalculator.calculateStreet({
        targetId: streetId,
        officialName: '',
        segments,
        calculatedAt,
      });
      return {
        streetId,
        street: isStorableScore(streetResult) ? toRow(streetId, streetResult) : null,
        segments: segmentRows,
      };
    });
    await this.store.saveStreetScores(updates);
    // Los tiles guardados en memoria quedaron viejos.
    this.onRefreshed?.();
  }

  /** No lanza: un fallo de recálculo no debe romper la operación del usuario. */
  async refreshForReport(reportId: string): Promise<void> {
    try {
      const streetId = await this.store.findStreetIdByReportId(reportId);
      if (streetId) await this.refreshStreets([streetId]);
    } catch (error) {
      console.error('No se pudo actualizar el puntaje precalculado del reporte', reportId, error);
    }
  }

  async refreshAll(batchSize = 200): Promise<number> {
    const ids = await this.store.findStreetIdsToRefresh();
    for (let index = 0; index < ids.length; index += batchSize) {
      await this.refreshStreets(ids.slice(index, index + batchSize));
    }
    return ids.length;
  }
}
