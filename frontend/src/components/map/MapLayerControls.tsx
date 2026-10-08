import { STREET_CONDITION_LEVELS } from './streetConditionCatalog.js';
import { STREET_ROAD_CLASS_OPTIONS } from './streetRoadClassCatalog.js';
import type { StreetRoadClass } from '../../api/streetScoreTypes.js';
import {
  SPECIAL_TREATMENT_OPTIONS,
  SURFACE_CONDITION_OPTIONS,
  SURFACE_TYPE_OPTIONS,
  type SpecialTreatment,
  type SurfaceCondition,
  type SurfaceType,
} from '../../api/roadInformationTypes.js';

interface Props {
  reports: boolean;
  condition: boolean;
  surface?: boolean;
  levels: string[] | null;
  roadClasses: StreetRoadClass[];
  surfaceTypes?: SurfaceType[] | null;
  surfaceConditions?: SurfaceCondition[] | null;
  surfaceTreatments?: SpecialTreatment[] | null;
  onReportsChange: (value: boolean) => void;
  onConditionChange: (value: boolean) => void;
  onSurfaceChange?: (value: boolean) => void;
  onLevelsChange: (value: string[] | null) => void;
  onRoadClassesChange: (value: StreetRoadClass[]) => void;
  onSurfaceTypesChange?: (value: SurfaceType[] | null) => void;
  onSurfaceConditionsChange?: (value: SurfaceCondition[] | null) => void;
  onSurfaceTreatmentsChange?: (value: SpecialTreatment[] | null) => void;
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

  function toggleFilter<T extends string>(
    value: T,
    selected: T[] | null,
    options: readonly { value: T }[],
    onChange: (next: T[] | null) => void,
  ) {
    const current = selected ?? options.map((item) => item.value);
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    onChange(next.length === options.length ? null : next);
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
          checked={props.surface ?? false}
          onChange={(event) => props.onSurfaceChange?.(event.target.checked)}
        />{' '}
        Tipo de pavimento
      </label>
      <fieldset disabled={!props.surface}>
        <legend>Pavimento</legend>
        {SURFACE_TYPE_OPTIONS.map((item) => (
          <label key={item.value}>
            <input
              type="checkbox"
              checked={props.surfaceTypes == null || props.surfaceTypes.includes(item.value)}
              onChange={() =>
                props.onSurfaceTypesChange &&
                toggleFilter(
                  item.value,
                  props.surfaceTypes ?? null,
                  SURFACE_TYPE_OPTIONS,
                  props.onSurfaceTypesChange,
                )
              }
            />{' '}
            {item.label}
          </label>
        ))}
      </fieldset>
      <fieldset disabled={!props.surface}>
        <legend>Estado de calzada</legend>
        {SURFACE_CONDITION_OPTIONS.map((item) => (
          <label key={item.value}>
            <input
              type="checkbox"
              checked={
                props.surfaceConditions == null || props.surfaceConditions.includes(item.value)
              }
              onChange={() =>
                props.onSurfaceConditionsChange &&
                toggleFilter(
                  item.value,
                  props.surfaceConditions ?? null,
                  SURFACE_CONDITION_OPTIONS,
                  props.onSurfaceConditionsChange,
                )
              }
            />{' '}
            {item.label}
          </label>
        ))}
      </fieldset>
      <fieldset disabled={!props.surface}>
        <legend>Tratamientos</legend>
        {SPECIAL_TREATMENT_OPTIONS.map((item) => (
          <label key={item.value}>
            <input
              type="checkbox"
              checked={
                props.surfaceTreatments == null || props.surfaceTreatments.includes(item.value)
              }
              onChange={() =>
                props.onSurfaceTreatmentsChange &&
                toggleFilter(
                  item.value,
                  props.surfaceTreatments ?? null,
                  SPECIAL_TREATMENT_OPTIONS,
                  props.onSurfaceTreatmentsChange,
                )
              }
            />{' '}
            {item.label}
          </label>
        ))}
      </fieldset>
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
