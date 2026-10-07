import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import {
  getAnalyticsDashboard,
  type AnalyticsOverview,
  type AnalyticsReportDistribution,
  type AnalyticsNeighborhood,
  type AnalyticsTrend,
  type AnalyticsScoreRank,
  type AnalyticsHeatCell,
  type OfficialAnalytics,
} from '../../api/analyticsApi.js';

interface DashboardData {
  overview: AnalyticsOverview;
  reports: AnalyticsReportDistribution;
  neighborhoods: AnalyticsNeighborhood[];
  communes: AnalyticsNeighborhood[];
  trends: AnalyticsTrend[];
  streets: AnalyticsScoreRank[];
  segments: AnalyticsScoreRank[];
  heatmap: AnalyticsHeatCell[];
  official: OfficialAnalytics;
}

const reportLabels: Record<string, string> = {
  POTHOLE: 'Baches',
  FLOOD: 'Inundaciones',
  ROAD_DAMAGE: 'Pavimento deteriorado',
  ROAD_BLOCKED: 'Calles bloqueadas',
  ROAD_WORK: 'Obras',
  TRAFFIC_LIGHT: 'Semáforos',
  OTHER: 'Otros',
};
const severityLabels: Record<number, string> = { 1: 'Baja', 2: 'Media', 3: 'Alta', 4: 'Crítica' };
const scoreLabels: Record<string, string> = {
  GOOD: 'Bueno',
  FAIR: 'Regular',
  BAD: 'Malo',
  VERY_BAD: 'Muy malo',
  IMPASSABLE: 'Intransitable',
};

function formatHours(hours: number): string {
  if (!hours) return '—';
  if (hours < 24) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1)} días`;
}

function BarList({
  items,
  label,
}: {
  items: Array<{ label: string; value: number }>;
  label: string;
}) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0)
    return <p className="analytics-empty">Todavía no hay datos para este período.</p>;
  return (
    <ul className="analytics-bars" aria-label={label}>
      {items.map((item) => (
        <li key={item.label}>
          <span>{item.label}</span>
          <span className="analytics-bars__track">
            <span style={{ width: `${(item.value / maximum) * 100}%` }} />
          </span>
          <strong>{item.value}</strong>
        </li>
      ))}
    </ul>
  );
}

export function AnalyticsDashboard() {
  const [period, setPeriod] = useState('90');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const from =
      period === 'all'
        ? undefined
        : new Date(Date.now() - Number(period) * 86_400_000).toISOString();
    setLoading(true);
    setError('');
    getAnalyticsDashboard({ from }, controller.signal)
      .then((result) => setData(result))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'No pudimos cargar Analytics.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period]);

  return (
    <main className="analytics-page">
      <div className="analytics-heading">
        <div>
          <span className="analytics-eyebrow">CABA · DATOS COMUNITARIOS</span>
          <h1>Analytics</h1>
          <p>Una mirada agregada al estado de las calles y los reportes de la comunidad.</p>
        </div>
        <label>
          Período{' '}
          <select
            aria-label="Período"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="365">Último año</option>
            <option value="all">Todo el historial</option>
          </select>
        </label>
      </div>
      {error && (
        <div className="analytics-alert" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <p className="analytics-loading" role="status">
          Actualizando indicadores…
        </p>
      )}
      {data && (
        <>
          <section className="analytics-kpis" aria-label="Resumen de reportes">
            <article>
              <span>Reportes totales</span>
              <strong>{data.overview.total.toLocaleString('es-AR')}</strong>
            </article>
            <article>
              <span>Activos recientes</span>
              <strong>{data.overview.active.toLocaleString('es-AR')}</strong>
            </article>
            <article>
              <span>Resueltos</span>
              <strong>{data.overview.resolved.toLocaleString('es-AR')}</strong>
            </article>
            <article>
              <span>Considerados antiguos</span>
              <strong>{data.overview.stale_percent}%</strong>
              <small>{data.overview.stale} reportes</small>
            </article>
            <article>
              <span>Con confirmación</span>
              <strong>{data.overview.confirmed_percent}%</strong>
              <small>{data.overview.confirmed} reportes</small>
            </article>
            <article>
              <span>Tiempo medio de resolución</span>
              <strong>{formatHours(data.overview.average_resolution_hours)}</strong>
            </article>
          </section>
          <div className="analytics-grid">
            <section className="analytics-card">
              <div className="analytics-card__heading">
                <div>
                  <span>ACTIVIDAD</span>
                  <h2>Evolución temporal</h2>
                </div>
              </div>
              {data.trends.length ? (
                <div
                  className="analytics-trend"
                  role="img"
                  aria-label="Evolución semanal de reportes"
                >
                  <svg viewBox="0 0 640 180" preserveAspectRatio="none">
                    <polyline
                      className="analytics-trend__reports"
                      points={data.trends
                        .map(
                          (point, index) =>
                            `${(index / Math.max(data.trends.length - 1, 1)) * 620 + 10},${165 - (point.reports / Math.max(...data.trends.flatMap((item) => [item.reports, item.resolved]), 1)) * 145}`,
                        )
                        .join(' ')}
                    />
                    <polyline
                      className="analytics-trend__resolved"
                      points={data.trends
                        .map(
                          (point, index) =>
                            `${(index / Math.max(data.trends.length - 1, 1)) * 620 + 10},${165 - (point.resolved / Math.max(...data.trends.flatMap((item) => [item.reports, item.resolved]), 1)) * 145}`,
                        )
                        .join(' ')}
                    />
                  </svg>
                  <div>
                    <span>
                      {new Date(data.trends[0]!.period).toLocaleDateString('es-AR', {
                        month: 'short',
                        year: '2-digit',
                      })}
                    </span>
                    <span>
                      {new Date(data.trends[data.trends.length - 1]!.period).toLocaleDateString(
                        'es-AR',
                        { month: 'short', year: '2-digit' },
                      )}
                    </span>
                  </div>
                  <small>
                    <span className="analytics-trend__legend analytics-trend__legend--reports" />
                    Reportes{' '}
                    <span className="analytics-trend__legend analytics-trend__legend--resolved" />
                    Resueltos por semana
                  </small>
                </div>
              ) : (
                <p className="analytics-empty">No hay actividad en este período.</p>
              )}
            </section>
            <section className="analytics-card">
              <div className="analytics-card__heading">
                <div>
                  <span>PROBLEMAS</span>
                  <h2>Reportes por tipo</h2>
                </div>
              </div>
              <BarList
                label="Reportes por tipo"
                items={data.reports.byType.map((item) => ({
                  label: reportLabels[item.type] ?? item.type,
                  value: item.count,
                }))}
              />
            </section>
            <section className="analytics-card">
              <div className="analytics-card__heading">
                <div>
                  <span>SEVERIDAD</span>
                  <h2>Distribución por gravedad</h2>
                </div>
              </div>
              <BarList
                label="Reportes por severidad"
                items={data.reports.bySeverity.map((item) => ({
                  label: severityLabels[item.severity] ?? String(item.severity),
                  value: item.count,
                }))}
              />
            </section>
            <section className="analytics-card analytics-card--wide">
              <div className="analytics-card__heading">
                <div>
                  <span>GEOGRAFÍA</span>
                  <h2>Concentración de reportes</h2>
                </div>
                <small>Cuadrículas agregadas · OpenStreetMap</small>
              </div>
              <div className="analytics-heatmap">
                <MapContainer
                  center={[-34.6037, -58.3816]}
                  zoom={11}
                  scrollWheelZoom={false}
                  zoomControl={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {data.heatmap.map((cell, index) => (
                    <CircleMarker
                      key={`${cell.latitude}:${cell.longitude}:${index}`}
                      center={[cell.latitude, cell.longitude]}
                      radius={Math.min(22, 6 + Math.sqrt(cell.reports) * 3)}
                      pathOptions={{
                        color: '#b74429',
                        fillColor: '#e66b45',
                        fillOpacity: 0.45,
                        weight: 1,
                      }}
                    >
                      <Popup>
                        {cell.reports} reportes · {cell.high_severity} de alta severidad
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            </section>
            <section className="analytics-card">
              <div className="analytics-card__heading">
                <div>
                  <span>BARRIOS</span>
                  <h2>Distribución geográfica</h2>
                </div>
              </div>
              <BarList
                label="Reportes por barrio"
                items={data.neighborhoods
                  .filter((item) => item.name)
                  .slice(0, 10)
                  .map((item) => ({ label: item.name!, value: item.reports }))}
              />
            </section>
            <section className="analytics-card">
              <div className="analytics-card__heading">
                <div>
                  <span>COMUNAS</span>
                  <h2>Reportes por comuna</h2>
                </div>
              </div>
              <BarList
                label="Reportes por comuna"
                items={data.communes
                  .filter((item) => item.name)
                  .map((item) => ({ label: item.name!, value: item.reports }))}
              />
            </section>
            <section className="analytics-card">
              <div className="analytics-card__heading">
                <div>
                  <span>STREET SCORE</span>
                  <h2>Calles con menor score</h2>
                </div>
              </div>
              <ol className="analytics-ranking">
                {data.streets.map((item) => (
                  <li key={item.id}>
                    <span>{item.officialName}</span>
                    <strong>
                      {item.score?.score ?? '—'}
                      <small>/100 · {scoreLabels[item.score?.level ?? ''] ?? 'Sin datos'}</small>
                    </strong>
                  </li>
                ))}
              </ol>
              {!data.streets.length && (
                <p className="analytics-empty">No hay calles con suficiente evidencia.</p>
              )}
            </section>
            <section className="analytics-card analytics-card--wide">
              <div className="analytics-card__heading">
                <div>
                  <span>STREET SCORE</span>
                  <h2>Segmentos con menor score</h2>
                </div>
              </div>
              <ol className="analytics-ranking analytics-ranking--segments">
                {data.segments.map((item) => (
                  <li key={item.id}>
                    <span>{item.officialName}</span>
                    <strong>
                      {item.score?.score ?? '—'}
                      <small>/100 · {scoreLabels[item.score?.level ?? ''] ?? 'Sin datos'}</small>
                    </strong>
                  </li>
                ))}
              </ol>
              {!data.segments.length && (
                <p className="analytics-empty">No hay segmentos con suficiente evidencia.</p>
              )}
            </section>
            <section className="analytics-card analytics-card--wide">
              <div className="analytics-card__heading">
                <div>
                  <span>FUENTES PÚBLICAS</span>
                  <h2>Infraestructura y sincronización oficial</h2>
                </div>
              </div>
              <div className="analytics-official">
                <div>
                  <h3>Infraestructura cargada</h3>
                  <BarList
                    label="Infraestructura oficial por tipo"
                    items={data.official.infrastructure.map((item) => ({
                      label: item.type.replaceAll('_', ' ').toLowerCase(),
                      value: item.count,
                    }))}
                  />
                </div>
                <div>
                  <h3>Estado de fuentes</h3>
                  <ul className="analytics-source-list">
                    {data.official.sources.map((source) => (
                      <li key={source.slug}>
                        <span>{source.name}</span>
                        <strong
                          className={`analytics-source analytics-source--${source.status.toLowerCase()}`}
                        >
                          {source.status === 'SUCCESS'
                            ? 'Actualizada'
                            : source.status === 'FAILED'
                              ? 'Error'
                              : source.status === 'NEVER'
                                ? 'Sin sincronizar'
                                : source.status}
                        </strong>
                        <small>
                          {source.lastSyncAt
                            ? `Última sincronización: ${new Date(source.lastSyncAt).toLocaleDateString('es-AR')}`
                            : 'Todavía no hay una sincronización registrada.'}
                        </small>
                      </li>
                    ))}
                  </ul>
                  <p className="analytics-source-note">
                    Tráfico e incidentes en tiempo real:{' '}
                    {data.official.realtime_traffic_available ? 'disponibles' : 'no disponibles'}.
                  </p>
                </div>
              </div>
            </section>
          </div>
          <p className="analytics-footnote">
            Los reportes ocultos por moderación no se incluyen en los indicadores públicos. Las
            métricas describen datos disponibles y no representan una auditoría oficial de todas las
            calles.
          </p>
        </>
      )}
    </main>
  );
}
