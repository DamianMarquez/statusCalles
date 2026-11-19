import { useState } from 'react';
import { SURFACE_TYPE_OPTIONS } from '../../api/roadInformationTypes.js';
import type { ZoneProperties } from '../../api/zonesApi.js';
import { streetConditionLevel } from '../map/streetConditionCatalog.js';
import {
  CRITICAL_CLASSES,
  NO_DATA_ZONE_COLOR,
  quintileBreaks,
  zoneColor,
  type ZoneMetric,
} from '../map/zoneColors.js';

interface Row {
  id: number;
  name: string;
  value: string;
  fraction: number;
  color: string;
  sortKey: number;
  muted: boolean;
}

function format(value: number, digits = 0): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: digits });
}

/** Una fila por zona con el mismo color que tiene en el mapa, ordenada de lo más a lo menos relevante. */
export function buildRows(zones: ZoneProperties[], metric: ZoneMetric): Row[] {
  const breaks = quintileBreaks(zones.map((zone) => zone.intervention.index));
  const maxIndex = Math.max(1, ...zones.map((zone) => zone.intervention.index));
  const maxCritical = Math.max(
    1,
    ...zones.map((zone) => zone.critical.critical + zone.critical.high),
  );
  const rows = zones.map((zone): Row => {
    const color = zoneColor(zone, metric, breaks);
    switch (metric) {
      case 'condition': {
        const { avgScore, level, sufficient } = zone.condition;
        if (!sufficient || avgScore === null)
          return {
            id: zone.id,
            name: zone.name,
            value: 'Datos insuficientes',
            fraction: 0,
            color: NO_DATA_ZONE_COLOR,
            sortKey: Number.POSITIVE_INFINITY,
            muted: true,
          };
        return {
          id: zone.id,
          name: zone.name,
          value: `${format(avgScore, 1)}/100 · ${streetConditionLevel(level ?? '')?.label ?? ''}`,
          fraction: avgScore / 100,
          color,
          // Primero las de peor estado.
          sortKey: avgScore,
          muted: false,
        };
      }
      case 'surface': {
        const dominant = zone.surface.dominant;
        return {
          id: zone.id,
          name: zone.name,
          value: dominant
            ? `${SURFACE_TYPE_OPTIONS.find((item) => item.value === dominant.type)?.label ?? dominant.type} · ${format(dominant.pct)} %`
            : 'Sin datos',
          fraction: dominant ? dominant.pct / 100 : 0,
          color,
          sortKey: dominant ? -dominant.pct : Number.POSITIVE_INFINITY,
          muted: !dominant,
        };
      }
      case 'intervention':
        return {
          id: zone.id,
          name: zone.name,
          value: `${format(zone.intervention.index, 1)} por 10 km`,
          fraction: zone.intervention.index / maxIndex,
          color,
          sortKey: -zone.intervention.index,
          muted: false,
        };
      case 'critical': {
        const count = zone.critical.critical + zone.critical.high;
        return {
          id: zone.id,
          name: zone.name,
          value: `${zone.critical.critical} críticos · ${zone.critical.high} altos`,
          fraction: count / maxCritical,
          color: count === 0 ? CRITICAL_CLASSES[0]!.color : color,
          sortKey: -count,
          muted: count === 0,
        };
      }
    }
  });
  return rows.sort(
    (left, right) => left.sortKey - right.sortKey || left.name.localeCompare(right.name, 'es'),
  );
}

const COLLAPSED_ROWS = 10;

export function ZoneRanking({
  zones,
  metric,
  selectedId,
  onSelect,
}: {
  zones: ZoneProperties[];
  metric: ZoneMetric;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = buildRows(zones, metric);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  return (
    <div className="analytics-zone-ranking">
      <ol aria-label="Ranking de zonas">
        {visible.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              aria-pressed={selectedId === row.id}
              className={row.muted ? 'is-muted' : ''}
              onClick={() => onSelect(row.id)}
            >
              <span className="analytics-zone-ranking__name">{row.name}</span>
              <span className="analytics-bars__track">
                <span
                  style={{ width: `${Math.max(row.fraction * 100, 2)}%`, background: row.color }}
                />
              </span>
              <strong>{row.value}</strong>
            </button>
          </li>
        ))}
      </ol>
      {rows.length > COLLAPSED_ROWS && (
        <button
          type="button"
          className="analytics-zone-ranking__more"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Ver menos' : `Ver las ${rows.length} zonas`}
        </button>
      )}
    </div>
  );
}
