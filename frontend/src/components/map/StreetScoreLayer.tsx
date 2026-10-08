import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from 'leaflet';
import { GeoJSON, Popup, useMap, useMapEvents } from 'react-leaflet';
import { getStreetConditionInViewport } from '../../api/streetsApi.js';
import type {
  StreetConditionFeature,
  StreetConditionFeatureCollection,
  StreetRoadClass,
} from '../../api/streetScoreTypes.js';
import type { ViewportBounds } from '../../api/reportTypes.js';
import { streetConditionLevel } from './streetConditionCatalog.js';
import { streetConditionLineStyle } from './streetConditionStyle.js';
import { STREET_ROAD_CLASS_OPTIONS } from './streetRoadClassCatalog.js';
import { roadSurfaceLineStyle } from './roadSurfaceStyle.js';
import { RoadInformationPanel } from './RoadInformationPanel.js';
import type {
  SurfaceCondition,
  SurfaceType,
  SpecialTreatment,
} from '../../api/roadInformationTypes.js';

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
  roadClasses = ['PRIMARY', 'SECONDARY', 'LOCAL'],
  conditionVisible = true,
  surfaceVisible = false,
  surfaceTypes = null,
  surfaceConditions = null,
  surfaceTreatments = null,
  authenticated = false,
  onRequestLogin,
  onInformationChanged,
  selectingRoadSegment = false,
  onRoadSegmentSelected,
  onViewStreetReports,
}: {
  refreshKey: number;
  levels?: string[] | null;
  roadClasses?: StreetRoadClass[];
  conditionVisible?: boolean;
  surfaceVisible?: boolean;
  surfaceTypes?: SurfaceType[] | null;
  surfaceConditions?: SurfaceCondition[] | null;
  surfaceTreatments?: SpecialTreatment[] | null;
  authenticated?: boolean;
  onRequestLogin: () => void;
  onInformationChanged: () => void;
  selectingRoadSegment?: boolean;
  onRoadSegmentSelected: (segmentId: string) => void;
  onViewStreetReports: (streetId: string, streetName: string) => void;
}) {
  const map = useMap();
  const [data, setData] = useState<StreetConditionFeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [dataRevision, setDataRevision] = useState(0);
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
  const roadClassKey = roadClasses.join(',');
  const surfaceTypeKey = surfaceTypes?.join(',') ?? '';
  const surfaceConditionKey = surfaceConditions?.join(',') ?? '';
  const surfaceTreatmentKey = surfaceTreatments?.join(',') ?? '';

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
          surfaceVisible ? null : levels,
          roadClasses,
          controller.signal,
        );
        if (requestNumber !== sequence.current || controller.signal.aborted) return;
        setData(result);
        // react-leaflet's GeoJSON layer does not apply changed `data` props to
        // an existing Leaflet layer, so remount it after each successful fetch.
        setDataRevision((revision) => revision + 1);
        setError(false);
      } catch {
        if (requestNumber !== sequence.current || controller.signal.aborted) return;
        setError(true);
      } finally {
        if (requestNumber === sequence.current && !controller.signal.aborted) setLoading(false);
      }
    }, 280);
  }, [levelKey, levels, map, roadClassKey, roadClasses, surfaceVisible]);

  useMapEvents({ moveend: request, zoomend: request });
  useEffect(() => {
    if (selectingRoadSegment && map.getZoom() < 16) map.setZoom(16);
  }, [map, selectingRoadSegment]);
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
      {conditionVisible && (
        <GeoJSON
          key={`${refreshKey}:${levelKey}:${roadClassKey}:${dataRevision}`}
          data={data as never}
          filter={(feature) =>
            levels === null ||
            levels === undefined ||
            levels.includes(feature?.properties?.condition)
          }
          style={(feature) => {
            const level = (feature?.properties?.condition as string | null) ?? null;
            return streetConditionLineStyle(
              level,
              map.getZoom(),
              feature?.properties?.availability?.status ?? 'UNKNOWN',
            );
          }}
          eventHandlers={{
            click: (event) => {
              const feature = (
                event.layer as typeof event.layer & { feature?: StreetConditionFeature }
              ).feature;
              if (feature?.properties) {
                setSelected({ feature, position: event.latlng });
                if (selectingRoadSegment && feature.properties.targetType === 'SEGMENT')
                  onRoadSegmentSelected(feature.properties.id);
              }
            },
          }}
        />
      )}
      {surfaceVisible && (
        <GeoJSON
          key={`surface:${refreshKey}:${surfaceTypeKey}:${surfaceConditionKey}:${surfaceTreatmentKey}:${dataRevision}`}
          data={data as never}
          filter={(feature) => {
            const properties = feature?.properties;
            const info = properties?.roadInformation;
            if (properties?.targetType !== 'SEGMENT' || !info?.surfaceType) return false;
            if (surfaceTypes && !surfaceTypes.includes(info.surfaceType as SurfaceType))
              return false;
            if (
              surfaceConditions &&
              (!info.surfaceCondition ||
                !surfaceConditions.includes(info.surfaceCondition as SurfaceCondition))
            )
              return false;
            if (
              surfaceTreatments &&
              (!info.specialTreatments ||
                !info.specialTreatments.some((item: string) =>
                  surfaceTreatments.includes(item as SpecialTreatment),
                ))
            )
              return false;
            return true;
          }}
          style={(feature) =>
            roadSurfaceLineStyle(
              feature?.properties?.roadInformation?.surfaceType as SurfaceType,
              map.getZoom(),
              feature?.properties?.roadInformation?.surfaceCondition ?? null,
            )
          }
          eventHandlers={{
            click: (event) => {
              const feature = (
                event.layer as typeof event.layer & { feature?: StreetConditionFeature }
              ).feature;
              if (feature?.properties) {
                setSelected({ feature, position: event.latlng });
                if (selectingRoadSegment && feature.properties.targetType === 'SEGMENT')
                  onRoadSegmentSelected(feature.properties.id);
              }
            },
          }}
        />
      )}
      {selected && (
        <Popup position={selected.position} eventHandlers={{ remove: () => setSelected(null) }}>
          <div className="street-score-popup">
            <strong>{selected.feature.properties.streetName}</strong>
            <span>
              Jerarquía vial:{' '}
              {STREET_ROAD_CLASS_OPTIONS.find(
                (item) => item.value === selected.feature.properties.roadClass,
              )?.label ?? 'Sin clasificar'}
            </span>
            {selected.feature.properties.targetType === 'SEGMENT' && (
              <RoadInformationPanel
                key={selected.feature.properties.id}
                segmentId={selected.feature.properties.id}
                authenticated={authenticated}
                onRequestLogin={onRequestLogin}
                onChanged={onInformationChanged}
              />
            )}
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
              <span>
                Buena por defecto · sin reportes físicos suficientes para calcular un score.
              </span>
            )}
            <span>
              Reportes: {selected.feature.properties.metrics.reports}
              {selected.feature.properties.hasReports
                ? ''
                : ' · sin reportes físicos asociados a esta vía'}
            </span>
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
        {error && (
          <button
            type="button"
            className="street-score-status__retry"
            aria-label="Reintentar estado de calles"
            onClick={request}
          >
            Reintentar
          </button>
        )}
      </div>
    </>
  );
}
