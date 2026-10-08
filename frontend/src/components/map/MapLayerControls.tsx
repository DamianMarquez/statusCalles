import { STREET_CONDITION_LEVELS } from './streetConditionCatalog.js';
import { STREET_ROAD_CLASS_OPTIONS } from './streetRoadClassCatalog.js';
import type { StreetRoadClass } from '../../api/streetScoreTypes.js';

interface Props {
  reports: boolean;
  condition: boolean;
  levels: string[] | null;
  roadClasses: StreetRoadClass[];
  onReportsChange: (value: boolean) => void;
  onConditionChange: (value: boolean) => void;
  onLevelsChange: (value: string[] | null) => void;
  onRoadClassesChange: (value: StreetRoadClass[]) => void;
}

export function MapLayerControls(props: Props) {
  function toggleLevel(value: string) {
    const selected =
      props.levels === null ? STREET_CONDITION_LEVELS.map((item) => item.value) : props.levels;
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    props.onLevelsChange(next.length === STREET_CONDITION_LEVELS.length ? null : next);
  }

  return (
    <details className="map-layer-controls">
      <summary>Capas del mapa</summary>
      <label>
        <input
          type="checkbox"
          checked={props.reports}
          onChange={(event) => props.onReportsChange(event.target.checked)}
        />{' '}
        Reportes
      </label>
      <label>
        <input
          type="checkbox"
          checked={props.condition}
          onChange={(event) => props.onConditionChange(event.target.checked)}
        />{' '}
        Estado de calles
      </label>
      <fieldset disabled={!props.condition}>
        <legend>Jerarquía vial</legend>
        {STREET_ROAD_CLASS_OPTIONS.map((item) => (
          <label key={item.value}>
            <input
              type="checkbox"
              checked={props.roadClasses.includes(item.value)}
              onChange={() => {
                const next = props.roadClasses.includes(item.value)
                  ? props.roadClasses.filter((value) => value !== item.value)
                  : [...props.roadClasses, item.value];
                props.onRoadClassesChange(next);
              }}
            />{' '}
            {item.label}
          </label>
        ))}
      </fieldset>
      <fieldset disabled={!props.condition}>
        <legend>Niveles de condición</legend>
        {STREET_CONDITION_LEVELS.map((item) => (
          <label key={item.value}>
            <input
              type="checkbox"
              checked={props.levels === null || props.levels.includes(item.value)}
              onChange={() => toggleLevel(item.value)}
            />{' '}
            <span className="map-layer-controls__swatch" style={{ background: item.color }} />{' '}
            {item.label}
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={props.levels === null}
            onChange={() => props.onLevelsChange(props.levels === null ? [] : null)}
          />{' '}
          Sin filtro de nivel
        </label>
      </fieldset>
    </details>
  );
}
