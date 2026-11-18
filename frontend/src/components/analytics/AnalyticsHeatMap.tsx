import { useEffect, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource } from 'maplibre-gl';
import type { AnalyticsHeatCell } from '../../api/analyticsApi.js';
import { MapCanvas, MapPopup, useMapInstance } from '../map/maplibre/mapLibre.js';

const SOURCE = 'analytics-heat';
const LAYER = 'analytics-heat-circles';

function HeatCells({ cells }: { cells: AnalyticsHeatCell[] }) {
  const map = useMapInstance();
  const [selected, setSelected] = useState<{
    cell: AnalyticsHeatCell;
    position: [number, number];
  } | null>(null);
  const cellsRef = useRef(cells);
  useEffect(() => {
    cellsRef.current = cells;
  });

  useEffect(() => {
    map.addSource(SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] } as FeatureCollection,
    });
    map.addLayer({
      id: LAYER,
      type: 'circle',
      source: SOURCE,
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': '#e66b45',
        'circle-opacity': 0.45,
        'circle-stroke-color': '#b74429',
        'circle-stroke-width': 1,
      },
    });
    const onClick = (event: { features?: { properties?: { index?: number } }[] }) => {
      const index = event.features?.[0]?.properties?.index;
      const cell = index === undefined ? undefined : cellsRef.current[index];
      if (cell) setSelected({ cell, position: [cell.latitude, cell.longitude] });
    };
    map.on('click', LAYER, onClick);
    return () => {
      map.off('click', LAYER, onClick);
      if (map.getLayer(LAYER)) map.removeLayer(LAYER);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map]);

  useEffect(() => {
    const data = {
      type: 'FeatureCollection',
      features: cells.map((cell, index) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [cell.longitude, cell.latitude] },
        properties: { index, radius: Math.min(22, 6 + Math.sqrt(cell.reports) * 3) },
      })),
    } as FeatureCollection;
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(data);
  }, [map, cells]);

  return selected ? (
    <MapPopup position={selected.position} onClose={() => setSelected(null)}>
      {selected.cell.reports} reportes · {selected.cell.high_severity} de alta severidad
    </MapPopup>
  ) : null;
}

export function AnalyticsHeatMap({ cells }: { cells: AnalyticsHeatCell[] }) {
  return (
    <MapCanvas
      className="analytics-heatmap__map"
      center={[-58.3816, -34.6037]}
      zoom={11}
      maxBounds={undefined}
      scrollZoom={false}
    >
      <HeatCells cells={cells} />
    </MapCanvas>
  );
}
