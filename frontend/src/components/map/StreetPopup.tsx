import {
  SURFACE_CONDITION_OPTIONS,
  SURFACE_SOURCE_LABELS,
  SURFACE_TYPE_OPTIONS,
  type SurfaceSource,
} from '../../api/roadInformationTypes.js';
import { NO_STREET_CONDITION_COLOR, streetConditionLevel } from './streetConditionCatalog.js';
import type { StreetTileProperties } from './types.js';

/** Popup breve al tocar una calle: nombre, estado, pavimento y un acceso a sus reportes. */
export function StreetPopup({
  street,
  onViewReports,
}: {
  street: StreetTileProperties;
  onViewReports: (streetId: string, streetName: string) => void;
}) {
  const level = street.lv ? streetConditionLevel(street.lv) : undefined;
  const hasScore = street.ev && typeof street.sc === 'number';
  const surface = SURFACE_TYPE_OPTIONS.find((item) => item.value === street.st);
  const condition = SURFACE_CONDITION_OPTIONS.find((item) => item.value === street.sco);
  const source = street.ss ? SURFACE_SOURCE_LABELS[street.ss as SurfaceSource] : undefined;
  const reports = street.ar ?? 0;

  return (
    <div className="street-popup">
      <strong>{street.n}</strong>
      <span className="street-popup__row">
        <span
          className="street-popup__dot"
          style={{ background: hasScore && level ? level.color : NO_STREET_CONDITION_COLOR }}
          aria-hidden="true"
        />
        {hasScore
          ? `${level?.label ?? 'Estado'} · ${street.sc}/100`
          : 'Sin datos de estado todavía'}
      </span>
      {reports > 0 && (
        <span className="street-popup__muted">
          {reports} {reports === 1 ? 'reporte activo' : 'reportes activos'}
        </span>
      )}
      <span className="street-popup__row">
        <span
          className="street-popup__dot"
          style={{ background: surface?.color ?? NO_STREET_CONDITION_COLOR }}
          aria-hidden="true"
        />
        {surface ? `Pavimento: ${surface.label}` : 'Pavimento sin informar'}
        {condition ? ` · ${condition.label.toLowerCase()}` : ''}
      </span>
      {surface && source && source !== SURFACE_SOURCE_LABELS.COMMUNITY && (
        <span className="street-popup__muted">Dato base de {source}</span>
      )}
      {street.av === 'BLOCKED' && <span className="street-popup__alert">Corte reportado</span>}
      {street.av === 'RESTRICTED' && (
        <span className="street-popup__alert">Con restricciones reportadas</span>
      )}
      <button type="button" onClick={() => onViewReports(street.sid, street.n)}>
        Ver reportes de esta calle
      </button>
    </div>
  );
}
