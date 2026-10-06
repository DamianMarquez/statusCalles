import type { ReportDto } from '../../api/reportTypes.js';

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

function formatReportedAt(dateValue: string, now = Date.now()): string {
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

export function ReportMarkerPopup({ report }: { report: ReportDto }) {
  const severity = severityLabels[report.severity];

  return (
    <div className="report-popup">
      <span className="report-popup__type">{reportTypeLabels[report.type]}</span>
      <span className={`report-popup__severity report-popup__severity--${report.severity}`}>
        <span aria-hidden="true">{severity.icon}</span> {severity.label}
      </span>
      <p className="report-popup__description">{report.description}</p>
      <span className="report-popup__meta">
        Estado: {report.status === 'ACTIVE' ? 'Activo' : 'Resuelto'}
      </span>
      <span className="report-popup__meta">Reportado: {formatReportedAt(report.createdAt)}</span>
    </div>
  );
}

export const reportTypeLabelsForMap = reportTypeLabels;
