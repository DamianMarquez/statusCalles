import type { MapFeatureProperties } from '../../api/mapFeaturesApi.js';
import { calmingLabel } from './mapCategories.js';

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : null;
}

/** Popup breve de una marca importada: reductor de velocidad u obra pública. */
export function MapFeaturePopup({ feature }: { feature: MapFeatureProperties }) {
  if (feature.type === 'PUBLIC_WORK') {
    const start = formatDate(feature.startDate);
    const end = formatDate(feature.endDate);
    return (
      <div className="street-popup">
        <strong>{feature.name}</strong>
        <span className="street-popup__muted">Obra pública del GCBA</span>
        {feature.jurisdiction && <span>{feature.jurisdiction}</span>}
        {feature.address && <span className="street-popup__muted">{feature.address}</span>}
        {(start || end) && (
          <span className="street-popup__muted">
            {start ? `Desde ${start}` : ''}
            {start && end ? ' · ' : ''}
            {end ? `hasta ${end}` : start ? ' · sin fecha de fin informada' : ''}
          </span>
        )}
        <span className="street-popup__muted">
          Fuente: Buenos Aires Data (BA Obras). No indica cortes de tránsito.
        </span>
      </div>
    );
  }
  return (
    <div className="street-popup">
      <strong>{calmingLabel(feature.type)}</strong>
      {feature.maxspeed && <span>Velocidad indicada: {feature.maxspeed}</span>}
      <span className="street-popup__muted">Dato de OpenStreetMap</span>
    </div>
  );
}
