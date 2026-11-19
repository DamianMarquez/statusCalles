import { useEffect, useRef, useState } from 'react';
import type { ExpressionSpecification, FilterSpecification, VectorTileSource } from 'maplibre-gl';
import { API_BASE_URL } from '../../api/apiBaseUrl.js';
import type { StreetRoadClass } from '../../api/streetScoreTypes.js';
import {
  SURFACE_TYPE_OPTIONS,
  type SpecialTreatment,
  type SurfaceCondition,
  type SurfaceType,
} from '../../api/roadInformationTypes.js';
import { surfaceConditionDashPattern } from './roadSurfaceStyle.js';
import {
  NO_DATA_COLOR,
  scoreColorExpression,
  streetCasingOpacityExpression,
  streetCasingWidthExpression,
  streetSurfaceOnlyWidthExpression,
  streetSurfaceWidthExpression,
  streetWidthExpression,
} from './streetLayerStyle.js';
import { focusMap, MapPopup, useMapInstance } from './maplibre/mapLibre.js';
import { StreetPopup } from './StreetPopup.js';
import type { SelectedRoadSegment, StreetMode, StreetTileProperties } from './types.js';

const SOURCE_ID = 'street-tiles';
const SOURCE_LAYER = 'streets';
const SURFACE_CONDITIONS: (SurfaceCondition | 'OTHER')[] = [
  'GOOD',
  'REGULAR',
  'POOR',
  'VERY_POOR',
  'OTHER',
];
const SURFACE_LAYER_IDS = SURFACE_CONDITIONS.map((condition) => `street-surface-${condition}`);
const CONDITION_LAYER_IDS = ['street-score-casing', 'street-score-line', 'street-score-blocked'];
const STREET_LAYER_IDS = [...SURFACE_LAYER_IDS, ...CONDITION_LAYER_IDS, 'street-score-hit'];

const surfaceColorExpression = [
  'match',
  ['get', 'st'],
  ...SURFACE_TYPE_OPTIONS.flatMap((item) => [item.value, item.color]),
  NO_DATA_COLOR,
] as unknown as ExpressionSpecification;

/** URL absoluta de los tiles; `version` fuerza descargar de nuevo tras un cambio propio. */
export function streetTileUrl(version: number): string {
  const base = API_BASE_URL.startsWith('http')
    ? API_BASE_URL
    : new URL(API_BASE_URL, window.location.origin).href;
  return `${base}/tiles/streets/{z}/{x}/{y}.pbf?v=${version}`;
}

function allOf(...filters: Array<ExpressionSpecification | null>): FilterSpecification | null {
  const present = filters.filter((filter): filter is ExpressionSpecification => filter !== null);
  if (present.length === 0) return null;
  return (present.length === 1 ? present[0] : ['all', ...present]) as FilterSpecification;
}

function inList(property: string, values: readonly string[]): ExpressionSpecification {
  return ['in', ['get', property], ['literal', [...values]]] as unknown as ExpressionSpecification;
}

/** Calles y pavimento sobre tiles vectoriales: todos los filtros se aplican en el navegador. */
export function StreetScoreLayer({
  refreshKey,
  mode = 'condition',
  levels = null,
  roadClasses = ['PRIMARY', 'SECONDARY', 'LOCAL'],
  surfaceTypes = null,
  surfaceConditions = null,
  surfaceTreatments = null,
  selectingRoadSegment = false,
  onRoadSegmentSelected,
  onViewStreetReports,
}: {
  refreshKey: number;
  mode?: StreetMode;
  levels?: string[] | null;
  roadClasses?: StreetRoadClass[];
  surfaceTypes?: SurfaceType[] | null;
  surfaceConditions?: SurfaceCondition[] | null;
  surfaceTreatments?: SpecialTreatment[] | null;
  selectingRoadSegment?: boolean;
  onRoadSegmentSelected: (segment: SelectedRoadSegment) => void;
  onViewStreetReports: (streetId: string, streetName: string) => void;
}) {
  const map = useMapInstance();
  const [selected, setSelected] = useState<{
    street: StreetTileProperties;
    position: [number, number];
  } | null>(null);
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

  useEffect(() => {
    if (selectingRoadSegment && map.getZoom() < 16) map.easeTo({ zoom: 16 });
  }, [map, selectingRoadSegment]);

  // Fuente y capas: se crean una vez; todo lo demás es filtro y visibilidad.
  useEffect(() => {
    // Debajo de las etiquetas del mapa base, para que los nombres de calles sigan legibles.
    const beforeId = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
    map.addSource(SOURCE_ID, {
      type: 'vector',
      tiles: [streetTileUrl(0)],
      minzoom: 10,
      maxzoom: 16,
    });
    const common = { source: SOURCE_ID, 'source-layer': SOURCE_LAYER } as const;
    for (const condition of SURFACE_CONDITIONS) {
      // Sin condición informada (pavimento base importado) la banda va continua: los guiones
      // solo significan una condición conocida de la calzada.
      const dash = condition === 'OTHER' ? null : surfaceConditionDashPattern(condition);
      map.addLayer(
        {
          id: `street-surface-${condition}`,
          type: 'line',
          ...common,
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
        ...common,
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
        ...common,
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
        ...common,
        filter: ['==', ['get', 'av'], 'BLOCKED'],
        paint: { 'line-color': '#222222', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      },
      beforeId,
    );
    // Capa invisible más ancha: hace que tocar una calle fina sea fácil.
    map.addLayer(
      {
        id: 'street-score-hit',
        type: 'line',
        ...common,
        paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
      },
      beforeId,
    );
    return () => {
      for (const id of STREET_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  // Tras un reporte o voto propio se pide de nuevo, saltando la caché del navegador.
  useEffect(() => {
    if (refreshKey === 0) return;
    (map.getSource(SOURCE_ID) as VectorTileSource | undefined)?.setTiles([
      streetTileUrl(refreshKey),
    ]);
  }, [map, refreshKey]);

  // Visibilidad según el modo y filtros: nada de esto vuelve a descargar datos.
  useEffect(() => {
    const showCondition = mode === 'condition' || mode === 'both';
    const showSurface = mode === 'surface' || mode === 'both';
    const classes: string[] = [...roadClasses];
    if (classes.includes('LOCAL')) classes.push('UNKNOWN');
    const classFilter = inList('rc', classes);
    const levelFilter = levels === null ? null : inList('lv', levels);

    for (const id of CONDITION_LAYER_IDS) {
      if (!map.getLayer(id)) continue;
      const base =
        id === 'street-score-blocked'
          ? (['==', ['get', 'av'], 'BLOCKED'] as unknown as ExpressionSpecification)
          : null;
      map.setFilter(id, allOf(classFilter, levelFilter, base));
      // Con pavimento visible, la banda de pavimento hace de borde y el borde claro sobra.
      const visible = showCondition && !(id === 'street-score-casing' && showSurface);
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }

    const hasSurface = ['has', 'st'] as unknown as ExpressionSpecification;
    const typeFilter = surfaceTypes === null ? null : inList('st', surfaceTypes);
    const conditionFilter = surfaceConditions === null ? null : inList('sco', surfaceConditions);
    const treatmentFilter =
      surfaceTreatments === null
        ? null
        : ([
            'any',
            ...surfaceTreatments.map((item) => ['in', item, ['coalesce', ['get', 'tr'], '']]),
          ] as unknown as ExpressionSpecification);
    const known: SurfaceCondition[] = ['GOOD', 'REGULAR', 'POOR', 'VERY_POOR'];
    for (const condition of SURFACE_CONDITIONS) {
      const id = `street-surface-${condition}`;
      if (!map.getLayer(id)) continue;
      const byCondition =
        condition === 'OTHER'
          ? (['!', inList('sco', known)] as unknown as ExpressionSpecification)
          : (['==', ['get', 'sco'], condition] as unknown as ExpressionSpecification);
      map.setFilter(
        id,
        allOf(hasSurface, classFilter, typeFilter, conditionFilter, treatmentFilter, byCondition),
      );
      map.setLayoutProperty(id, 'visibility', showSurface ? 'visible' : 'none');
      // Solo pavimento: ancho normal; con estado encima: banda más ancha que hace de borde.
      map.setPaintProperty(
        id,
        'line-width',
        mode === 'surface' ? streetSurfaceOnlyWidthExpression : streetSurfaceWidthExpression,
      );
    }
    // La capa de clic sigue las calles visibles.
    if (map.getLayer('street-score-hit')) {
      map.setFilter('street-score-hit', classFilter as unknown as FilterSpecification);
    }
  }, [
    map,
    mode,
    levelKey,
    levels,
    roadClassKey,
    roadClasses,
    surfaceTypeKey,
    surfaceTypes,
    surfaceConditionKey,
    surfaceConditions,
    surfaceTreatmentKey,
    surfaceTreatments,
  ]);

  // Clic y cursor sobre las calles.
  useEffect(() => {
    const onClick = (event: {
      point: { x: number; y: number };
      lngLat: { lat: number; lng: number };
    }) => {
      // Si se tocó una marca (reductor u obra), el popup es el de la marca.
      const marks = ['map-features-calming', 'map-features-works'].filter((id) => map.getLayer(id));
      if (
        marks.length > 0 &&
        map.queryRenderedFeatures([event.point.x, event.point.y] as unknown as [number, number], {
          layers: marks,
        }).length > 0
      )
        return;
      const hits = map.queryRenderedFeatures(
        [event.point.x, event.point.y] as unknown as [number, number],
        { layers: ['street-score-hit'] },
      );
      const street = hits[0]?.properties as StreetTileProperties | undefined;
      if (!street?.id) return;
      if (selectingRef.current) {
        setSelected(null);
        onSelectedRef.current({
          id: street.id,
          streetName: street.n,
          lengthMeters: typeof street.len === 'number' ? street.len : null,
        });
      } else setSelected({ street, position: [event.lngLat.lat, event.lngLat.lng] });
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

  return selected ? (
    <MapPopup position={selected.position} onClose={() => setSelected(null)}>
      <StreetPopup
        street={selected.street}
        onViewReports={(streetId, streetName) => {
          onViewStreetReports(streetId, streetName);
          setSelected(null);
          focusMap(map, selected.position[0], selected.position[1]);
        }}
      />
    </MapPopup>
  ) : null;
}
