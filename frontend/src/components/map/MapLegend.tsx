import { useEffect, useRef } from 'react';
import {
  REPORT_SEVERITY_OPTIONS,
  REPORT_STATUS_OPTIONS,
  REPORT_TYPE_OPTIONS,
} from '../../api/reportCatalog.js';
import { STREET_CONDITION_LEVELS } from './streetConditionCatalog.js';

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
            style={{ backgroundColor: '#7b8490' }}
            aria-hidden="true"
          />
          Sin datos
        </span>
      </div>
    </section>
  );
}
