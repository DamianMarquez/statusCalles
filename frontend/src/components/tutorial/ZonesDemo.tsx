import { useState } from 'react';
import {
  CRITICAL_CLASSES,
  INTERVENTION_RAMP,
  NO_DATA_ZONE_COLOR,
  ZONE_METRICS,
  type ZoneMetric,
} from '../map/zoneColors.js';
import { SCORE_RAMP_STOPS } from '../map/streetLayerStyle.js';
import { SURFACE_TYPE_OPTIONS } from '../../api/roadInformationTypes.js';

const HELP: Record<ZoneMetric, { what: string; how: string; limit: string }> = {
  condition: {
    what: 'El estado promedio de las calles de la zona.',
    how: 'Promedio del puntaje de los tramos que tienen puntaje, con el mismo degradado que las calles.',
    limit:
      'Solo hay puntaje donde hay reportes. Con menos de 5 tramos con puntaje la zona se ve gris: datos insuficientes.',
  },
  surface: {
    what: 'El pavimento que más predomina.',
    how: 'El tipo con más kilómetros en la zona; el popup muestra el porcentaje y los siguientes tipos.',
    limit:
      'En casi toda la ciudad predomina el asfalto, así que los colores se parecen entre zonas: mirá el desglose.',
  },
  intervention: {
    what: 'Cuánta intervención vial hay: obras, cortes y reductores.',
    how: 'Un índice por cada 10 km que suma obras públicas vigentes y obras o cortes reportados (peso alto) y reductores (peso bajo). Se colorea de menos a más entre las zonas.',
    limit:
      'Compara zonas entre sí, no contra un estándar. Las obras públicas no son cortes de tránsito en vivo.',
  },
  critical: {
    what: 'Si hay reportes críticos de la comunidad.',
    how: 'Cuenta los reportes activos de severidad crítica o alta; las clases son ninguno, 1–2, 3–5 y 6 o más.',
    limit:
      'Cero no significa sin problemas: solo cuenta lo que la comunidad reportó. Por eso conviene mirarlo junto con el estado.',
  },
};

function Scale({ metric }: { metric: ZoneMetric }) {
  if (metric === 'condition')
    return (
      <div className="tutorial-scale">
        <span
          className="tutorial-scale__ramp"
          style={{
            background: `linear-gradient(to right, ${SCORE_RAMP_STOPS.map(([score, color]) => `${color} ${score}%`).join(', ')})`,
          }}
        />
        <small>0 · crítico → 100 · excelente</small>
        <span className="tutorial-chip">
          <span className="tutorial-category-dot" style={{ background: NO_DATA_ZONE_COLOR }} />
          Datos insuficientes
        </span>
      </div>
    );
  if (metric === 'surface')
    return (
      <div className="tutorial-scale tutorial-scale--chips">
        {SURFACE_TYPE_OPTIONS.map((item) => (
          <span className="tutorial-chip" key={item.value}>
            <span className="tutorial-category-dot" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    );
  if (metric === 'intervention')
    return (
      <div className="tutorial-scale">
        <span
          className="tutorial-scale__ramp"
          style={{ background: `linear-gradient(to right, ${INTERVENTION_RAMP.join(', ')})` }}
        />
        <small>menos → más</small>
      </div>
    );
  return (
    <div className="tutorial-scale tutorial-scale--chips">
      {CRITICAL_CLASSES.map((item) => (
        <span className="tutorial-chip" key={item.label}>
          <span className="tutorial-category-dot" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Demostración local: qué significa el color de las zonas según lo que se elija. */
export function ZonesDemo() {
  const [level, setLevel] = useState<'commune' | 'neighborhood'>('commune');
  const [metric, setMetric] = useState<ZoneMetric>('condition');
  const help = HELP[metric];
  return (
    <div className="tutorial-demo">
      <div className="analytics-segmented" role="radiogroup" aria-label="Tipo de zona">
        <button
          type="button"
          role="radio"
          aria-checked={level === 'commune'}
          className={level === 'commune' ? 'is-active' : ''}
          onClick={() => setLevel('commune')}
        >
          Comunas
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={level === 'neighborhood'}
          className={level === 'neighborhood' ? 'is-active' : ''}
          onClick={() => setLevel('neighborhood')}
        >
          Barrios
        </button>
      </div>
      <p>
        {level === 'commune'
          ? 'Las 15 comunas de la Ciudad.'
          : 'Los 48 barrios, para mirar con más detalle.'}
      </p>
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
      <div className="tutorial-zone-help" aria-live="polite">
        <p>
          <strong>Qué muestra:</strong> {help.what}
        </p>
        <p>
          <strong>Cómo se colorea:</strong> {help.how}
        </p>
        <p>
          <strong>Ojo:</strong> {help.limit}
        </p>
        <Scale metric={metric} />
      </div>
      <small>Demostración local · no consulta datos</small>
    </div>
  );
}
