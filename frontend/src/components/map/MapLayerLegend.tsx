import { SURFACE_TYPE_OPTIONS, type SurfaceType } from '../../api/roadInformationTypes.js';
import { NO_STREET_CONDITION_COLOR, STREET_CONDITION_LEVELS } from './streetConditionCatalog.js';
import { SCORE_RAMP_STOPS } from './streetLayerStyle.js';
import type { StreetMode } from './types.js';

function ConditionLegend({ levels }: { levels: string[] | null }) {
  const visible = STREET_CONDITION_LEVELS.filter(
    (level) => levels === null || levels.includes(level.value),
  );
  return (
    <section aria-label="Leyenda de estado de calles">
      <h3>Estado de la calle</h3>
      <div
        className="map-layer-legend__ramp"
        style={{
          background: `linear-gradient(to right, ${SCORE_RAMP_STOPS.map(([score, color]) => `${color} ${score}%`).join(', ')})`,
        }}
        aria-hidden="true"
      />
      <div className="map-layer-legend__ramp-labels">
        <span>0 · crítico</span>
        <span>100 · excelente</span>
      </div>
      <ul>
        {levels === null && (
          <li>
            <span
              className="map-layer-legend__swatch"
              style={{ background: NO_STREET_CONDITION_COLOR }}
            />
            Sin datos
          </li>
        )}
        {visible.map((level) => (
          <li key={level.value}>
            <span className="map-layer-legend__swatch" style={{ background: level.color }} />
            {level.label} <small>{level.range}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SurfaceLegend({ types }: { types: SurfaceType[] | null }) {
  const visible = SURFACE_TYPE_OPTIONS.filter(
    (item) => types === null || types.includes(item.value),
  );
  return (
    <section aria-label="Leyenda de pavimento">
      <h3>Tipo de pavimento</h3>
      <ul>
        {visible.map((item) => (
          <li key={item.value}>
            <span className="map-layer-legend__swatch" style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
        <li>
          <span
            className="map-layer-legend__swatch"
            style={{ background: NO_STREET_CONDITION_COLOR }}
          />
          Sin informar
        </li>
      </ul>
      <small>Base: © OpenStreetMap (ODbL). La comunidad tiene prioridad.</small>
    </section>
  );
}

/** Leyenda de lo que se está viendo en las calles; cambia con el selector y los filtros. */
export function MapLayerLegend({
  mode,
  levels,
  surfaceTypes,
}: {
  mode: StreetMode;
  levels: string[] | null;
  surfaceTypes: SurfaceType[] | null;
}) {
  return (
    <div className="map-layer-legend" role="region" aria-label="Leyenda del mapa">
      {mode !== 'surface' && <ConditionLegend levels={levels} />}
      {mode !== 'condition' && <SurfaceLegend types={surfaceTypes} />}
      {mode === 'both' && (
        <small className="map-layer-legend__note">
          Centro de la línea: estado · borde: pavimento.
        </small>
      )}
    </div>
  );
}
