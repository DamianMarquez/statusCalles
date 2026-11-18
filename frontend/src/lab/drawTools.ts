import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  TerraDraw,
  TerraDrawFreehandLineStringMode,
  TerraDrawFreehandMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { smoothGeometry } from './smooth.js';

export type DrawMode =
  'none' | 'point' | 'linestring' | 'polygon' | 'freehand-linestring' | 'freehand';

export interface DrawnProperties {
  level: string;
  note: string;
}

export type DrawnFeature = Feature<Geometry, DrawnProperties>;

/**
 * Terra Draw solo captura el gesto. Al terminar, la forma se mueve a nuestra propia fuente
 * para colorearla por estado con expresiones de datos.
 */
export function createDrawController(map: MapLibreMap, onFinish: (geometry: Geometry) => void) {
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawPointMode(),
      new TerraDrawLineStringMode(),
      new TerraDrawPolygonMode(),
      new TerraDrawFreehandLineStringMode(),
      new TerraDrawFreehandMode(),
    ],
  });
  draw.start();
  draw.on('finish', (id) => {
    const feature = draw.getSnapshot().find((candidate) => candidate.id === id);
    if (!feature) return;
    onFinish(smoothGeometry(feature.geometry as Geometry));
    draw.removeFeatures([id]);
  });
  return {
    setMode(mode: DrawMode) {
      if (mode === 'none') draw.setMode('static');
      else draw.setMode(mode);
    },
    stop() {
      draw.stop();
    },
  };
}

export const EMPTY_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };

const STORAGE_KEY = 'street-status-lab-drawings';

export function loadDrawings(): DrawnFeature[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as DrawnFeature[]) : [];
  } catch {
    return [];
  }
}

export function saveDrawings(features: DrawnFeature[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(features));
  } catch {
    // Almacenamiento no disponible: el prototipo sigue funcionando en memoria.
  }
}
