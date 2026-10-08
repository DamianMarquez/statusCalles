import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from 'leaflet';
import { GeoJSON, Popup, useMap, useMapEvents } from 'react-leaflet';
import { getStreetConditionInViewport } from '../../api/streetsApi.js';
import type {
  StreetConditionFeature,
  StreetConditionFeatureCollection,
} from '../../api/streetScoreTypes.js';
import type { ViewportBounds } from '../../api/reportTypes.js';
import {
  NO_STREET_CONDITION_COLOR,
  streetConditionColor,
  streetConditionLevel,
} from './streetConditionCatalog.js';

const vehicleInterpretations = {
  'Auto común':
    'Referencia visual para conducción cotidiana; el score no describe cada punto de la calzada.',
  'SUV / 4x4': 'La altura del vehículo no convierte un tramo reportado en seguro ni transitable.',
  Deportivo: 'El despeje bajo puede hacer más perceptibles las irregularidades informadas.',
  Rally: 'Analogía recreativa basada en reportes; no habilita ni recomienda circular.',
} as const;

function currentBounds(map: ReturnType<typeof useMap>): ViewportBounds {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast(),
  };
}

function confidenceLabel(confidence: string | null) {
  return confidence === 'HIGH'
    ? 'alta'
    : confidence === 'MEDIUM'
      ? 'media'
      : confidence === 'LOW'
        ? 'baja'
        : 'sin datos';
}

export function StreetScoreLayer({
  refreshKey,
  levels = null,
  onViewStreetReports,
}: {
  refreshKey: number;
  levels?: string[] | null;
  onViewStreetReports: (streetId: string, streetName: string) => void;
}) {
  const map = useMap();
  const [data, setData] = useState<StreetConditionFeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [vehicleMode, setVehicleMode] = useState<keyof typeof vehicleInterpretations>('Auto común');
  const [selected, setSelected] = useState<{
    feature: StreetConditionFeature;
    position: LatLng;
  } | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const levelKey = levels?.join(',') ?? '';

  const request = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    activeController.current?.abort();
    const requestNumber = ++sequence.current;
    setLoading(true);
    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      activeController.current = controller;
      try {
        const result = await getStreetConditionInViewport(
          currentBounds(map),
          map.getZoom(),
          levels,
          controller.signal,
        );
        if (requestNumber !== sequence.current || controller.signal.aborted) return;
        setData(result);
        setError(false);
      } catch {
        if (requestNumber !== sequence.current || controller.signal.aborted) return;
        setError(true);
      } finally {
        if (requestNumber === sequence.current && !controller.signal.aborted) setLoading(false);
      }
    }, 280);
  }, [levelKey, levels, map]);

  useMapEvents({ moveend: request, zoomend: request });
  useEffect(() => {
    request();
    return () => {
      sequence.current += 1;
      if (timer.current) clearTimeout(timer.current);
      activeController.current?.abort();
    };
  }, [request, refreshKey]);

  return (
    <>
      <GeoJSON
        key={`${refreshKey}:${levelKey}`}
        data={data as never}
        style={(feature) => {
          const level = (feature?.properties?.level as string | null) ?? null;
          const color = level ? streetConditionColor(level as never) : NO_STREET_CONDITION_COLOR;
          return {
            color,
            weight: level ? 5 : 3,
            opacity: 0.88,
            dashArray: feature?.properties?.availability?.status === 'BLOCKED' ? '7 5' : undefined,
          };
        }}
        eventHandlers={{
          click: (event) => {
            const feature = (
              event.layer as typeof event.layer & { feature?: StreetConditionFeature }
            ).feature;
            if (feature?.properties) setSelected({ feature, position: event.latlng });
          },
        }}
      />
      {selected && (
        <Popup position={selected.position} eventHandlers={{ remove: () => setSelected(null) }}>
          <div className="street-score-popup">
            <strong>{selected.feature.properties.streetName}</strong>
            {selected.feature.properties.hasEvidence ? (
              <>
                <span>
                  Estado: {selected.feature.properties.score}/100 ·{' '}
                  {streetConditionLevel(selected.feature.properties.level ?? '')?.label}
                </span>
                <span>
                  Confianza de la estimación:{' '}
                  {confidenceLabel(selected.feature.properties.confidence)}
                </span>
                <span>
                  {selected.feature.properties.metrics.activeReports} reportes activos ·{' '}
                  {selected.feature.properties.metrics.confirmations} confirmaciones
                </span>
                <label className="street-score-vehicle">
                  Interpretación visual orientativa
                  <select
                    value={vehicleMode}
                    onChange={(event) =>
                      setVehicleMode(event.target.value as keyof typeof vehicleInterpretations)
                    }
                  >
                    {Object.keys(vehicleInterpretations).map((mode) => (
                      <option key={mode}>{mode}</option>
                    ))}
                  </select>
                  <small>{vehicleInterpretations[vehicleMode]}</small>
                </label>
                <details>
                  <summary>Por qué tiene este estado</summary>
                  <ul>
                    {selected.feature.properties.factors.map((factor) => (
                      <li key={`${factor.source}:${factor.code}`}>
                        <strong>
                          {factor.label}: {factor.impact > 0 ? '+' : ''}
                          {factor.impact}
                        </strong>
                        <span>{factor.detail}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <span>Sin datos suficientes para estimar la condición física.</span>
            )}
            <span>
              Circulación:{' '}
              {selected.feature.properties.availability.status === 'BLOCKED'
                ? 'bloqueada según señales disponibles'
                : selected.feature.properties.availability.status === 'RESTRICTED'
                  ? 'con restricciones posibles'
                  : selected.feature.properties.availability.status === 'OPEN'
                    ? 'sin restricciones conocidas'
                    : 'sin información disponible'}
              .
            </span>
            {selected.feature.properties.availability.signals.length > 0 && (
              <small>Señales: {selected.feature.properties.availability.signals.join(', ')}</small>
            )}
            <button
              type="button"
              onClick={() => {
                onViewStreetReports(
                  selected.feature.properties.streetId,
                  selected.feature.properties.streetName,
                );
                map.closePopup();
                map.setView(selected.position, Math.max(map.getZoom(), 16));
              }}
            >
              Ver reportes de esta calle
            </button>
            <small>
              Estimación comunitaria; no es una medición profesional ni una recomendación de
              seguridad.
            </small>
          </div>
        </Popup>
      )}
      <div className="street-score-status" aria-live="polite">
        {loading
          ? 'Actualizando estado de calles…'
          : error
            ? 'No pudimos actualizar el estado de las calles.'
            : `${data.features.length} segmentos o calles en el área visible.`}
      </div>
    </>
  );
}
