import { useState } from 'react';
import {
  CALMING_TYPES,
  MAP_CATEGORIES,
  PUBLIC_WORK_COLOR,
  type MapCategory,
} from '../map/mapCategories.js';

const DESCRIPTIONS: Record<MapCategory, string> = {
  works:
    'Obras y cortes reportados por la comunidad, más las obras públicas vigentes del Gobierno de la Ciudad (BA Obras). No son cortes de tránsito en vivo: no hay una fuente abierta vigente.',
  damage:
    'Baches, daños de calzada, irregularidades, elevaciones anómalas y hundimientos reportados. Son los que alimentan el estado de las calles.',
  calming:
    'Lomos de burro, badenes, sendas elevadas y otros reductores de velocidad, tomados de OpenStreetMap. La cobertura es colaborativa y puede estar incompleta.',
  other:
    'Inundaciones, semáforos y cualquier otro problema que no entra en las categorías anteriores.',
};

/** Demostración local de las categorías: se encienden y apagan sin consultar datos. */
export function CategoriesDemo() {
  const [active, setActive] = useState<MapCategory[]>(MAP_CATEGORIES.map((item) => item.value));
  function toggle(value: MapCategory) {
    setActive((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }
  return (
    <div className="tutorial-demo">
      <ul className="tutorial-category-grid">
        {MAP_CATEGORIES.map((item) => (
          <li key={item.value} className={active.includes(item.value) ? '' : 'is-off'}>
            <label>
              <input
                type="checkbox"
                checked={active.includes(item.value)}
                onChange={() => toggle(item.value)}
              />
              <span className="tutorial-category-dot" style={{ background: item.color }} />
              <strong>
                <span aria-hidden="true">{item.icon}</span> {item.label}
              </strong>
            </label>
            <p>{DESCRIPTIONS[item.value]}</p>
            {item.value === 'calming' && (
              <ul className="tutorial-calming-types" aria-label="Tipos de reductores">
                {CALMING_TYPES.map((type) => (
                  <li key={type.value}>
                    <span className="tutorial-category-dot" style={{ background: type.color }} />
                    {type.label}
                  </li>
                ))}
              </ul>
            )}
            {item.value === 'works' && (
              <p className="tutorial-category-extra">
                <span className="tutorial-category-dot" style={{ background: PUBLIC_WORK_COLOR }} />
                Punto naranja: obra pública del GCBA.
              </p>
            )}
          </li>
        ))}
      </ul>
      <small>Demostración local · no cambia el mapa real</small>
    </div>
  );
}
