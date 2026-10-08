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
        onReportsChange={onReportsChange}
        onConditionChange={onConditionChange}
        onLevelsChange={vi.fn()}
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
        onReportsChange={vi.fn()}
        onConditionChange={vi.fn()}
        onLevelsChange={onLevelsChange}
      />,
    );
    fireEvent.click(screen.getByText('Capas del mapa'));
    fireEvent.click(screen.getByLabelText('Incómoda'));
    expect(onLevelsChange).toHaveBeenCalledOnce();
    expect(onLevelsChange.mock.calls[0]?.[0]).not.toContain('UNCOMFORTABLE');
    expect(screen.getByLabelText('Crítica')).toBeInTheDocument();
  });
});
afterEach(() => cleanup());
