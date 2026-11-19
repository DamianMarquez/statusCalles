import { useState } from 'react';
import type { ZoneLevel } from '../../api/zonesApi.js';
import { MapCanvas } from '../map/maplibre/mapLibre.js';
import { ZonePopup } from '../map/ZonePopup.js';
import { ZonesLayer } from '../map/ZonesLayer.js';
import { ZONE_METRICS, type ZoneMetric } from '../map/zoneColors.js';
import { useZones } from './useZones.js';
import { ZoneRanking } from './ZoneRanking.js';

const LEVELS: ReadonlyArray<{ value: ZoneLevel; label: string }> = [
  { value: 'commune', label: 'Comunas' },
  { value: 'neighborhood', label: 'Barrios' },
];

/** Comunas o barrios en un mapa y en un ranking, coloreados como en el mapa principal. */
export function ZoneExplorer() {
  const [level, setLevel] = useState<ZoneLevel>('commune');
  const [metric, setMetric] = useState<ZoneMetric>('condition');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const { zones, loading, error } = useZones(level, retryKey);
  const selected = zones?.find((zone) => zone.id === selectedId) ?? null;

  return (
    <div className="analytics-zones">
      <div className="analytics-zones__controls">
        <div className="analytics-segmented" role="radiogroup" aria-label="Nivel de zona">
          {LEVELS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={level === item.value}
              className={level === item.value ? 'is-active' : ''}
              onClick={() => {
                setLevel(item.value);
                setSelectedId(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="analytics-segmented" role="radiogroup" aria-label="Colorear zonas por">
          {ZONE_METRICS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={metric === item.value}
              className={metric === item.value ? 'is-active' : ''}
              onClick={() => setMetric(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="analytics-zones__body">
        <div className="analytics-heatmap">
          <MapCanvas
            className="analytics-heatmap__map"
            center={[-58.4, -34.615]}
            zoom={10.3}
            maxBounds={undefined}
            scrollZoom={false}
          >
            <ZonesLayer selection={level} metric={metric} />
          </MapCanvas>
        </div>
        <div>
          {loading && <p className="analytics-loading">Cargando zonas…</p>}
          {error && (
            <div className="analytics-alert" role="alert">
              <span>No pudimos cargar las zonas.</span>
              <button type="button" onClick={() => setRetryKey((current) => current + 1)}>
                Reintentar
              </button>
            </div>
          )}
          {zones && (
            <ZoneRanking
              zones={zones}
              metric={metric}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {selected && (
            <div className="analytics-zone-detail" aria-live="polite">
              <ZonePopup zone={selected} metric={metric} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
