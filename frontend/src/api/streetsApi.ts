import type { ViewportBounds } from './reportTypes.js';
import type { StreetConditionFeatureCollection, StreetScoreResultDto } from './streetScoreTypes.js';
import { STREET_CONDITION_LEVELS } from '../components/map/streetConditionCatalog.js';
import type { StreetRoadClass } from './streetScoreTypes.js';
import { API_BASE_URL } from './apiBaseUrl.js';

export interface OfficialMobilityInfrastructure {
  id: string;
  type: 'BIKE_LANE' | 'METROBUS_CORRIDOR' | 'METROBUS_STOP';
  name: string;
  details: Record<string, unknown>;
  source: { name: string; url: string; lastSuccessfulSync: string | null };
}

export async function getStreetInfrastructure(
  streetId: string,
  signal?: AbortSignal,
): Promise<OfficialMobilityInfrastructure[]> {
  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/streets/${encodeURIComponent(streetId)}/infrastructure`,
      { headers: { Accept: 'application/json' }, signal },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new StreetsApiError('No se pudo consultar la infraestructura oficial.');
  }
  if (!response.ok) throw new StreetsApiError('No pudimos cargar la infraestructura oficial.');
  const result: unknown = await response.json().catch(() => null);
  if (
    !Array.isArray(result) ||
    !result.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        ['BIKE_LANE', 'METROBUS_CORRIDOR', 'METROBUS_STOP'].includes(item.type) &&
        item.source &&
        typeof item.source.name === 'string' &&
        typeof item.source.url === 'string',
    )
  )
    throw new StreetsApiError('El servicio devolvió infraestructura inválida.');
  return result as OfficialMobilityInfrastructure[];
}

export class StreetsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreetsApiError';
  }
}

function isScoreResult(value: unknown): value is StreetScoreResultDto {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<StreetScoreResultDto>;
  return (
    typeof result.id === 'string' &&
    (result.hasEvidence === false
      ? result.score === null && result.level === null
      : typeof result.score === 'number' &&
        result.score >= 0 &&
        result.score <= 100 &&
        STREET_CONDITION_LEVELS.some(({ value }) => value === result.level)) &&
    ['LOW', 'MEDIUM', 'HIGH'].includes(result.confidence ?? '') &&
    !!result.sourceStatus &&
    typeof result.hasEvidence === 'boolean' &&
    !!result.availability &&
    ['AVAILABLE', 'UNAVAILABLE'].includes(result.sourceStatus.officialIncidents) &&
    ['AVAILABLE', 'UNAVAILABLE'].includes(result.sourceStatus.traffic) &&
    typeof result.calculatedAt === 'string' &&
    Array.isArray(result.factors) &&
    result.factors.every(
      (factor) =>
        typeof factor.code === 'string' &&
        typeof factor.label === 'string' &&
        typeof factor.detail === 'string' &&
        typeof factor.impact === 'number' &&
        ['COMMUNITY', 'OFFICIAL', 'SYSTEM'].includes(factor.source),
    ) &&
    !!result.metrics &&
    typeof result.metrics.activeReports === 'number'
  );
}

export async function getStreetScore(
  streetId: string,
  signal?: AbortSignal,
): Promise<StreetScoreResultDto> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/streets/${encodeURIComponent(streetId)}/score`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new StreetsApiError('No se pudo consultar el estado estimado de la calle.');
  }
  if (!response.ok) throw new StreetsApiError('No pudimos actualizar el Street Score.');
  const body: unknown = await response.json().catch(() => null);
  if (!isScoreResult(body))
    throw new StreetsApiError('El servicio devolvió una explicación de score inválida.');
  return body;
}

export async function getStreetConditionInViewport(
  bounds: ViewportBounds,
  zoom: number,
  levels: string[] | null,
  roadClasses: StreetRoadClass[],
  signal: AbortSignal,
): Promise<StreetConditionFeatureCollection> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(bounds)) query.set(key, value.toFixed(5));
  query.set('zoom', String(Math.floor(zoom)));
  if (levels !== null) query.set('levels', levels.length ? levels.join(',') : 'NONE');
  query.set(
    'roadClasses',
    roadClasses.filter((roadClass) => roadClass !== 'UNKNOWN').join(',') || 'NONE',
  );

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/streets/condition?${query.toString()}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new StreetsApiError('No se pudo conectar con el servicio de Street Score.');
  }
  if (!response.ok) throw new StreetsApiError('No pudimos actualizar los Street Scores.');

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new StreetsApiError('El servicio devolvió una respuesta inválida.');
  }
  if (
    !result ||
    typeof result !== 'object' ||
    (result as { type?: unknown }).type !== 'FeatureCollection' ||
    !Array.isArray((result as { features?: unknown }).features)
  )
    throw new StreetsApiError('El servicio devolvió una respuesta inválida.');
  return result as StreetConditionFeatureCollection;
}
