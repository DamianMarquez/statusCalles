import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapLayerControls } from './MapLayerControls.js';

describe('MapLayerControls', () => {
  it('toggles report and condition layers independently', () => {
    const onReportsChange = vi.fn();
    const onConditionChange = vi.fn();
    render(
      <MapLayerControls
        reports
        condition
        levels={[]}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        onReportsChange={onReportsChange}
        onConditionChange={onConditionChange}
        onLevelsChange={vi.fn()}
        onRoadClassesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Reportes'));
    expect(onReportsChange).toHaveBeenCalledWith(false);
    expect(onConditionChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Estado de calles'));
    expect(onConditionChange).toHaveBeenCalledWith(false);
    expect(onReportsChange).toHaveBeenCalledTimes(1);
  });

  it('exposes all seven condition choices and lets the user filter them', () => {
    const onLevelsChange = vi.fn();
    render(
      <MapLayerControls
        reports
        condition
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        onReportsChange={vi.fn()}
        onConditionChange={vi.fn()}
        onLevelsChange={onLevelsChange}
        onRoadClassesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Capas del mapa'));
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
        condition
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        onReportsChange={vi.fn()}
        onConditionChange={vi.fn()}
        onLevelsChange={onLevelsChange}
        onRoadClassesChange={onRoadClassesChange}
      />,
    );
    fireEvent.click(screen.getByText('Capas del mapa'));
    fireEvent.click(screen.getByLabelText('Arterias principales'));
    expect(onRoadClassesChange).toHaveBeenCalledWith(['SECONDARY', 'LOCAL']);
    expect(onLevelsChange).not.toHaveBeenCalled();
  });

  it('toggles the surface overlay and its filters without changing report filters', () => {
    const onSurfaceChange = vi.fn();
    const onSurfaceTypesChange = vi.fn();
    const onLevelsChange = vi.fn();
    const onReportsChange = vi.fn();
    render(
      <MapLayerControls
        reports
        condition
        surface
        levels={null}
        roadClasses={['PRIMARY', 'SECONDARY', 'LOCAL']}
        surfaceTypes={null}
        surfaceConditions={null}
        surfaceTreatments={null}
        onReportsChange={onReportsChange}
        onConditionChange={vi.fn()}
        onSurfaceChange={onSurfaceChange}
        onLevelsChange={onLevelsChange}
        onRoadClassesChange={vi.fn()}
        onSurfaceTypesChange={onSurfaceTypesChange}
        onSurfaceConditionsChange={vi.fn()}
        onSurfaceTreatmentsChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Capas del mapa'));
    fireEvent.click(screen.getByLabelText('Tipo de pavimento'));
    expect(onSurfaceChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByLabelText('Adoquín de granito'));
    expect(onSurfaceTypesChange).toHaveBeenCalledWith(
      expect.not.arrayContaining(['GRANITE_COBBLESTONE']),
    );
    expect(onLevelsChange).not.toHaveBeenCalled();
    expect(onReportsChange).not.toHaveBeenCalled();
  });
});
afterEach(() => cleanup());
