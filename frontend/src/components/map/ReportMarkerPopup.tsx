import { useEffect, useState } from 'react';
import type { ReportDto, ReportFeedbackType } from '../../api/reportTypes.js';
import {
  getStreetInfrastructure,
  type OfficialMobilityInfrastructure,
} from '../../api/streetsApi.js';

const reportTypeLabels: Record<ReportDto['type'], string> = {
  POTHOLE: 'BACHE',
  FLOOD: 'INUNDACIÓN',
  ROAD_DAMAGE: 'PAVIMENTO DETERIORADO',
  ROAD_BLOCKED: 'CALLE BLOQUEADA',
  ROAD_WORK: 'OBRA',
  TRAFFIC_LIGHT: 'SEMÁFORO',
  OTHER: 'OTRO PROBLEMA',
};

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
}

export function ReportMarkerPopup({
  report,
  onVote,
  isVoting,
  feedbackError,
  authenticated,
  onRequestLogin,
  popupOpen = true,
}: ReportMarkerPopupProps) {
  const [infrastructure, setInfrastructure] = useState<OfficialMobilityInfrastructure[]>([]);
  const [infrastructureError, setInfrastructureError] = useState(false);
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
          disabled={isVoting || !authenticated}
          onClick={() => onVote('CONFIRM')}
        >
          <span>👍 Sigue existiendo</span>
          <strong>{report.feedback.confirmations}</strong>
        </button>
        <button
          type="button"
          className={report.feedback.userFeedback === 'RESOLVED' ? 'is-selected' : ''}
          aria-pressed={report.feedback.userFeedback === 'RESOLVED'}
          disabled={isVoting || !authenticated}
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
    </div>
  );
}

export const reportTypeLabelsForMap = reportTypeLabels;
