import type {
  ReportDto,
  CreateReportInput,
  ReportSeverity,
  ReportStatus,
  ReportType,
  ReportFeedbackType,
  ViewportBounds,
} from './reportTypes.js';

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const reportTypes: ReportType[] = [
  'POTHOLE',
  'FLOOD',
  'ROAD_DAMAGE',
  'ROAD_BLOCKED',
  'ROAD_WORK',
  'TRAFFIC_LIGHT',
  'OTHER',
];
const reportSeverities: ReportSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const reportStatuses: ReportStatus[] = ['ACTIVE', 'STALE', 'RESOLVED'];

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

export async function getReportsInViewport(
  bounds: ViewportBounds,
  signal: AbortSignal,
): Promise<ReportDto[]> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(bounds)) {
    query.set(key, value.toFixed(5));
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/reports?${query.toString()}`, {
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

  if (!Array.isArray(result) || !result.every(isReportDto)) {
    throw new ReportsApiError('El servicio devolvió reportes con un formato inválido.');
  }

  return result;
}

export async function createReport(
  input: CreateReportInput,
  allowSimilar = false,
): Promise<ReportDto> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/reports`, {
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
    response = await fetch(`${apiBaseUrl}/api/reports/${encodeURIComponent(reportId)}/feedback`, {
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
