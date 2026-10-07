import { useCallback, useEffect, useState } from 'react';
import { getMyReports, submitReportFeedback } from '../../api/reportsApi.js';
import type { OwnedReportDto } from '../../api/reportTypes.js';
import { REPORT_TYPE_OPTIONS } from '../../api/reportCatalog.js';

const typeLabels = Object.fromEntries(REPORT_TYPE_OPTIONS.map((item) => [item.value, item.label]));
const severityLabels = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' };
const statusLabels = { ACTIVE: 'Activo', STALE: 'Antiguo', RESOLVED: 'Resuelto' };

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Argentina/Buenos_Aires',
      }).format(date);
}

export function MyReports({
  onViewMap,
  onCreateReport,
}: {
  onViewMap: (report: OwnedReportDto) => void;
  onCreateReport: () => void;
}) {
  const [items, setItems] = useState<OwnedReportDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [voteError, setVoteError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const page = await getMyReports(50, 0, signal);
      if (!signal?.aborted) {
        setItems(page.items);
        setHasMore(page.hasMore);
      }
    } catch (cause) {
      if (!signal?.aborted)
        setError(cause instanceof Error ? cause.message : 'No pudimos cargar tus reportes.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await getMyReports(50, items.length);
      setItems((current) => [...current, ...page.items]);
      setHasMore(page.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos cargar más reportes.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function vote(report: OwnedReportDto, type: 'CONFIRM' | 'RESOLVED') {
    setVoteBusy(report.id);
    setVoteError('');
    try {
      const updated = await submitReportFeedback(report.id, type);
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
    } catch (cause) {
      setVoteError(cause instanceof Error ? cause.message : 'No pudimos actualizar la respuesta.');
    } finally {
      setVoteBusy(null);
    }
  }

  return (
    <main className="my-reports-page">
      <div className="my-reports-heading">
        <div>
          <span>MIS CONTRIBUCIONES</span>
          <h1>Mis reportes</h1>
          <p>Consultá el estado y la actividad de los problemas que reportaste.</p>
        </div>
        <button type="button" onClick={onCreateReport}>
          + Crear un reporte
        </button>
      </div>
      {loading && <p role="status">Cargando tus reportes…</p>}
      {error && (
        <div className="my-reports-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <section className="my-reports-empty">
          <span aria-hidden="true">📍</span>
          <h2>Todavía no realizaste ningún reporte.</h2>
          <p>Tu primer reporte ayudará a otras personas a circular por CABA.</p>
          <button type="button" onClick={onCreateReport}>
            Crear un reporte
          </button>
        </section>
      )}
      {voteError && (
        <p className="my-reports-error" role="alert">
          {voteError}
        </p>
      )}
      {items.length > 0 && (
        <div className="my-reports-list">
          {items.map((report) => (
            <article className="my-report-card" key={report.id}>
              <header>
                <div>
                  <span className="my-report-card__type">{typeLabels[report.type]}</span>
                  <h2>{report.street?.officialName ?? 'Ubicación reportada'}</h2>
                </div>
                <span
                  className={`my-report-card__status my-report-card__status--${report.status.toLowerCase()}`}
                >
                  {statusLabels[report.status]}
                </span>
              </header>
              <p className="my-report-card__meta">
                Creado {formatDate(report.createdAt)} · Severidad: {severityLabels[report.severity]}
              </p>
              <p className="my-report-card__activity">
                {report.feedback.confirmations} confirmaciones · {report.feedbackCount} respuestas ·
                Última actividad: {formatDate(report.latestActivityAt)}
              </p>
              {!report.publiclyVisible && (
                <p className="my-report-card__private">
                  Este reporte no aparece en el mapa público.
                </p>
              )}
              <details>
                <summary>Ver detalle</summary>
                <div>
                  <p>{report.description || 'Sin descripción.'}</p>
                  <p>
                    Ubicación: {report.location.latitude.toFixed(5)},{' '}
                    {report.location.longitude.toFixed(5)}
                  </p>
                  <p>Última actualización: {formatDate(report.updatedAt)}</p>
                </div>
              </details>
              <footer>
                <button type="button" onClick={() => onViewMap(report)}>
                  Ver en mapa
                </button>
                <button
                  type="button"
                  disabled={!report.publiclyVisible || voteBusy === report.id}
                  aria-pressed={report.feedback.userFeedback === 'CONFIRM'}
                  onClick={() => void vote(report, 'CONFIRM')}
                >
                  👍 {report.feedback.confirmations}
                </button>
                <button
                  type="button"
                  disabled={!report.publiclyVisible || voteBusy === report.id}
                  aria-pressed={report.feedback.userFeedback === 'RESOLVED'}
                  onClick={() => void vote(report, 'RESOLVED')}
                >
                  👎 {report.feedback.resolvedReports}
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
      {hasMore && (
        <button
          className="my-reports-load-more"
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
    </main>
  );
}
