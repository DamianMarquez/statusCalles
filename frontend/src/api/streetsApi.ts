import type { ViewportBounds } from './reportTypes.js';
import type { StreetScoreAreaDto, StreetScoreResultDto } from './streetScoreTypes.js';

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

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
      `${apiBaseUrl}/api/streets/${encodeURIComponent(streetId)}/infrastructure`,
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
    typeof result.score === 'number' &&
    result.score >= 0 &&
    result.score <= 100 &&
    ['GOOD', 'FAIR', 'BAD', 'VERY_BAD', 'IMPASSABLE'].includes(result.level ?? '') &&
    ['LOW', 'MEDIUM', 'HIGH'].includes(result.confidence ?? '') &&
    !!result.sourceStatus &&
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
    response = await fetch(`${apiBaseUrl}/api/streets/${encodeURIComponent(streetId)}/score`, {
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

function isStreetScoreArea(value: unknown): value is StreetScoreAreaDto {
  if (!value || typeof value !== 'object') return false;
  const area = value as Partial<StreetScoreAreaDto>;
  return (
    typeof area.id === 'string' &&
    typeof area.score === 'number' &&
    area.score >= 0 &&
    area.score <= 100 &&
    (area.condition === 'IMPASSABLE' ||
      area.condition === 'VERY_BAD' ||
      area.condition === 'BAD' ||
      area.condition === 'FAIR' ||
      area.condition === 'GOOD') &&
    (area.confidence === 'LOW' || area.confidence === 'MEDIUM' || area.confidence === 'HIGH') &&
    !!area.sourceStatus &&
    Array.isArray(area.factors) &&
    typeof area.bounds?.south === 'number' &&
    typeof area.bounds?.north === 'number' &&
    typeof area.bounds?.west === 'number' &&
    typeof area.bounds?.east === 'number' &&
    typeof area.center?.latitude === 'number' &&
    typeof area.center?.longitude === 'number' &&
    typeof area.reasons?.activeReports === 'number' &&
    typeof area.reasons?.highSeverityReports === 'number' &&
    typeof area.reasons?.confirmations === 'number' &&
    typeof area.reasons?.resolvedReports === 'number' &&
    typeof area.reasons?.latestReportAt === 'string'
  );
}

export async function getStreetScoresInViewport(
  bounds: ViewportBounds,
  signal: AbortSignal,
): Promise<StreetScoreAreaDto[]> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(bounds)) query.set(key, value.toFixed(5));

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/streets/score?${query.toString()}`, {
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
  if (!Array.isArray(result) || !result.every(isStreetScoreArea))
    throw new StreetsApiError('El servicio devolvió una respuesta inválida.');
  return result;
}
