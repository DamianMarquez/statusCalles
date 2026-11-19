import { useEffect, useRef, useState } from 'react';
import type { ExpressionSpecification, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { getMapFeatures, type MapFeatureProperties } from '../../api/mapFeaturesApi.js';
import { MapFeaturePopup } from './MapFeaturePopup.js';
import { CALMING_TYPES, PUBLIC_WORK_COLOR, type MapCategory } from './mapCategories.js';
import { MapPopup, useMapInstance } from './maplibre/mapLibre.js';

export const MAP_FEATURES_SOURCE = 'map-features';
export const CALMING_LAYER = 'map-features-calming';
export const WORKS_LAYER = 'map-features-works';
export const MAP_FEATURE_LAYERS = [CALMING_LAYER, WORKS_LAYER];

const calmingColor = [
  'match',
  ['get', 'type'],
  ...CALMING_TYPES.flatMap((item) => [item.value, item.color]),
  '#7b3fb0',
] as unknown as ExpressionSpecification;

/** Reductores de velocidad (OpenStreetMap) y obras públicas (BA Obras) como puntos sobre las calles. */
export function MapFeaturesLayer({ categories }: { categories: MapCategory[] }) {
  const map = useMapInstance();
  const [selected, setSelected] = useState<{
    feature: MapFeatureProperties;
    position: [number, number];
  } | null>(null);
  const requested = useRef(false);
  const showCalming = categories.includes('calming');
  const showWorks = categories.includes('works');

  // Fuente y capas: se crean una vez, debajo de las etiquetas del mapa base.
  useEffect(() => {
    const beforeId = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
    map.addSource(MAP_FEATURES_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] } as FeatureCollection,
    });
    map.addLayer(
      {
        id: CALMING_LAYER,
        type: 'circle',
        source: MAP_FEATURES_SOURCE,
        filter: ['in', ['get', 'type'], ['literal', CALMING_TYPES.map((item) => item.value)]],
        paint: {
          'circle-color': calmingColor,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 14, 4.5, 17, 8],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 16, 1.5],
        },
      },
      beforeId,
    );
    map.addLayer(
      {
        id: WORKS_LAYER,
        type: 'circle',
        source: MAP_FEATURES_SOURCE,
        filter: ['==', ['get', 'type'], 'PUBLIC_WORK'],
        paint: {
          'circle-color': PUBLIC_WORK_COLOR,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 14, 7, 17, 11],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      },
      beforeId,
    );

    const onClick = (event: {
      point: { x: number; y: number };
      lngLat: { lat: number; lng: number };
    }) => {
      const layers = MAP_FEATURE_LAYERS.filter((id) => map.getLayer(id));
      const hits = map.queryRenderedFeatures(
        [event.point.x, event.point.y] as unknown as [number, number],
        { layers },
      );
      const properties = hits[0]?.properties as MapFeatureProperties | undefined;
      if (properties)
        setSelected({ feature: properties, position: [event.lngLat.lat, event.lngLat.lng] });
    };
    const pointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const reset = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('click', onClick);
    for (const id of MAP_FEATURE_LAYERS) {
      map.on('mouseenter', id, pointer);
      map.on('mouseleave', id, reset);
    }
    return () => {
      map.off('click', onClick);
      for (const id of MAP_FEATURE_LAYERS) {
        map.off('mouseenter', id, pointer);
        map.off('mouseleave', id, reset);
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(MAP_FEATURES_SOURCE)) map.removeSource(MAP_FEATURES_SOURCE);
      reset();
    };
  }, [map]);

  // Los datos son de toda la ciudad y cambian por importación: se piden una sola vez.
  useEffect(() => {
    if ((!showCalming && !showWorks) || requested.current) return;
    requested.current = true;
    getMapFeatures()
      .then((collection) => {
        (map.getSource(MAP_FEATURES_SOURCE) as GeoJSONSource | undefined)?.setData(
          collection as unknown as FeatureCollection,
        );
      })
      .catch(() => {
        // Si falla, se vuelve a intentar la próxima vez que se active una categoría.
        requested.current = false;
      });
  }, [map, showCalming, showWorks]);

  useEffect(() => {
    if (map.getLayer(CALMING_LAYER))
      map.setLayoutProperty(CALMING_LAYER, 'visibility', showCalming ? 'visible' : 'none');
    if (map.getLayer(WORKS_LAYER))
      map.setLayoutProperty(WORKS_LAYER, 'visibility', showWorks ? 'visible' : 'none');
    if (!showCalming && !showWorks) setSelected(null);
  }, [map, showCalming, showWorks]);

  return selected ? (
    <MapPopup position={selected.position} onClose={() => setSelected(null)}>
      <MapFeaturePopup feature={selected.feature} />
    </MapPopup>
  ) : null;
}
