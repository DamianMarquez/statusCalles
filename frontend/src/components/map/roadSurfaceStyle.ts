import {
  SURFACE_TYPE_OPTIONS,
  type SurfaceCondition,
  type SurfaceType,
} from '../../api/roadInformationTypes.js';

export function surfaceConditionDashArray(condition: SurfaceCondition | null): string {
  switch (condition) {
    case 'GOOD':
      return '';
    case 'REGULAR':
      return '8 4';
    case 'POOR':
      return '4 3';
    case 'VERY_POOR':
      return '1 3';
    default:
      return '2 4';
  }
}

export function roadSurfaceLineStyle(
  surfaceType: SurfaceType | null,
  zoom: number,
  condition: SurfaceCondition | null,
) {
  const surface = SURFACE_TYPE_OPTIONS.find((item) => item.value === surfaceType);
  const dashArray = surfaceConditionDashArray(condition);
  return {
    color: surface?.color ?? '#7b8490',
    weight: zoom >= 17 ? 6 : 4.5,
    opacity: 0.9,
    ...(dashArray ? { dashArray } : {}),
  };
}

/** Patrón de guiones para MapLibre (múltiplos del ancho de línea); null = línea continua. */
export function surfaceConditionDashPattern(condition: SurfaceCondition | null): number[] | null {
  switch (condition) {
    case 'GOOD':
      return null;
    case 'REGULAR':
      return [2, 1];
    case 'POOR':
      return [1, 0.8];
    case 'VERY_POOR':
      return [0.2, 1.2];
    default:
      return [0.5, 1];
  }
}
