import { useState } from 'react';
import { SURFACE_TYPE_OPTIONS } from '../../api/roadInformationTypes.js';
import { NO_STREET_CONDITION_COLOR } from '../map/streetConditionCatalog.js';
import { scoreRampColor, surfaceColor } from '../map/zoneColors.js';

type Mode = 'condition' | 'surface' | 'both';

const MODES: ReadonlyArray<{ value: Mode; label: string; text: string }> = [
  {
    value: 'condition',
    label: 'Estado',
    text: 'Cada calle se pinta del rojo al verde según su puntaje de 0 a 100. Gris significa que todavía no hay reportes suficientes para calcularlo.',
  },
  {
    value: 'surface',
    label: 'Pavimento',
    text: 'Cada calle toma el color de su tipo de pavimento: asfalto, hormigón, adoquín, intertrabado, etc. Parte de una base de OpenStreetMap y la comunidad puede corregirla.',
  },
  {
    value: 'both',
    label: 'Ambos',
    text: 'El centro de la línea muestra el estado y el borde muestra el pavimento, para leer las dos cosas a la vez.',
  },
];

const EXAMPLE_STREETS = [
  { name: 'Av. de ejemplo A', score: 38, surface: 'CONCRETE' },
  { name: 'Calle de ejemplo B', score: 72, surface: 'ASPHALT' },
  { name: 'Pasaje de ejemplo C', score: null, surface: 'GRANITE_COBBLESTONE' },
] as const;

function Street({ mode, score, surface }: { mode: Mode; score: number | null; surface: string }) {
  const state = score === null ? NO_STREET_CONDITION_COLOR : scoreRampColor(score);
  const pavement = surfaceColor(surface);
  const outer = mode === 'surface' ? pavement : mode === 'both' ? pavement : state;
  const inner = mode === 'both' ? state : null;
  return (
    <span className="tutorial-street" style={{ background: outer }} aria-hidden="true">
      {inner && <span style={{ background: inner }} />}
    </span>
  );
}

/** Demostración local del selector de calles (Estado, Pavimento o Ambos). */
export function StreetModesDemo() {
  const [mode, setMode] = useState<Mode>('condition');
  const current = MODES.find((item) => item.value === mode)!;
  return (
    <div className="tutorial-demo">
      <div className="analytics-segmented" role="radiogroup" aria-label="Qué mostrar en las calles">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={mode === item.value}
            className={mode === item.value ? 'is-active' : ''}
            onClick={() => setMode(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ul className="tutorial-street-list" aria-label="Ejemplo de calles">
        {EXAMPLE_STREETS.map((street) => (
          <li key={street.name}>
            <span>{street.name}</span>
            <Street mode={mode} score={street.score} surface={street.surface} />
            <small>
              {mode !== 'surface' && (street.score === null ? 'Sin datos' : `${street.score}/100`)}
              {mode === 'both' && ' · '}
              {mode !== 'condition' &&
                (SURFACE_TYPE_OPTIONS.find((item) => item.value === street.surface)?.label ?? '')}
            </small>
          </li>
        ))}
      </ul>
      <p aria-live="polite">{current.text}</p>
      <small>Vista ilustrativa · datos de ejemplo</small>
    </div>
  );
}
