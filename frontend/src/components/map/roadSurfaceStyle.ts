import { SURFACE_TYPE_OPTIONS, type SurfaceType } from '../../api/roadInformationTypes.js';

export function roadSurfaceLineStyle(
  surfaceType: SurfaceType,
  zoom: number,
  condition: string | null,
) {
  const surface = SURFACE_TYPE_OPTIONS.find((item) => item.value === surfaceType);
  const poorCondition = condition === 'POOR' || condition === 'VERY_POOR';
  return {
    color: surface?.color ?? '#65756b',
    weight: zoom >= 17 ? (poorCondition ? 7 : 5) : 3.5,
    opacity: 0.92,
    ...(surface?.dashArray ? { dashArray: surface.dashArray } : {}),
  };
}
