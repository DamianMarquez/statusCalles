import { SURFACE_TYPE_OPTIONS } from '../../api/roadInformationTypes.js';
import type { ZoneProperties } from '../../api/zonesApi.js';
import { streetConditionLevel } from './streetConditionCatalog.js';
import { calmingLabel } from './mapCategories.js';
import type { ZoneMetric } from './zoneColors.js';

function surfaceLabel(type: string): string {
  return SURFACE_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type;
}

function format(value: number, digits = 0): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: digits });
}

/** Popup de una zona (comuna o barrio) con la lectura que se está mirando. */
export function ZonePopup({ zone, metric }: { zone: ZoneProperties; metric: ZoneMetric }) {
  return (
    <div className="street-popup">
      <strong>{zone.name}</strong>
      {metric === 'condition' && <ConditionDetail zone={zone} />}
      {metric === 'surface' && <SurfaceDetail zone={zone} />}
      {metric === 'intervention' && <InterventionDetail zone={zone} />}
      {metric === 'critical' && <CriticalDetail zone={zone} />}
      <span className="street-popup__muted">{format(zone.totalKm)} km de calles</span>
    </div>
  );
}

function ConditionDetail({ zone }: { zone: ZoneProperties }) {
  const { condition } = zone;
  const level = condition.level ? streetConditionLevel(condition.level) : undefined;
  if (!condition.sufficient || condition.avgScore === null) {
    return (
      <>
        <span>Datos insuficientes para estimar el estado</span>
        <span className="street-popup__muted">
          Solo {condition.scoredSegments} tramos tienen puntaje (hacen falta más reportes).
        </span>
      </>
    );
  }
  return (
    <>
      <span>
        Estado promedio: {level?.label ?? 'sin nivel'} · {format(condition.avgScore, 1)}/100
      </span>
      <span className="street-popup__muted">
        Calculado con {condition.scoredSegments} tramos con puntaje (
        {format(condition.coveragePct, 1)}% de los km).
      </span>
    </>
  );
}

function SurfaceDetail({ zone }: { zone: ZoneProperties }) {
  const { surface } = zone;
  if (!surface.dominant) return <span>Sin datos de pavimento</span>;
  return (
    <>
      <span>
        Predomina: {surfaceLabel(surface.dominant.type)} ({format(surface.dominant.pct)} %)
      </span>
      {surface.top.slice(1).map((item) => (
        <span key={item.type} className="street-popup__muted">
          {surfaceLabel(item.type)}: {format(item.pct)} %
        </span>
      ))}
      <span className="street-popup__muted">
        Pavimento conocido en {format(surface.knownPct)} % de las calles.
      </span>
    </>
  );
}

function InterventionDetail({ zone }: { zone: ZoneProperties }) {
  const { intervention } = zone;
  return (
    <>
      <span>Índice de intervención: {format(intervention.index, 1)} por cada 10 km</span>
      <span className="street-popup__muted">
        Obras públicas vigentes: {intervention.publicWorks} · Obras reportadas:{' '}
        {intervention.reportedWorks} · Cortes reportados: {intervention.reportedCuts}
      </span>
      <span className="street-popup__muted">
        Reductores: {intervention.calming} ({format(intervention.calmingPerKm, 2)} por km)
      </span>
      {Object.entries(intervention.calmingByType)
        .sort(([, left], [, right]) => right - left)
        .slice(0, 3)
        .map(([type, count]) => (
          <span key={type} className="street-popup__muted">
            {calmingLabel(type)}: {count}
          </span>
        ))}
    </>
  );
}

function CriticalDetail({ zone }: { zone: ZoneProperties }) {
  const { critical } = zone;
  return (
    <>
      <span>
        Reportes críticos activos: {critical.critical} · Altos: {critical.high}
      </span>
      <span className="street-popup__muted">
        {critical.activeReports} reportes activos en total. Cero no significa sin problemas: solo
        hay lo que la comunidad reportó.
      </span>
    </>
  );
}
