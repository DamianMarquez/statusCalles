import { useCallback, useEffect, useRef, useState } from 'react';
import { Popup, Rectangle, useMap, useMapEvents } from 'react-leaflet';
import { getStreetScoresInViewport } from '../../api/streetsApi.js';
import type { StreetScoreAreaDto } from '../../api/streetScoreTypes.js';
import type { ViewportBounds } from '../../api/reportTypes.js';
import { streetScoreColor } from './streetScorePalette.js';

function currentBounds(map: ReturnType<typeof useMap>): ViewportBounds {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast(),
  };
}

const conditionLabels: Record<StreetScoreAreaDto['condition'], string> = {
  IMPASSABLE: 'Intransitable',
  VERY_BAD: 'Muy malo',
  BAD: 'Malo',
  FAIR: 'Regular',
  GOOD: 'Bueno',
};

function relativeReportDate(dateValue: string): string {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(dateValue).getTime()) / 60_000),
  );
  const relative = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });
  if (elapsedMinutes < 60) return relative.format(-elapsedMinutes, 'minute');
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return relative.format(-elapsedHours, 'hour');
  return relative.format(-Math.floor(elapsedHours / 24), 'day');
}

export function StreetScoreLayer({ refreshKey }: { refreshKey: number }) {
  const map = useMap();
  const [areas, setAreas] = useState<StreetScoreAreaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const activeController = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);

  const requestScores = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    activeController.current?.abort();
    const requestNumber = ++sequence.current;
    setLoading(true);
    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      activeController.current = controller;
      try {
        const result = await getStreetScoresInViewport(currentBounds(map), controller.signal);
        if (requestNumber !== sequence.current || controller.signal.aborted) return;
        setAreas(result);
        setError(false);
      } catch {
        if (requestNumber !== sequence.current || controller.signal.aborted) return;
        setError(true);
      } finally {
        if (requestNumber === sequence.current && !controller.signal.aborted) setLoading(false);
      }
    }, 300);
  }, [map]);

  useMapEvents({ moveend: requestScores });

  useEffect(() => {
    requestScores();
    return () => {
      sequence.current += 1;
      if (timer.current) clearTimeout(timer.current);
      activeController.current?.abort();
    };
  }, [requestScores, refreshKey]);

  return (
    <>
      {areas.map((area) => (
        <Rectangle
          key={area.id}
          bounds={[
            [area.bounds.south, area.bounds.west],
            [area.bounds.north, area.bounds.east],
          ]}
          pathOptions={{
            color: streetScoreColor(area.score),
            fillColor: streetScoreColor(area.score),
            fillOpacity: 0.22,
            weight: 2,
          }}
        >
          <Popup>
            <div className="street-score-popup">
              <strong>Zona con reportes</strong>
              <span>
                Estado estimado: {area.score}/100 — {conditionLabels[area.condition]}
              </span>
              <span>
                Confianza del cálculo:{' '}
                {area.confidence === 'HIGH'
                  ? 'alta'
                  : area.confidence === 'MEDIUM'
                    ? 'media'
                    : 'baja'}
              </span>
              {(area.sourceStatus.officialIncidents === 'UNAVAILABLE' ||
                area.sourceStatus.traffic === 'UNAVAILABLE') && (
                <span>Las señales oficiales de cortes y tráfico no están disponibles.</span>
              )}
              <span>{area.reasons.activeReports} reportes activos</span>
              <span>{area.reasons.highSeverityReports} de alta severidad</span>
              <span>{area.reasons.confirmations} confirmaciones</span>
              <span>{area.reasons.resolvedReports} resoluciones o votos de resolución</span>
              <span>Último reporte: {relativeReportDate(area.reasons.latestReportAt)}</span>
              <details>
                <summary>Por qué tiene este score</summary>
                <ul>
                  {area.factors.map((factor) => (
                    <li key={factor.code}>
                      <strong>
                        {factor.label}: {factor.impact > 0 ? '+' : ''}
                        {factor.impact}
                      </strong>
                      <span>{factor.detail}</span>
                      <small>
                        Fuente:{' '}
                        {factor.source === 'COMMUNITY'
                          ? 'comunidad'
                          : factor.source === 'OFFICIAL'
                            ? 'oficial'
                            : 'sistema'}
                      </small>
                    </li>
                  ))}
                </ul>
              </details>
              <small>
                Estimación en una celda geográfica aproximada de 250 m; no representa una calle
                identificada.
              </small>
            </div>
          </Popup>
        </Rectangle>
      ))}
      <div className="street-score-status" aria-live="polite">
        {loading
          ? 'Calculando Street Score…'
          : error
            ? 'No pudimos actualizar los Street Scores.'
            : areas.length === 0
              ? 'Todavía no hay suficientes reportes activos en esta zona para estimar un Street Score.'
              : `${areas.length} zonas con Street Score estimado.`}
      </div>
    </>
  );
}
