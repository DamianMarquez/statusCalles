import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource } from 'maplibre-gl';
import { getZones, type ZoneFeatureCollection, type ZoneLevel } from '../../api/zonesApi.js';
import { MapPopup, useMapInstance } from './maplibre/mapLibre.js';
import { ZonePopup } from './ZonePopup.js';
import { quintileBreaks, zoneColor, type ZoneMetric, type ZoneSelection } from './zoneColors.js';

export const ZONES_SOURCE = 'zones';
export const ZONES_FILL = 'zones-fill';
export const ZONES_LINE = 'zones-line';
export const ZONES_LABEL = 'zones-label';
const ZONE_LAYERS = [ZONES_FILL, ZONES_LINE, ZONES_LABEL];
/** Si se toca una calle o una marca, el popup es el de ellas y no el de la zona. */
const OTHER_CLICK_LAYERS = ['street-score-hit', 'map-features-calming', 'map-features-works'];

/**
 * Comunas o barrios pintados con un color general por zona. Van debajo de las calles y se
 * vuelven casi transparentes al acercarse, para no tapar lo que importa a escala de calle.
 */
export function ZonesLayer({
  selection,
  metric,
  interactive = true,
}: {
  selection: ZoneSelection;
  metric: ZoneMetric;
  interactive?: boolean;
}) {
  const map = useMapInstance();
  const level: ZoneLevel | null = selection === 'none' ? null : selection;
  const cache = useRef(new Map<ZoneLevel, ZoneFeatureCollection>());
  const [loaded, setLoaded] = useState<ZoneFeatureCollection | null>(null);
  const [selected, setSelected] = useState<{ id: number; position: [number, number] } | null>(null);
  const interactiveRef = useRef(interactive);
  const loadedRef = useRef<ZoneFeatureCollection | null>(null);
  useEffect(() => {
    interactiveRef.current = interactive;
    loadedRef.current = loaded;
  });

  // Fuente y capas: se crean una vez, debajo de las calles (que se montan después).
  useEffect(() => {
    const beforeId = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
    map.addSource(ZONES_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] } as FeatureCollection,
    });
    map.addLayer(
      {
        id: ZONES_FILL,
        type: 'fill',
        source: ZONES_SOURCE,
        layout: { visibility: 'none' },
        paint: {
          'fill-color': ['get', 'fillColor'],
          // Fuerte con el mapa lejos; casi transparente a escala de calle.
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            0.6,
            13,
            0.5,
            15,
            0.22,
            16,
            0.07,
          ],
        },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: ZONES_LINE,
        type: 'line',
        source: ZONES_SOURCE,
        layout: { visibility: 'none' },
        paint: {
          'line-color': '#3f5a49',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 15, 2],
          'line-opacity': 0.75,
        },
      },
      beforeId,
    );
    // Los nombres necesitan tipografías: el estilo de respaldo (OSM raster) no las trae.
    if (map.getStyle().glyphs) {
      map.addLayer({
        id: ZONES_LABEL,
        type: 'symbol',
        source: ZONES_SOURCE,
        maxzoom: 14.5,
        layout: {
          visibility: 'none',
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Noto Sans Bold'],
        },
        paint: { 'text-color': '#2a3d31', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      });
    }

    const onClick = (event: {
      point: { x: number; y: number };
      lngLat: { lat: number; lng: number };
    }) => {
      if (!interactiveRef.current) return;
      const point = [event.point.x, event.point.y] as unknown as [number, number];
      const others = OTHER_CLICK_LAYERS.filter((id) => map.getLayer(id));
      if (others.length > 0 && map.queryRenderedFeatures(point, { layers: others }).length > 0)
        return;
      const hit = map.queryRenderedFeatures(point, { layers: [ZONES_FILL] })[0];
      const id = Number(hit?.properties?.id);
      if (!hit || !Number.isFinite(id)) return;
      if (!loadedRef.current?.features.some((feature) => feature.properties.id === id)) return;
      setSelected({ id, position: [event.lngLat.lat, event.lngLat.lng] });
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
      for (const id of ZONE_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(ZONES_SOURCE)) map.removeSource(ZONES_SOURCE);
    };
  }, [map]);

  // Una carga por nivel: las zonas cambian con los datos, no con el movimiento del mapa.
  useEffect(() => {
    setSelected(null);
    if (!level) {
      setLoaded(null);
      return;
    }
    const cached = cache.current.get(level);
    if (cached) {
      setLoaded(cached);
      return;
    }
    const controller = new AbortController();
    getZones(level, controller.signal)
      .then((collection) => {
        cache.current.set(level, collection);
        setLoaded(collection);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded(null);
      });
    return () => controller.abort();
  }, [level]);

  // El color depende de la métrica: se recalcula sin volver a pedir datos.
  const colored = useMemo<FeatureCollection | null>(() => {
    if (!loaded) return null;
    const breaks = quintileBreaks(
      loaded.features.map((feature) => feature.properties.intervention.index),
    );
    return {
      type: 'FeatureCollection',
      features: loaded.features.map((feature) => ({
        type: 'Feature',
        id: feature.id,
        geometry: feature.geometry,
        properties: {
          id: feature.properties.id,
          name: feature.properties.name,
          fillColor: zoneColor(feature.properties, metric, breaks),
        },
      })),
    } as FeatureCollection;
  }, [loaded, metric]);

  useEffect(() => {
    (map.getSource(ZONES_SOURCE) as GeoJSONSource | undefined)?.setData(
      colored ?? ({ type: 'FeatureCollection', features: [] } as FeatureCollection),
    );
    const visible = level !== null && colored !== null;
    for (const id of ZONE_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }, [map, colored, level]);

  const zone = selected
    ? loaded?.features.find((feature) => feature.properties.id === selected.id)?.properties
    : undefined;
  return selected && zone ? (
    <MapPopup position={selected.position} onClose={() => setSelected(null)}>
      <ZonePopup zone={zone} metric={metric} />
    </MapPopup>
  ) : null;
}
