import { useEffect, useMemo, useState } from 'react';
import { AnalyticsHeatMap } from './AnalyticsHeatMap.js';
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
import { REPORT_TYPE_OPTIONS } from '../../api/reportCatalog.js';
import { SURFACE_TYPE_OPTIONS } from '../../api/roadInformationTypes.js';
import { CALMING_TYPES, PUBLIC_WORK_COLOR } from '../map/mapCategories.js';
import { groupReportsByCategory, summarizeCity } from './cityStats.js';
import { panelId, StatsTabs, tabId } from './StatsTabs.js';
import { useZones } from './useZones.js';
import { ZoneExplorer } from './ZoneExplorer.js';

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

type TabId = 'summary' | 'reports' | 'zones' | 'streets';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'summary', label: 'Resumen' },
  { id: 'reports', label: 'Reportes' },
  { id: 'zones', label: 'Zonas' },
  { id: 'streets', label: 'Calles y marcas' },
];

const reportLabels: Record<string, string> = Object.fromEntries(
  REPORT_TYPE_OPTIONS.map((option) => [option.value, option.pluralLabel]),
);
const severityLabels: Record<number, string> = { 1: 'Baja', 2: 'Media', 3: 'Alta', 4: 'Crítica' };
const scoreLabels: Record<string, string> = {
  EXCELLENT: 'Excelente',
  GOOD: 'Buena',
  ACCEPTABLE: 'Aceptable',
  UNCOMFORTABLE: 'Incómoda',
  BAD: 'Mala',
  VERY_BAD: 'Muy mala',
  CRITICAL: 'Crítica',
};

function formatHours(hours: number): string {
  if (!hours) return '—';
  if (hours < 24) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1)} días`;
}

function number(value: number, digits = 0): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: digits });
}

/** Estado de una fuente guardado en la base → texto y variante de estilo. */
function sourceStatus(status: string): { label: string; variant: string } {
  switch (status) {
    case 'SUCCEEDED':
    case 'SUCCESS':
      return { label: 'Actualizada', variant: 'success' };
    case 'FAILED':
      return { label: 'Error', variant: 'failed' };
    case 'NEVER':
      return { label: 'Sin sincronizar', variant: 'never' };
    default:
      return { label: status, variant: 'never' };
  }
}

function BarList({
  items,
  label,
  empty = 'Todavía no hay datos para este período.',
}: {
  items: Array<{ label: string; value: number; color?: string; valueLabel?: string }>;
  label: string;
  empty?: string;
}) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0) return <p className="analytics-empty">{empty}</p>;
  return (
    <ul className="analytics-bars" aria-label={label}>
      {items.map((item) => (
        <li key={item.label}>
          <span>{item.label}</span>
          <span className="analytics-bars__track">
            <span
              style={{
                width: `${(item.value / maximum) * 100}%`,
                ...(item.color ? { background: item.color } : {}),
              }}
            />
          </span>
          <strong>{item.valueLabel ?? item.value}</strong>
        </li>
      ))}
    </ul>
  );
}

function Card({
  eyebrow,
  title,
  wide = false,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  wide?: boolean;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`analytics-card${wide ? ' analytics-card--wide' : ''}`}>
      <div className="analytics-card__heading">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {note && <small>{note}</small>}
      </div>
      {children}
    </section>
  );
}

export function AnalyticsDashboard() {
  const [tab, setTab] = useState<TabId>('summary');
  const [period, setPeriod] = useState('90');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [zonesRetry, setZonesRetry] = useState(0);
  const communes = useZones('commune', zonesRetry);
  const city = useMemo(
    () => (communes.zones ? summarizeCity(communes.zones) : null),
    [communes.zones],
  );
  const usesPeriod = tab === 'summary' || tab === 'reports';

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
  }, [period, retryKey]);

  return (
    <main className="analytics-page">
      <div className="analytics-heading">
        <div>
          <span className="analytics-eyebrow">CABA · DATOS COMUNITARIOS</span>
          <h1>Estadísticas</h1>
          <p>Una mirada agregada al estado de las calles y los reportes de la comunidad.</p>
        </div>
        <label>
          Período{' '}
          <select
            aria-label="Período"
            value={period}
            disabled={!usesPeriod}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="365">Último año</option>
            <option value="all">Todo el historial</option>
          </select>
        </label>
      </div>
      <StatsTabs tabs={TABS} active={tab} onChange={setTab} label="Secciones de estadísticas" />
      {!usesPeriod && (
        <p className="analytics-note">
          Esta sección muestra el estado actual de la ciudad; no usa el período elegido.
        </p>
      )}
      {error && (
        <div className="analytics-alert" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setRetryKey((current) => current + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {loading && usesPeriod && (
        <p className="analytics-loading" role="status">
          Actualizando indicadores…
        </p>
      )}

      <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)}>
        {tab === 'summary' && (
          <>
            {data && (
              <section className="analytics-kpis" aria-label="Resumen de reportes">
                <article>
                  <span>Reportes totales</span>
                  <strong>{number(data.overview.total)}</strong>
                </article>
                <article>
                  <span>Activos recientes</span>
                  <strong>{number(data.overview.active)}</strong>
                </article>
                <article>
                  <span>Resueltos</span>
                  <strong>{number(data.overview.resolved)}</strong>
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
            )}
            <h2 className="analytics-subtitle">Ciudad hoy</h2>
            {communes.error && (
              <div className="analytics-alert" role="alert">
                <span>No pudimos cargar los datos de la ciudad.</span>
                <button type="button" onClick={() => setZonesRetry((current) => current + 1)}>
                  Reintentar
                </button>
              </div>
            )}
            {communes.loading && <p className="analytics-loading">Cargando datos de la ciudad…</p>}
            {city && (
              <>
                <section className="analytics-kpis" aria-label="Resumen de la ciudad">
                  <article>
                    <span>Kilómetros de calles</span>
                    <strong>{number(city.totalKm)}</strong>
                    <small>{number(city.segments)} tramos</small>
                  </article>
                  <article>
                    <span>Pavimento conocido</span>
                    <strong>{number(city.knownPct, 1)}%</strong>
                    <small>de los kilómetros</small>
                  </article>
                  <article>
                    <span>Estado calculado</span>
                    <strong>{number(city.coveragePct, 1)}%</strong>
                    <small>de los kilómetros con puntaje</small>
                  </article>
                  <article>
                    <span>Reductores de velocidad</span>
                    <strong>{number(city.calming)}</strong>
                    <small>lomos, badenes y otros</small>
                  </article>
                  <article>
                    <span>Obras públicas vigentes</span>
                    <strong>{number(city.publicWorks)}</strong>
                    <small>GCBA · no son cortes en vivo</small>
                  </article>
                  <article>
                    <span>Críticos y altos activos</span>
                    <strong>{number(city.critical + city.high)}</strong>
                    <small>
                      {city.critical} críticos · {city.high} altos
                    </small>
                  </article>
                </section>
                <p className="analytics-note">
                  Los indicadores de la ciudad son del momento y no usan el período. El estado solo
                  se calcula donde hay reportes, así que su cobertura crece con la comunidad.
                </p>
              </>
            )}
          </>
        )}

        {tab === 'reports' && data && (
          <div className="analytics-grid">
            <Card eyebrow="ACTIVIDAD" title="Evolución temporal">
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
            </Card>
            <Card eyebrow="CATEGORÍAS" title="Reportes por categoría">
              <BarList
                label="Reportes por categoría"
                items={groupReportsByCategory(data.reports.byType).map((item) => ({
                  label: `${item.icon} ${item.label}`,
                  value: item.count,
                  color: item.color,
                }))}
              />
            </Card>
            <Card eyebrow="PROBLEMAS" title="Reportes por tipo">
              <BarList
                label="Reportes por tipo"
                items={data.reports.byType.map((item) => ({
                  label: reportLabels[item.type] ?? item.type,
                  value: item.count,
                }))}
              />
            </Card>
            <Card eyebrow="SEVERIDAD" title="Distribución por gravedad">
              <BarList
                label="Reportes por severidad"
                items={data.reports.bySeverity.map((item) => ({
                  label: severityLabels[item.severity] ?? String(item.severity),
                  value: item.count,
                }))}
              />
            </Card>
            <Card
              eyebrow="GEOGRAFÍA"
              title="Concentración de reportes"
              wide
              note="Cuadrículas agregadas"
            >
              <div className="analytics-heatmap">
                <AnalyticsHeatMap cells={data.heatmap} />
              </div>
            </Card>
            <Card eyebrow="BARRIOS" title="Distribución geográfica">
              <BarList
                label="Reportes por barrio"
                items={data.neighborhoods
                  .filter((item) => item.name)
                  .slice(0, 10)
                  .map((item) => ({ label: item.name!, value: item.reports }))}
              />
            </Card>
            <Card eyebrow="COMUNAS" title="Reportes por comuna">
              <BarList
                label="Reportes por comuna"
                items={data.communes
                  .filter((item) => item.name)
                  .map((item) => ({ label: item.name!, value: item.reports }))}
              />
            </Card>
            <Card eyebrow="STREET SCORE" title="Calles con menor score">
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
            </Card>
            <Card eyebrow="STREET SCORE" title="Segmentos con menor score" wide>
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
            </Card>
          </div>
        )}

        {tab === 'zones' && (
          <Card eyebrow="ZONAS" title="Comunas y barrios" wide>
            <ZoneExplorer />
          </Card>
        )}

        {tab === 'streets' && (
          <div className="analytics-grid">
            <Card eyebrow="PAVIMENTO" title="Tipo de pavimento de la ciudad">
              {communes.error && <p className="analytics-empty">No pudimos cargar los datos.</p>}
              {city && (
                <>
                  <BarList
                    label="Kilómetros por tipo de pavimento"
                    empty="Todavía no hay datos de pavimento."
                    items={SURFACE_TYPE_OPTIONS.map((item) => ({
                      label: item.label,
                      value: city.surfaceKm[item.value] ?? 0,
                      color: item.color,
                      valueLabel: `${number(city.surfaceKm[item.value] ?? 0)} km`,
                    })).filter((item) => item.value > 0)}
                  />
                  <small className="analytics-note">
                    Se conoce el pavimento del {number(city.knownPct, 1)}% de los kilómetros. Base:
                    © OpenStreetMap (ODbL); lo que cargó la comunidad tiene prioridad.
                  </small>
                </>
              )}
            </Card>
            <Card eyebrow="REDUCTORES" title="Lomos, badenes y otros">
              {city && (
                <BarList
                  label="Reductores de velocidad por tipo"
                  empty="Todavía no hay reductores cargados."
                  items={CALMING_TYPES.map((item) => ({
                    label: item.label,
                    value: city.calmingByType[item.value] ?? 0,
                    color: item.color,
                  })).filter((item) => item.value > 0)}
                />
              )}
              <small className="analytics-note">
                De OpenStreetMap: la cobertura es colaborativa y puede estar incompleta.
              </small>
            </Card>
            <Card eyebrow="OBRAS Y CORTES" title="Obras y reportes activos">
              {city && (
                <BarList
                  label="Obras y reportes activos"
                  empty="No hay obras ni reportes activos."
                  items={[
                    {
                      label: 'Obras públicas vigentes (GCBA)',
                      value: city.publicWorks,
                      color: PUBLIC_WORK_COLOR,
                    },
                    {
                      label: 'Obras reportadas por la comunidad',
                      value: city.reportedWorks,
                      color: PUBLIC_WORK_COLOR,
                    },
                    {
                      label: 'Cortes reportados por la comunidad',
                      value: city.reportedCuts,
                      color: '#c0392b',
                    },
                  ].filter((item) => item.value > 0)}
                />
              )}
              <small className="analytics-note">
                No hay una fuente abierta de cortes de tránsito en vivo; los cortes salen de
                reportes de la comunidad.
              </small>
            </Card>
            {data && (
              <Card
                eyebrow="FUENTES PÚBLICAS"
                title="Infraestructura y sincronización oficial"
                wide
              >
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
                      {data.official.sources.map((source) => {
                        const status = sourceStatus(source.status);
                        return (
                          <li key={source.slug}>
                            <span>{source.name}</span>
                            <strong
                              className={`analytics-source analytics-source--${status.variant}`}
                            >
                              {status.label}
                            </strong>
                            <small>
                              {source.lastSyncAt
                                ? `Última sincronización: ${new Date(source.lastSyncAt).toLocaleDateString('es-AR')}`
                                : 'Todavía no hay una sincronización registrada.'}
                            </small>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="analytics-source-note">
                      Tráfico e incidentes en tiempo real:{' '}
                      {data.official.realtime_traffic_available ? 'disponibles' : 'no disponibles'}.
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
      <p className="analytics-footnote">
        Los reportes ocultos por moderación no se incluyen en los indicadores públicos. Las métricas
        describen datos disponibles y no representan una auditoría oficial de todas las calles.
      </p>
    </main>
  );
}
