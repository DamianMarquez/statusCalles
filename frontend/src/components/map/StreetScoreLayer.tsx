import { useCallback, useEffect, useRef, useState } from 'react';
import type { FilterSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { getStreetConditionInViewport } from '../../api/streetsApi.js';
import type {
  StreetConditionFeature,
  StreetConditionFeatureCollection,
  StreetRoadClass,
} from '../../api/streetScoreTypes.js';
import type { ViewportBounds } from '../../api/reportTypes.js';
import { streetConditionLevel } from './streetConditionCatalog.js';
import { STREET_ROAD_CLASS_OPTIONS } from './streetRoadClassCatalog.js';
import { surfaceConditionDashPattern } from './roadSurfaceStyle.js';
import {
  NO_DATA_COLOR,
  scoreColorExpression,
  streetCasingOpacityExpression,
  streetCasingWidthExpression,
  streetSurfaceWidthExpression,
  streetWidthExpression,
} from './streetLayerStyle.js';
import { ConditionCache, conditionCacheKey, snapBounds } from './streetConditionCache.js';
import { focusMap, MapPopup, useMapEvents, useMapInstance } from './maplibre/mapLibre.js';
import {
  SURFACE_TYPE_OPTIONS,
  type SurfaceCondition,
  type SurfaceType,
  type SpecialTreatment,
} from '../../api/roadInformationTypes.js';

const vehicleInterpretations = {
  'Auto común':
    'Referencia visual para conducción cotidiana; el score no describe cada punto de la calzada.',
  'SUV / 4x4': 'La altura del vehículo no convierte un tramo reportado en seguro ni transitable.',
  Deportivo: 'El despeje bajo puede hacer más perceptibles las irregularidades informadas.',
  Rally: 'Analogía recreativa basada en reportes; no habilita ni recomienda circular.',
} as const;

const STREETS_SOURCE = 'street-score';
const SURFACE_SOURCE = 'street-surface';
const SURFACE_CONDITIONS: (SurfaceCondition | 'OTHER')[] = [
  'GOOD',
  'REGULAR',
  'POOR',
  'VERY_POOR',
  'OTHER',
];
const SURFACE_LAYER_IDS = SURFACE_CONDITIONS.map((condition) => `street-surface-${condition}`);
const STREET_LAYER_IDS = [
  'street-score-casing',
  'street-score-line',
  'street-score-blocked',
  ...SURFACE_LAYER_IDS,
  'street-score-hit',
];

const surfaceColorExpression = [
  'match',
  ['get', 'surfaceType'],
  ...SURFACE_TYPE_OPTIONS.flatMap((item) => [item.value, item.color]),
  NO_DATA_COLOR,
] as unknown as import('maplibre-gl').ExpressionSpecification;

function currentBounds(map: MapLibreMap): ViewportBounds {
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

/** Propiedades planas para pintar; el detalle completo se consulta por id al hacer clic. */
function toStreetCollection(data: StreetConditionFeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: data.features.map((feature) => ({
      type: 'Feature' as const,
      geometry: feature.geometry,
      properties: {
        id: feature.properties.id,
        level: feature.properties.level,
        score: feature.properties.score,
        hasEvidence: feature.properties.hasEvidence === true,
        roadClass: feature.properties.roadClass,
        availabilityStatus: feature.properties.availability?.status ?? 'UNKNOWN',
      },
    })),
  } as FeatureCollection;
}

function levelFilter(levels: string[] | null | undefined): FilterSpecification | null {
  if (levels === null || levels === undefined) return null;
  return ['in', ['get', 'level'], ['literal', levels]];
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
  selectingRoadSegment?: boolean;
  onRoadSegmentSelected: (feature: StreetConditionFeature) => void;
  onViewStreetReports: (streetId: string, streetName: string) => void;
}) {
  const map = useMapInstance();
  const [data, setData] = useState<StreetConditionFeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [vehicleMode, setVehicleMode] = useState<keyof typeof vehicleInterpretations>('Auto común');
  const [selected, setSelected] = useState<{
    feature: StreetConditionFeature;
    position: [number, number];
  } | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const featuresById = useRef(new Map<string, StreetConditionFeature>());
  const cache = useRef(new ConditionCache());
  const lastRefreshKey = useRef(refreshKey);
  const selectingRef = useRef(selectingRoadSegment);
  const onSelectedRef = useRef(onRoadSegmentSelected);
  useEffect(() => {
    selectingRef.current = selectingRoadSegment;
    onSelectedRef.current = onRoadSegmentSelected;
  });
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
      // Un cambio de datos (reporte nuevo, voto) invalida lo guardado.
      const fresh = lastRefreshKey.current !== refreshKey;
      if (fresh) {
        cache.current.clear();
        lastRefreshKey.current = refreshKey;
      }
      const zoom = map.getZoom();
      const bounds = snapBounds(currentBounds(map), zoom);
      const effectiveLevels = surfaceVisible ? null : levels;
      const key = conditionCacheKey(bounds, zoom, effectiveLevels, roadClasses);
      const cached = cache.current.get(key);
      if (cached) {
        featuresById.current = new Map(
          cached.features.map((feature) => [feature.properties.id, feature]),
        );
        setData(cached);
        setError(false);
        setLoading(false);
        return;
      }
      const controller = new AbortController();
      activeController.current = controller;
      try {
        const result = await getStreetConditionInViewport(
          bounds,
          zoom,
          effectiveLevels,
          roadClasses,
          controller.signal,
          { fresh },
        );
        if (requestNumber !== sequence.current || controller.signal.aborted) return;
        cache.current.set(key, result);
        featuresById.current = new Map(
          result.features.map((feature) => [feature.properties.id, feature]),
        );
        setData(result);
        setError(false);
      } catch {
        if (requestNumber !== sequence.current || controller.signal.aborted) return;
        setError(true);
      } finally {
        if (requestNumber === sequence.current && !controller.signal.aborted) setLoading(false);
      }
    }, 280);
  }, [levelKey, levels, map, refreshKey, roadClassKey, roadClasses, surfaceVisible]);

  useMapEvents({ moveend: request, zoomend: request });
  useEffect(() => {
    if (selectingRoadSegment && map.getZoom() < 16) map.easeTo({ zoom: 16 });
  }, [map, selectingRoadSegment]);
  useEffect(() => {
    request();
    return () => {
      sequence.current += 1;
      if (timer.current) clearTimeout(timer.current);
      activeController.current?.abort();
    };
  }, [request, refreshKey]);

  // Fuentes y capas: se crean una vez y se actualizan por datos y filtros.
  useEffect(() => {
    const empty = { type: 'FeatureCollection', features: [] } as FeatureCollection;
    // Debajo de las etiquetas del mapa base, para que los nombres de calles sigan legibles.
    const beforeId = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
    map.addSource(STREETS_SOURCE, { type: 'geojson', data: empty });
    map.addSource(SURFACE_SOURCE, { type: 'geojson', data: empty });
    for (const condition of SURFACE_CONDITIONS) {
      // Sin condición informada (caso del pavimento base importado) la banda va continua:
      // los guiones solo significan una condición conocida de la calzada.
      const dash = condition === 'OTHER' ? null : surfaceConditionDashPattern(condition);
      const known: SurfaceCondition[] = ['GOOD', 'REGULAR', 'POOR', 'VERY_POOR'];
      const filter: FilterSpecification =
        condition === 'OTHER'
          ? ['!', ['in', ['get', 'surfaceCondition'], ['literal', known]]]
          : ['==', ['get', 'surfaceCondition'], condition];
      map.addLayer(
        {
          id: `street-surface-${condition}`,
          type: 'line',
          source: SURFACE_SOURCE,
          filter,
          layout: { 'line-cap': condition === 'GOOD' ? 'round' : 'butt', 'line-join': 'round' },
          paint: {
            'line-color': surfaceColorExpression,
            'line-opacity': 0.9,
            'line-width': streetSurfaceWidthExpression,
            ...(dash ? { 'line-dasharray': dash } : {}),
          },
        },
        beforeId,
      );
    }
    map.addLayer(
      {
        id: 'street-score-casing',
        type: 'line',
        source: STREETS_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-opacity': streetCasingOpacityExpression,
          'line-width': streetCasingWidthExpression,
          'line-blur': 0.6,
        },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: 'street-score-line',
        type: 'line',
        source: STREETS_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': scoreColorExpression,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.75, 16, 0.95],
          'line-width': streetWidthExpression,
          'line-blur': 0.4,
        },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: 'street-score-blocked',
        type: 'line',
        source: STREETS_SOURCE,
        filter: ['==', ['get', 'availabilityStatus'], 'BLOCKED'],
        paint: { 'line-color': '#222222', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      },
      beforeId,
    );
    // Capa invisible más ancha: hace que tocar una calle fina sea fácil.
    map.addLayer(
      {
        id: 'street-score-hit',
        type: 'line',
        source: STREETS_SOURCE,
        paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
      },
      beforeId,
    );
    return () => {
      for (const id of STREET_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(STREETS_SOURCE)) map.removeSource(STREETS_SOURCE);
      if (map.getSource(SURFACE_SOURCE)) map.removeSource(SURFACE_SOURCE);
    };
  }, [map]);

  // Datos de calles.
  useEffect(() => {
    (map.getSource(STREETS_SOURCE) as GeoJSONSource | undefined)?.setData(toStreetCollection(data));
  }, [map, data]);

  // Datos de pavimento: solo tramos con información, filtrados en cliente.
  useEffect(() => {
    const features = data.features.filter((feature) => {
      const info = feature.properties.roadInformation;
      if (
        feature.properties.targetType !== 'SEGMENT' ||
        (!info?.surfaceType && !info?.surfaceCondition)
      )
        return false;
      if (surfaceTypes && (!info.surfaceType || !surfaceTypes.includes(info.surfaceType)))
        return false;
      if (
        surfaceConditions &&
        (!info.surfaceCondition || !surfaceConditions.includes(info.surfaceCondition))
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
    });
    const collection = {
      type: 'FeatureCollection',
      features: features.map((feature) => ({
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          id: feature.properties.id,
          roadClass: feature.properties.roadClass,
          hasEvidence: feature.properties.hasEvidence === true,
          surfaceType: feature.properties.roadInformation?.surfaceType ?? null,
          surfaceCondition: feature.properties.roadInformation?.surfaceCondition ?? null,
        },
      })),
    } as FeatureCollection;
    (map.getSource(SURFACE_SOURCE) as GeoJSONSource | undefined)?.setData(collection);
  }, [map, data, surfaceTypeKey, surfaceConditionKey, surfaceTreatmentKey]);

  // Visibilidad y filtros por nivel (sin recargar datos).
  useEffect(() => {
    const filter = levelFilter(levels);
    for (const id of ['street-score-casing', 'street-score-line', 'street-score-blocked']) {
      if (!map.getLayer(id)) continue;
      const base: FilterSpecification | null =
        id === 'street-score-blocked' ? ['==', ['get', 'availabilityStatus'], 'BLOCKED'] : null;
      const combined = (
        base && filter ? ['all', base, filter] : (base ?? filter)
      ) as FilterSpecification | null;
      map.setFilter(id, combined);
      // Con pavimento visible la banda de pavimento reemplaza al borde claro.
      const visible = conditionVisible && !(id === 'street-score-casing' && surfaceVisible);
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
    for (const id of SURFACE_LAYER_IDS) {
      if (map.getLayer(id))
        map.setLayoutProperty(id, 'visibility', surfaceVisible ? 'visible' : 'none');
    }
  }, [map, levelKey, levels, conditionVisible, surfaceVisible]);

  // Clic y cursor sobre las calles.
  useEffect(() => {
    const onClick = (event: {
      point: { x: number; y: number };
      lngLat: { lat: number; lng: number };
    }) => {
      const hits = map.queryRenderedFeatures(
        [event.point.x, event.point.y] as unknown as [number, number],
        { layers: ['street-score-hit'] },
      );
      const id = hits[0]?.properties?.id as string | undefined;
      const feature = id ? featuresById.current.get(id) : undefined;
      if (!feature?.properties) return;
      if (selectingRef.current && feature.properties.targetType === 'SEGMENT') {
        setSelected(null);
        onSelectedRef.current(feature);
      } else setSelected({ feature, position: [event.lngLat.lat, event.lngLat.lng] });
    };
    const pointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const reset = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('click', onClick);
    map.on('mouseenter', 'street-score-hit', pointer);
    map.on('mouseleave', 'street-score-hit', reset);
    return () => {
      map.off('click', onClick);
      map.off('mouseenter', 'street-score-hit', pointer);
      map.off('mouseleave', 'street-score-hit', reset);
      reset();
    };
  }, [map]);

  return (
    <>
      {selected && (
        <MapPopup position={selected.position} onClose={() => setSelected(null)}>
          <div className="street-score-popup">
            <strong>{selected.feature.properties.streetName}</strong>
            <span>
              Jerarquía vial:{' '}
              {STREET_ROAD_CLASS_OPTIONS.find(
                (item) => item.value === selected.feature.properties.roadClass,
              )?.label ?? 'Sin clasificar'}
            </span>
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
                Sin datos todavía · no hay reportes físicos suficientes para calcular un score.
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
                setSelected(null);
                focusMap(map, selected.position[0], selected.position[1]);
              }}
            >
              Ver reportes de esta calle
            </button>
            <small>
              Estimación comunitaria; no es una medición profesional ni una recomendación de
              seguridad.
            </small>
          </div>
        </MapPopup>
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
