import type {
  ReportDto,
  CreateReportInput,
  ReportSeverity,
  ReportStatus,
  ReportType,
  ReportFeedbackType,
  ViewportBounds,
  MapReportFilters,
  ReportPageDto,
} from './reportTypes.js';

import { API_BASE_URL } from './apiBaseUrl.js';
import {
  REPORT_SEVERITY_OPTIONS,
  REPORT_STATUS_OPTIONS,
  REPORT_TYPE_OPTIONS,
} from './reportCatalog.js';
import type { OwnedReportPageDto } from './reportTypes.js';
const reportTypes = REPORT_TYPE_OPTIONS.map((item) => item.value) as ReportType[];
const reportSeverities = REPORT_SEVERITY_OPTIONS.map((item) => item.value) as ReportSeverity[];
const reportStatuses = REPORT_STATUS_OPTIONS.map((item) => item.value) as ReportStatus[];

export class ReportsApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ReportsApiError';
  }
}

function isReportDto(value: unknown): value is ReportDto {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<ReportDto>;
  return (
    typeof report.id === 'string' &&
    typeof report.type === 'string' &&
    reportTypes.includes(report.type as ReportType) &&
    typeof report.severity === 'string' &&
    reportSeverities.includes(report.severity as ReportSeverity) &&
    typeof report.description === 'string' &&
    typeof report.location?.latitude === 'number' &&
    typeof report.location?.longitude === 'number' &&
    typeof report.status === 'string' &&
    reportStatuses.includes(report.status as ReportStatus) &&
    typeof report.createdAt === 'string' &&
    typeof report.updatedAt === 'string' &&
    (report.publiclyVisible === undefined || typeof report.publiclyVisible === 'boolean') &&
    (report.street === undefined ||
      report.street === null ||
      (typeof report.street.id === 'string' &&
        typeof report.street.officialName === 'string' &&
        (report.street.neighborhoodName === null ||
          typeof report.street.neighborhoodName === 'string') &&
        (report.street.communeName === null || typeof report.street.communeName === 'string'))) &&
    typeof report.feedback?.confirmations === 'number' &&
    typeof report.feedback?.resolvedReports === 'number' &&
    (report.feedback.userFeedback === null ||
      report.feedback.userFeedback === 'CONFIRM' ||
      report.feedback.userFeedback === 'RESOLVED') &&
    typeof report.freshness?.level === 'string' &&
    ['FRESH', 'AGING', 'STALE', 'RESOLVED'].includes(report.freshness.level) &&
    typeof report.freshness.confidence === 'number' &&
    typeof report.freshness.lastActivityAt === 'string' &&
    typeof report.freshness.evaluatedAt === 'string'
  );
}

function isOwnedReportDto(value: unknown): boolean {
  return (
    isReportDto(value) &&
    'publiclyVisible' in value &&
    typeof value.publiclyVisible === 'boolean' &&
    'feedbackCount' in value &&
    typeof value.feedbackCount === 'number' &&
    'latestActivityAt' in value &&
    typeof value.latestActivityAt === 'string'
  );
}

export async function getReportsInViewport(
  bounds: ViewportBounds,
  filters: MapReportFilters,
  signal: AbortSignal,
): Promise<ReportPageDto> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(bounds)) {
    query.set(key, value.toFixed(5));
  }
  if (filters.types) query.set('types', filters.types.length ? filters.types.join(',') : 'NONE');
  if (filters.statuses)
    query.set('statuses', filters.statuses.length ? filters.statuses.join(',') : 'NONE');
  if (filters.period) query.set('period', filters.period);
  if (filters.fromDate) query.set('fromDate', filters.fromDate);
  if (filters.toDate) query.set('toDate', filters.toDate);
  if (filters.minSeverity) query.set('minSeverity', filters.minSeverity);
  if (filters.onlyMine) query.set('onlyMine', 'true');

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/reports?${query.toString()}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ReportsApiError('No se pudo conectar con el servicio de reportes.');
  }

  if (!response.ok) {
    throw new ReportsApiError('El servicio de reportes no pudo completar la solicitud.');
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ReportsApiError('El servicio devolvió una respuesta inválida.');
  }

  if (
    !result ||
    typeof result !== 'object' ||
    !('items' in result) ||
    !Array.isArray(result.items) ||
    !result.items.every(isReportDto) ||
    !('hasMore' in result) ||
    typeof result.hasMore !== 'boolean'
  ) {
    throw new ReportsApiError('El servicio devolvió reportes con un formato inválido.');
  }

  return result as ReportPageDto;
}

export async function getMyReports(
  limit = 50,
  offset = 0,
  signal?: AbortSignal,
): Promise<OwnedReportPageDto> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/users/me/reports?limit=${limit}&offset=${offset}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ReportsApiError('No se pudo conectar con el servicio de reportes.');
  }
  if (response.status === 401) throw new ReportsApiError('Iniciá sesión para ver tus reportes.');
  if (!response.ok) throw new ReportsApiError('No pudimos cargar tus reportes.');
  const result: unknown = await response.json().catch(() => null);
  if (
    !result ||
    typeof result !== 'object' ||
    !('items' in result) ||
    !Array.isArray(result.items) ||
    !('hasMore' in result) ||
    typeof result.hasMore !== 'boolean' ||
    !result.items.every(isOwnedReportDto)
  ) {
    throw new ReportsApiError('El servicio devolvió reportes con un formato inválido.');
  }
  return result as OwnedReportPageDto;
}

export async function createReport(
  input: CreateReportInput,
  allowSimilar = false,
): Promise<ReportDto> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/reports`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ ...input, ...(allowSimilar ? { allowSimilar: true } : {}) }),
    });
  } catch {
    throw new ReportsApiError('No se pudo conectar con el servicio de reportes.');
  }

  if (!response.ok) {
    if (response.status === 409) {
      throw new ReportsApiError(
        'Ya existe un reporte similar cerca de esta ubicación.',
        'SIMILAR_REPORT_EXISTS',
      );
    }
    if (response.status === 400) {
      throw new ReportsApiError('Revisá el tipo, la severidad y la ubicación del reporte.');
    }
    throw new ReportsApiError('No pudimos enviar el reporte. Intentá de nuevo.');
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ReportsApiError('El servicio devolvió una respuesta inválida.');
  }

  if (!isReportDto(result)) {
    throw new ReportsApiError('El servicio devolvió un reporte con un formato inválido.');
  }

  return result;
}

export async function submitReportFeedback(
  reportId: string,
  type: ReportFeedbackType,
): Promise<ReportDto> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/reports/${encodeURIComponent(reportId)}/feedback`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type }),
      credentials: 'include',
    });
  } catch {
    throw new ReportsApiError('No se pudo conectar con el servicio de reportes.');
  }

  if (response.status === 404) throw new ReportsApiError('Este reporte ya no está disponible.');
  if (response.status === 401) throw new ReportsApiError('Iniciá sesión para confirmar reportes.');
  if (response.status === 400) throw new ReportsApiError('No pudimos registrar tu respuesta.');
  if (!response.ok)
    throw new ReportsApiError('No pudimos registrar tu respuesta. Intentá de nuevo.');

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ReportsApiError('El servicio devolvió una respuesta inválida.');
  }

  if (!isReportDto(result)) {
    throw new ReportsApiError('El servicio devolvió una respuesta inválida.');
  }
  return result;
}
