import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type FilterSpecification,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import { getStreetConditionInViewport } from '../api/streetsApi.js';
import { getReportsInViewport } from '../api/reportsApi.js';
import type { ReportDto, ViewportBounds } from '../api/reportTypes.js';
import { STREET_CONDITION_LEVELS } from '../components/map/streetConditionCatalog.js';
import {
  labMapConfig,
  levelColorExpression,
  NO_DATA_COLOR,
  SCORE_RAMP_STOPS,
  scoreColorExpression,
  SEVERITY_COLORS,
} from './labConfig.js';
import {
  createDrawController,
  EMPTY_COLLECTION,
  loadDrawings,
  saveDrawings,
  type DrawMode,
  type DrawnFeature,
} from './drawTools.js';

const NO_DATA = 'NO_DATA';

type Measure = 'general' | 'potholes' | 'reports';

const MEASURES: { value: Measure; label: string }[] = [
  { value: 'general', label: 'Estado general' },
  { value: 'potholes', label: 'Baches' },
  { value: 'reports', label: 'Todos los reportes' },
];

const DRAW_MODES: { value: DrawMode; label: string }[] = [
  { value: 'none', label: 'Navegar' },
  { value: 'point', label: 'Marca' },
  { value: 'linestring', label: 'Línea' },
  { value: 'polygon', label: 'Zona' },
];

function viewportBounds(map: MapLibreMap): ViewportBounds {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast(),
  };
}

function reportsToGeoJson(reports: ReportDto[], onlyPotholes: boolean): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: reports
      .filter((report) => !onlyPotholes || report.type === 'POTHOLE')
      .map((report) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [report.location.longitude, report.location.latitude],
        },
        properties: { id: report.id, type: report.type, severity: report.severity },
      })),
  };
}

export default function MapLabView() {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<ReturnType<typeof createDrawController> | null>(null);
  const drawLevelRef = useRef('GOOD');

  const [ready, setReady] = useState(false);
  const [measures, setMeasures] = useState<Measure[]>(['general']);
  const [levels, setLevels] = useState<string[]>([
    ...STREET_CONDITION_LEVELS.map((l) => l.value),
    NO_DATA,
  ]);
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [drawLevel, setDrawLevel] = useState('GOOD');
  const [drawings, setDrawings] = useState<DrawnFeature[]>(() => loadDrawings());
  const [status, setStatus] = useState('');
  const reportsRef = useRef<ReportDto[]>([]);

  useEffect(() => {
    drawLevelRef.current = drawLevel;
  }, [drawLevel]);

  // Inicializa el mapa una sola vez.
  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: labMapConfig.style,
      center: labMapConfig.center,
      zoom: labMapConfig.zoom,
      minZoom: labMapConfig.minZoom,
      maxZoom: labMapConfig.maxZoom,
      maxBounds: labMapConfig.maxBounds,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __labMap?: MapLibreMap }).__labMap = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      map.addSource('streets', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addLayer({
        id: 'streets-condition',
        type: 'line',
        source: 'streets',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': scoreColorExpression,
          'line-opacity': 0.92,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 4, 19, 8],
        },
      });
      map.addLayer({
        id: 'streets-blocked',
        type: 'line',
        source: 'streets',
        filter: ['==', ['get', 'availabilityStatus'], 'BLOCKED'],
        paint: { 'line-color': '#222', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      });

      map.addSource('reports', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addLayer({
        id: 'reports-circles',
        type: 'circle',
        source: 'reports',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 17, 9],
          'circle-color': SEVERITY_COLORS,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      });

      map.addSource('drawings', { type: 'geojson', data: EMPTY_COLLECTION });
      map.addLayer({
        id: 'drawings-fill',
        type: 'fill',
        source: 'drawings',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': levelColorExpression, 'fill-opacity': 0.35 },
      });
      map.addLayer({
        id: 'drawings-line',
        type: 'line',
        source: 'drawings',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': levelColorExpression, 'line-width': 5 },
      });
      map.addLayer({
        id: 'drawings-point',
        type: 'circle',
        source: 'drawings',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 9,
          'circle-color': levelColorExpression,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });

      map.on('click', 'streets-condition', (event) => {
        const props = event.features?.[0]?.properties;
        if (!props) return;
        const box = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = String(props.streetName ?? 'Calle');
        const detail = document.createElement('div');
        detail.textContent = props.hasEvidence
          ? `Puntaje ${props.score} · ${props.reportCount} reporte(s) activo(s) · confianza ${props.confidence ?? '-'}`
          : 'Sin datos todavía';
        box.append(title, detail);
        new Popup({ closeButton: true }).setLngLat(event.lngLat).setDOMContent(box).addTo(map);
      });
      map.on('mouseenter', 'streets-condition', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'streets-condition', () => {
        map.getCanvas().style.cursor = '';
      });

      drawRef.current = createDrawController(map, (geometry) => {
        setDrawings((current) => [
          ...current,
          { type: 'Feature', geometry, properties: { level: drawLevelRef.current, note: '' } },
        ]);
      });
      setReady(true);
    });

    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Carga de calles y reportes por viewport (debounce).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let timer: number | undefined;
    let controller: AbortController | undefined;

    const load = () => {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      const bounds = viewportBounds(map);
      setStatus('Cargando…');
      void Promise.allSettled([
        getStreetConditionInViewport(
          bounds,
          map.getZoom(),
          null,
          ['PRIMARY', 'SECONDARY', 'LOCAL'],
          signal,
        ),
        getReportsInViewport(bounds, {}, signal),
      ]).then(([streets, reports]) => {
        if (signal.aborted) return;
        if (streets.status === 'fulfilled') {
          const data: FeatureCollection = {
            type: 'FeatureCollection',
            features: streets.value.features.map((feature) => ({
              type: 'Feature' as const,
              geometry: feature.geometry,
              properties: {
                level: feature.properties.level,
                score: feature.properties.score,
                hasEvidence: feature.properties.hasEvidence === true,
                confidence: feature.properties.confidence,
                roadClass: feature.properties.roadClass,
                reportCount: feature.properties.metrics?.activeReports ?? 0,
                streetName: feature.properties.streetName,
                availabilityStatus: feature.properties.availability?.status ?? null,
              },
            })),
          } as FeatureCollection;
          (map.getSource('streets') as GeoJSONSource | undefined)?.setData(data);
        }
        if (reports.status === 'fulfilled') reportsRef.current = reports.value.items;
        applyReports(map, measures);
        const failed = streets.status === 'rejected' || reports.status === 'rejected';
        setStatus(failed ? 'Sin conexión con el backend (¿está levantado?)' : '');
      });
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 280);
    };

    map.on('moveend', schedule);
    load();
    return () => {
      window.clearTimeout(timer);
      controller?.abort();
      map.off('moveend', schedule);
    };
    // `measures` se aplica por separado abajo; no debe disparar nuevas descargas.
  }, [ready]);

  // Medición activa y filtros: solo cambian propiedades de las capas, sin recargar datos.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const generalVisible = measures.includes('general');
    const withData = levels.filter((value) => value !== NO_DATA);
    const levelFilter: FilterSpecification = [
      'any',
      ['in', ['get', 'level'], ['literal', withData]],
      ['all', ['!', ['to-boolean', ['get', 'level']]], levels.includes(NO_DATA)],
    ];
    map.setFilter('streets-condition', levelFilter);
    map.setLayoutProperty('streets-condition', 'visibility', generalVisible ? 'visible' : 'none');
    map.setLayoutProperty('streets-blocked', 'visibility', generalVisible ? 'visible' : 'none');
    applyReports(map, measures);
  }, [ready, measures, levels]);

  // Dibujos: a la fuente y a localStorage.
  const drawingCollection = useMemo<FeatureCollection>(
    () => ({ type: 'FeatureCollection', features: drawings }),
    [drawings],
  );
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('drawings') as GeoJSONSource | undefined)?.setData(drawingCollection);
    saveDrawings(drawings);
  }, [ready, drawingCollection, drawings]);

  useEffect(() => {
    drawRef.current?.setMode(drawMode);
  }, [ready, drawMode]);

  function applyReports(map: MapLibreMap, active: Measure[]) {
    const onlyPotholes = active.includes('potholes') && !active.includes('reports');
    const visible = active.includes('potholes') || active.includes('reports');
    (map.getSource('reports') as GeoJSONSource | undefined)?.setData(
      reportsToGeoJson(reportsRef.current, onlyPotholes),
    );
    if (map.getLayer('reports-circles'))
      map.setLayoutProperty('reports-circles', 'visibility', visible ? 'visible' : 'none');
  }

  function toggleMeasure(value: Measure) {
    setMeasures((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  function toggleLevel(value: string) {
    setLevels((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  return (
    <div className="lab-shell">
      <div ref={container} className="lab-map" data-testid="lab-map" />
      <aside className="lab-panel">
        <h2>Lab MapLibre</h2>
        {labMapConfig.usingFallbackStyle ? (
          <p className="lab-hint">
            Mapa base OSM raster. Definí VITE_MAP_STYLE_URL para probar un estilo vectorial.
          </p>
        ) : null}
        {status ? <p className="lab-hint">{status}</p> : null}

        <h3>Mediciones</h3>
        {MEASURES.map((measure) => (
          <label key={measure.value} className="lab-check">
            <input
              type="checkbox"
              checked={measures.includes(measure.value)}
              onChange={() => toggleMeasure(measure.value)}
            />
            {measure.label}
          </label>
        ))}

        <h3>Puntaje de la calle</h3>
        <div
          className="lab-ramp"
          style={{
            background: `linear-gradient(to right, ${SCORE_RAMP_STOPS.map(([score, color]) => `${color} ${score}%`).join(', ')})`,
          }}
        />
        <div className="lab-ramp-labels">
          <span>0 · crítico</span>
          <span>100 · excelente</span>
        </div>
        <label className="lab-check">
          <input
            type="checkbox"
            checked={levels.includes(NO_DATA)}
            onChange={() => toggleLevel(NO_DATA)}
          />
          <span className="lab-swatch" style={{ background: NO_DATA_COLOR }} />
          Sin datos (gris)
        </label>

        <h3>Filtrar por nivel</h3>
        {STREET_CONDITION_LEVELS.map((level) => (
          <label key={level.value} className="lab-check">
            <input
              type="checkbox"
              checked={levels.includes(level.value)}
              onChange={() => toggleLevel(level.value)}
            />
            {level.label} <span className="lab-hint">{level.range}</span>
          </label>
        ))}

        <h3>Dibujar</h3>
        <div className="lab-row">
          {DRAW_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={drawMode === mode.value ? 'lab-btn lab-btn--on' : 'lab-btn'}
              onClick={() => setDrawMode(mode.value)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <label className="lab-field">
          Estado de lo que dibujes
          <select value={drawLevel} onChange={(event) => setDrawLevel(event.target.value)}>
            {STREET_CONDITION_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </label>
        <p className="lab-hint">{drawings.length} dibujo(s) guardados en este navegador.</p>
        <button
          type="button"
          className="lab-btn"
          disabled={drawings.length === 0}
          onClick={() => setDrawings([])}
        >
          Borrar dibujos
        </button>
      </aside>
    </div>
  );
}
