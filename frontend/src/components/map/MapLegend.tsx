import { useEffect, useRef } from 'react';
import {
  REPORT_SEVERITY_OPTIONS,
  REPORT_STATUS_OPTIONS,
  REPORT_TYPE_OPTIONS,
} from '../../api/reportCatalog.js';
import { STREET_CONDITION_LEVELS, streetConditionColor } from './streetConditionCatalog.js';
import {
  SURFACE_CONDITION_OPTIONS,
  SURFACE_TYPE_OPTIONS,
  type SurfaceCondition,
} from '../../api/roadInformationTypes.js';
import { surfaceConditionDashArray } from './roadSurfaceStyle.js';

function SurfaceLineSwatch({
  color,
  condition,
}: {
  color: string;
  condition?: SurfaceCondition | null;
}) {
  const dashArray = condition === undefined ? undefined : surfaceConditionDashArray(condition);
  return (
    <svg className="map-legend__surface-line" viewBox="0 0 32 10" aria-hidden="true">
      <line
        x1="2"
        y1="5"
        x2="30"
        y2="5"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        {...(dashArray ? { strokeDasharray: dashArray } : {})}
      />
    </svg>
  );
}

export function MapLegend({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const items = [
          ...(document.querySelector('.map-legend')?.querySelectorAll<HTMLElement>('button') ?? []),
        ];
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <section
      id="map-legend-panel"
      className="map-legend"
      role="dialog"
      aria-modal="false"
      aria-labelledby="map-legend-title"
    >
      <header>
        <h2 id="map-legend-title">Referencias del mapa</h2>
        <button ref={closeButton} type="button" aria-label="Cerrar leyenda" onClick={onClose}>
          ×
        </button>
      </header>
      <h3>Reportes</h3>
      <div className="map-legend__grid">
        {REPORT_TYPE_OPTIONS.map((item) => (
          <span className="map-legend__item" key={item.value}>
            <span
              className={`map-legend__dot map-legend__dot--${item.markerClass}`}
              aria-hidden="true"
            />
            {item.label}
          </span>
        ))}
      </div>
      <h3>Estado del reporte</h3>
      <div className="map-legend__grid">
        {REPORT_STATUS_OPTIONS.map((item) => (
          <span className="map-legend__item" key={item.value}>
            {item.icon} {item.label}
          </span>
        ))}
      </div>
      <h3>Severidad</h3>
      <div className="map-legend__grid">
        {REPORT_SEVERITY_OPTIONS.map((item) => (
          <span className="map-legend__item" key={item.value}>
            {item.label}
          </span>
        ))}
      </div>
      <h3>Condición física de las calles</h3>
      <p className="map-legend__note">
        Es una estimación comunitaria basada en reportes disponibles; no es una medición profesional
        ni una evaluación oficial.
      </p>
      <h3>Cómo leer las calles</h3>
      <div className="map-legend__grid">
        <span className="map-legend__item">
          <SurfaceLineSwatch color={streetConditionColor('GOOD')} />
          Color del centro: condición general
        </span>
        <span className="map-legend__item">
          <SurfaceLineSwatch color="#d17b37" />
          Color del borde: tipo de pavimento
        </span>
        <span className="map-legend__item">
          <SurfaceLineSwatch color="#7b8490" condition="VERY_POOR" />
          Patrón: condición del pavimento
        </span>
      </div>
      <h3>Tipo de pavimento</h3>
      <div className="map-legend__grid">
        {SURFACE_TYPE_OPTIONS.map((surface) => (
          <span className="map-legend__item" key={surface.value}>
            <SurfaceLineSwatch color={surface.color} />
            {surface.label}
          </span>
        ))}
        <span className="map-legend__item">
          <SurfaceLineSwatch color="#7b8490" />
          Tipo de pavimento sin informar
        </span>
      </div>
      <p className="map-legend__note">
        El pavimento base proviene de © colaboradores de OpenStreetMap (ODbL) y de Buenos Aires Data
        (CC-BY); donde la comunidad cargó un dato, ese tiene prioridad.
      </p>
      <p className="map-legend__note">
        Son aportes de la comunidad asociados a un segmento oficial. Las propuestas requieren tres
        confirmaciones independientes; la falta de información no indica un tipo de pavimento.
      </p>
      <h3>Condición del pavimento (patrón)</h3>
      <div className="map-legend__grid">
        {SURFACE_CONDITION_OPTIONS.map((condition) => (
          <span className="map-legend__item" key={condition.value}>
            <SurfaceLineSwatch color="#7b8490" condition={condition.value} />
            {condition.label}
          </span>
        ))}
        <span className="map-legend__item">
          <SurfaceLineSwatch color="#7b8490" condition={null} />
          Sin condición informada
        </span>
      </div>
      <h3>Score estimado</h3>
      <div className="map-legend__grid">
        {STREET_CONDITION_LEVELS.map((item) => (
          <span className="map-legend__item" key={item.value}>
            <span
              className="map-legend__score"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            {item.label} {item.range}
          </span>
        ))}
        <span className="map-legend__item">
          <span
            className="map-legend__score"
            style={{ backgroundColor: streetConditionColor('GOOD') }}
            aria-hidden="true"
          />
          Buena por defecto · sin score calculado
        </span>
      </div>
    </section>
  );
}
