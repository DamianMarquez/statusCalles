import { useEffect, useState } from 'react';
import type { ReportDto, ReportFeedbackType } from '../../api/reportTypes.js';
import type { ReportFlagReason } from '../../api/reportsApi.js';
import { REPORT_TYPE_OPTIONS } from '../../api/reportCatalog.js';
import {
  getStreetInfrastructure,
  getStreetScore,
  type OfficialMobilityInfrastructure,
} from '../../api/streetsApi.js';
import type { StreetScoreResultDto } from '../../api/streetScoreTypes.js';

const reportTypeLabels = Object.fromEntries(
  REPORT_TYPE_OPTIONS.map((option) => [option.value, option.popupLabel]),
) as Record<ReportDto['type'], string>;

const severityLabels: Record<ReportDto['severity'], { icon: string; label: string }> = {
  LOW: { icon: '🟢', label: 'Baja' },
  MEDIUM: { icon: '🟡', label: 'Media' },
  HIGH: { icon: '🔴', label: 'Alta' },
  CRITICAL: { icon: '🆘', label: 'Crítica' },
};

const freshnessLabels: Record<ReportDto['freshness']['level'], { icon: string; label: string }> = {
  FRESH: { icon: '🟢', label: 'Reciente' },
  AGING: { icon: '🟡', label: 'Hace un tiempo' },
  STALE: { icon: '⚪', label: 'Antiguo' },
  RESOLVED: { icon: '🔴', label: 'Resuelto' },
};

function formatReportedAt(dateValue: string, now: number): string {
  const reportedAt = new Date(dateValue).getTime();
  if (!Number.isFinite(reportedAt)) return 'Fecha no disponible';

  const minutes = Math.floor(Math.max(0, now - reportedAt) / 60000);
  if (minutes === 0) return 'hace menos de un minuto';

  const relativeTime = new Intl.RelativeTimeFormat('es', { numeric: 'always' });
  if (minutes < 60) return relativeTime.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relativeTime.format(-hours, 'hour');
  return relativeTime.format(-Math.floor(hours / 24), 'day');
}

interface ReportMarkerPopupProps {
  report: ReportDto;
  onVote: (type: ReportFeedbackType) => void;
  isVoting: boolean;
  feedbackError: string | null;
  authenticated: boolean;
  onRequestLogin: () => void;
  popupOpen?: boolean;
  onFlag: (reason: ReportFlagReason) => void;
  flagBusy: boolean;
  flagError: string | null;
  flagSuccess: boolean;
}

export function ReportMarkerPopup({
  report,
  onVote,
  isVoting,
  feedbackError,
  authenticated,
  onRequestLogin,
  popupOpen = true,
  onFlag,
  flagBusy,
  flagError,
  flagSuccess,
}: ReportMarkerPopupProps) {
  const [flagFormOpen, setFlagFormOpen] = useState(false);
  const [flagReason, setFlagReason] = useState<ReportFlagReason>('SPAM');
  const [infrastructure, setInfrastructure] = useState<OfficialMobilityInfrastructure[]>([]);
  const [infrastructureError, setInfrastructureError] = useState(false);
  const [streetScore, setStreetScore] = useState<StreetScoreResultDto | null>(null);
  useEffect(() => {
    if (!popupOpen || !report.street?.id) return;
    const controller = new AbortController();
    void getStreetInfrastructure(report.street.id, controller.signal)
      .then((items) => {
        setInfrastructure(items);
        setInfrastructureError(false);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setInfrastructureError(true);
      });
    void getStreetScore(report.street.id, controller.signal)
      .then(setStreetScore)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setStreetScore(null);
      });
    return () => controller.abort();
  }, [popupOpen, report.street?.id]);
  const severity = severityLabels[report.severity];
  const freshness = freshnessLabels[report.freshness.level];
  const evaluatedAt = new Date(report.freshness.evaluatedAt).getTime();

  return (
    <div className="report-popup">
      <span className="report-popup__type">{reportTypeLabels[report.type]}</span>
      <span className={`report-popup__severity report-popup__severity--${report.severity}`}>
        <span aria-hidden="true">{severity.icon}</span> {severity.label}
      </span>
      {report.description && <p className="report-popup__description">{report.description}</p>}
      {report.publiclyVisible === false && (
        <span className="report-popup__meta">Este reporte no aparece en el mapa público.</span>
      )}
      {report.street && (
        <div className="report-popup__street" aria-label="Ubicación oficial">
          <strong>{report.street.officialName}</strong>
          {report.street.neighborhoodName && <span>{report.street.neighborhoodName}</span>}
          {report.street.communeName && <span>{report.street.communeName}</span>}
        </div>
      )}
      {popupOpen && report.street && infrastructure.length > 0 && (
        <section className="report-popup__official" aria-label="Infraestructura de fuente oficial">
          <strong>Infraestructura · Fuente oficial</strong>
          {infrastructure.map((item) => (
            <span key={item.id}>
              {item.type === 'BIKE_LANE'
                ? 'Ciclovía'
                : item.type === 'METROBUS_CORRIDOR'
                  ? 'Corredor Metrobus'
                  : 'Parada Metrobus'}
              {item.name && ` · ${item.name}`}
            </span>
          ))}
        </section>
      )}
      {infrastructureError && (
        <span className="report-popup__meta">No se pudo consultar la infraestructura oficial.</span>
      )}
      {popupOpen && report.street && streetScore && (
        <section className="report-popup__score" aria-label="Estado estimado de la calle">
          <strong>Estado estimado de la calle</strong>
          <span className="report-popup__score-value">
            {streetScore.score} / 100 ·{' '}
            {streetScore.level === 'GOOD'
              ? 'Bueno'
              : streetScore.level === 'FAIR'
                ? 'Regular'
                : streetScore.level === 'BAD'
                  ? 'Malo'
                  : streetScore.level === 'VERY_BAD'
                    ? 'Muy malo'
                    : 'Intransitable'}
          </span>
          <span>
            {streetScore.metrics.activeReports} activos ({streetScore.metrics.recentReports}{' '}
            recientes) · {streetScore.metrics.highSeverityReports} de alta severidad ·{' '}
            {streetScore.metrics.confirmations} confirmaciones
          </span>
          {streetScore.metrics.officialIncidents > 0 && (
            <span>{streetScore.metrics.officialIncidents} incidentes oficiales activos</span>
          )}
          {streetScore.metrics.trafficLevel && (
            <span>Tráfico oficial: {streetScore.metrics.trafficLevel.toLowerCase()}</span>
          )}
          <span>
            Confianza{' '}
            {streetScore.confidence === 'HIGH'
              ? 'alta'
              : streetScore.confidence === 'MEDIUM'
                ? 'media'
                : 'baja'}
          </span>
          {(streetScore.sourceStatus.officialIncidents === 'UNAVAILABLE' ||
            streetScore.sourceStatus.traffic === 'UNAVAILABLE') && (
            <span>
              Las señales oficiales de cortes y tráfico no están disponibles para este cálculo.
            </span>
          )}
          <details>
            <summary>Por qué tiene este score</summary>
            <ul>
              {streetScore.factors.map((factor) => (
                <li key={factor.code}>
                  <strong>
                    {factor.label}: {factor.impact > 0 ? '+' : ''}
                    {factor.impact}
                  </strong>
                  <span>{factor.detail}</span>
                  <small>
                    Fuente:{' '}
                    {factor.source === 'COMMUNITY'
                      ? 'comunidad'
                      : factor.source === 'OFFICIAL'
                        ? 'oficial'
                        : 'sistema'}
                  </small>
                </li>
              ))}
            </ul>
            {streetScore.segments && streetScore.segments.length > 0 && (
              <small>
                Promedio basado en {streetScore.segments.length} segmentos con datos disponibles.
              </small>
            )}
          </details>
        </section>
      )}
      <span
        className={`report-popup__freshness report-popup__freshness--${report.freshness.level}`}
      >
        <span aria-hidden="true">{freshness.icon}</span> {freshness.label}
      </span>
      <span className="report-popup__confidence">
        Confianza comunitaria: {report.freshness.confidence}%
      </span>
      <span className="report-popup__meta">
        Estado:{' '}
        {report.status === 'ACTIVE' ? 'Activo' : report.status === 'STALE' ? 'Antiguo' : 'Resuelto'}
      </span>
      <span className="report-popup__meta">
        Reportado: {formatReportedAt(report.createdAt, evaluatedAt)}
      </span>
      <div className="report-feedback" aria-label="Confirmación comunitaria">
        <button
          type="button"
          className={report.feedback.userFeedback === 'CONFIRM' ? 'is-selected' : ''}
          aria-pressed={report.feedback.userFeedback === 'CONFIRM'}
          disabled={isVoting || !authenticated || report.publiclyVisible === false}
          onClick={() => onVote('CONFIRM')}
        >
          <span>👍 Sigue existiendo</span>
          <strong>{report.feedback.confirmations}</strong>
        </button>
        <button
          type="button"
          className={report.feedback.userFeedback === 'RESOLVED' ? 'is-selected' : ''}
          aria-pressed={report.feedback.userFeedback === 'RESOLVED'}
          disabled={isVoting || !authenticated || report.publiclyVisible === false}
          onClick={() => onVote('RESOLVED')}
        >
          <span>👎 Ya no existe</span>
          <strong>{report.feedback.resolvedReports}</strong>
        </button>
      </div>
      {!authenticated && (
        <button type="button" className="report-popup__login" onClick={onRequestLogin}>
          Iniciá sesión para confirmar este reporte
        </button>
      )}
      {feedbackError && (
        <span className="report-popup__feedback-error" role="alert">
          {feedbackError}
        </span>
      )}
      {authenticated && report.publiclyVisible !== false && !flagSuccess && (
        <div className="report-flag">
          {!flagFormOpen ? (
            <button
              type="button"
              className="report-flag__open"
              onClick={() => setFlagFormOpen(true)}
            >
              Denunciar reporte
            </button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onFlag(flagReason);
              }}
            >
              <label>
                Motivo
                <select
                  value={flagReason}
                  onChange={(event) => setFlagReason(event.target.value as ReportFlagReason)}
                >
                  <option value="SPAM">Spam</option>
                  <option value="INAPPROPRIATE">Contenido inapropiado</option>
                  <option value="FALSE_INFORMATION">Información falsa</option>
                  <option value="OTHER">Otro</option>
                </select>
              </label>
              <div>
                <button type="button" onClick={() => setFlagFormOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" disabled={flagBusy}>
                  {flagBusy ? 'Enviando…' : 'Enviar denuncia'}
                </button>
              </div>
            </form>
          )}
          {flagError && <span role="alert">{flagError}</span>}
        </div>
      )}
      {!authenticated && report.publiclyVisible !== false && (
        <button type="button" className="report-flag__open" onClick={onRequestLogin}>
          Iniciá sesión para denunciar este reporte
        </button>
      )}
      {flagSuccess && (
        <span className="report-popup__meta" role="status">
          Gracias. Enviamos el reporte a revisión.
        </span>
      )}
    </div>
  );
}

export const reportTypeLabelsForMap = reportTypeLabels;
