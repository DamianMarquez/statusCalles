import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapLayerControls } from './MapLayerControls.js';

describe('MapLayerControls', () => {
  it('switches what is painted on the streets without touching the reports toggle', () => {
    const onReportsChange = vi.fn();
    const onModeChange = vi.fn();
    render(
      <MapLayerControls
        reports
        mode="condition"
        levels={[]}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        onReportsChange={onReportsChange}
        onModeChange={onModeChange}
        onLevelsChange={vi.fn()}
        onRoadClassesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Reportes'));
    expect(onReportsChange).toHaveBeenCalledWith(false);
    expect(onModeChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Estado' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Pavimento' }));
    expect(onModeChange).toHaveBeenCalledWith('surface');
    fireEvent.click(screen.getByRole('radio', { name: 'Ambos' }));
    expect(onModeChange).toHaveBeenCalledWith('both');
    expect(onReportsChange).toHaveBeenCalledTimes(1);
  });

  it('exposes all seven condition choices and lets the user filter them', () => {
    const onLevelsChange = vi.fn();
    render(
      <MapLayerControls
        reports
        mode="condition"
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        onReportsChange={vi.fn()}
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
        reports
        mode="condition"
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        onReportsChange={vi.fn()}
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
    const onReportsChange = vi.fn();
    render(
      <MapLayerControls
        reports
        mode="both"
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        surfaceTypes={null}
        surfaceConditions={null}
        surfaceTreatments={null}
        onReportsChange={onReportsChange}
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
    expect(onReportsChange).not.toHaveBeenCalled();
  });

  it('shows active advanced filters and clears them without changing visible layers', () => {
    const onLevelsChange = vi.fn();
    const onRoadClassesChange = vi.fn();
    const onSurfaceTypesChange = vi.fn();
    const onReportsChange = vi.fn();
    render(
      <MapLayerControls
        reports
        mode="both"
        levels={['BAD']}
        roadClasses={['PRIMARY']}
        surfaceTypes={[]}
        surfaceConditions={null}
        surfaceTreatments={null}
        onReportsChange={onReportsChange}
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
    expect(onReportsChange).not.toHaveBeenCalled();
  });
});
afterEach(() => cleanup());
