import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapLayerControls } from './MapLayerControls.js';
import { ALL_MAP_CATEGORIES } from './mapCategories.js';

describe('MapLayerControls', () => {
  it('toggles each map category independently from what is painted on the streets', () => {
    const onCategoriesChange = vi.fn();
    const onModeChange = vi.fn();
    render(
      <MapLayerControls
        categories={ALL_MAP_CATEGORIES}
        mode="condition"
        levels={[]}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        onCategoriesChange={onCategoriesChange}
        onModeChange={onModeChange}
        onLevelsChange={vi.fn()}
        onRoadClassesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Reductores y badenes'));
    expect(onCategoriesChange).toHaveBeenCalledWith(['works', 'damage', 'other']);
    expect(onModeChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Obras y cortes')).toBeChecked();
    expect(screen.getByLabelText('Baches y daños')).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Estado' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Pavimento' }));
    expect(onModeChange).toHaveBeenCalledWith('surface');
    fireEvent.click(screen.getByRole('radio', { name: 'Ambos' }));
    expect(onModeChange).toHaveBeenCalledWith('both');
    expect(onCategoriesChange).toHaveBeenCalledTimes(1);
  });

  it('turns a category back on keeping the others', () => {
    const onCategoriesChange = vi.fn();
    render(
      <MapLayerControls
        categories={['works']}
        mode="condition"
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        onCategoriesChange={onCategoriesChange}
        onModeChange={vi.fn()}
        onLevelsChange={vi.fn()}
        onRoadClassesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Baches y daños'));
    expect(onCategoriesChange).toHaveBeenCalledWith(['works', 'damage']);
  });

  it('exposes all seven condition choices and lets the user filter them', () => {
    const onLevelsChange = vi.fn();
    render(
      <MapLayerControls
        categories={ALL_MAP_CATEGORIES}
        mode="condition"
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        onCategoriesChange={vi.fn()}
        onModeChange={vi.fn()}
        onLevelsChange={onLevelsChange}
        onRoadClassesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/Más filtros/));
    fireEvent.click(screen.getByLabelText('Incómoda'));
    expect(onLevelsChange).toHaveBeenCalledOnce();
    expect(onLevelsChange.mock.calls[0]?.[0]).not.toContain('UNCOMFORTABLE');
    expect(screen.getByLabelText('Crítica')).toBeInTheDocument();
  });

  it('filters road hierarchy independently from report and condition filters', () => {
    const onRoadClassesChange = vi.fn();
    const onLevelsChange = vi.fn();
    render(
      <MapLayerControls
        categories={ALL_MAP_CATEGORIES}
        mode="condition"
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        onCategoriesChange={vi.fn()}
        onModeChange={vi.fn()}
        onLevelsChange={onLevelsChange}
        onRoadClassesChange={onRoadClassesChange}
      />,
    );
    fireEvent.click(screen.getByText(/Más filtros/));
    fireEvent.click(screen.getByLabelText('Arterias principales'));
    expect(onRoadClassesChange).toHaveBeenCalledWith(['SECONDARY', 'LOCAL']);
    expect(onLevelsChange).not.toHaveBeenCalled();
  });

  it('filters pavement types without changing report filters', () => {
    const onModeChange = vi.fn();
    const onSurfaceTypesChange = vi.fn();
    const onLevelsChange = vi.fn();
    const onCategoriesChange = vi.fn();
    render(
      <MapLayerControls
        categories={ALL_MAP_CATEGORIES}
        mode="both"
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        surfaceTypes={null}
        surfaceConditions={null}
        surfaceTreatments={null}
        onCategoriesChange={onCategoriesChange}
        onModeChange={onModeChange}
        onLevelsChange={onLevelsChange}
        onRoadClassesChange={vi.fn()}
        onSurfaceTypesChange={onSurfaceTypesChange}
        onSurfaceConditionsChange={vi.fn()}
        onSurfaceTreatmentsChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/Más filtros/));
    expect(screen.getByText('Condición del pavimento')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Adoquín de granito'));
    expect(onSurfaceTypesChange).toHaveBeenCalledWith(
      expect.not.arrayContaining(['GRANITE_COBBLESTONE']),
    );
    expect(onLevelsChange).not.toHaveBeenCalled();
    expect(onCategoriesChange).not.toHaveBeenCalled();
  });

  it('shows active advanced filters and clears them without changing visible layers', () => {
    const onLevelsChange = vi.fn();
    const onRoadClassesChange = vi.fn();
    const onSurfaceTypesChange = vi.fn();
    const onCategoriesChange = vi.fn();
    render(
      <MapLayerControls
        categories={ALL_MAP_CATEGORIES}
        mode="both"
        levels={['BAD']}
        roadClasses={['PRIMARY']}
        surfaceTypes={[]}
        surfaceConditions={null}
        surfaceTreatments={null}
        onCategoriesChange={onCategoriesChange}
        onModeChange={vi.fn()}
        onLevelsChange={onLevelsChange}
        onRoadClassesChange={onRoadClassesChange}
        onSurfaceTypesChange={onSurfaceTypesChange}
        onSurfaceConditionsChange={vi.fn()}
        onSurfaceTreatmentsChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Más filtros · 3 activos')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Más filtros · 3 activos'));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onLevelsChange).toHaveBeenCalledWith(null);
    expect(onRoadClassesChange).toHaveBeenCalledWith(['PRIMARY', 'SECONDARY', 'LOCAL']);
    expect(onSurfaceTypesChange).toHaveBeenCalledWith(null);
    expect(onCategoriesChange).not.toHaveBeenCalled();
  });

  it('lets the user pick commune or neighborhood zones and what they are colored by', () => {
    const onZoneSelectionChange = vi.fn();
    const onZoneMetricChange = vi.fn();
    const { rerender } = render(
      <MapLayerControls
        categories={ALL_MAP_CATEGORIES}
        mode="condition"
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        zoneSelection="none"
        zoneMetric="condition"
        onZoneSelectionChange={onZoneSelectionChange}
        onZoneMetricChange={onZoneMetricChange}
        onCategoriesChange={vi.fn()}
        onModeChange={vi.fn()}
        onLevelsChange={vi.fn()}
        onRoadClassesChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('radiogroup', { name: 'Colorear zonas por' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Comunas' }));
    expect(onZoneSelectionChange).toHaveBeenCalledWith('commune');

    rerender(
      <MapLayerControls
        categories={ALL_MAP_CATEGORIES}
        mode="condition"
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        zoneSelection="neighborhood"
        zoneMetric="condition"
        onZoneSelectionChange={onZoneSelectionChange}
        onZoneMetricChange={onZoneMetricChange}
        onCategoriesChange={vi.fn()}
        onModeChange={vi.fn()}
        onLevelsChange={vi.fn()}
        onRoadClassesChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Barrios' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Críticos' }));
    expect(onZoneMetricChange).toHaveBeenCalledWith('critical');
    fireEvent.click(screen.getByRole('radio', { name: 'Obras y reductores' }));
    expect(onZoneMetricChange).toHaveBeenCalledWith('intervention');
  });
});
afterEach(() => cleanup());
