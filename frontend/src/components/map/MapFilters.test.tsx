import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapReportFilters } from '../../api/reportTypes.js';
import { MapFilters } from './MapFilters.js';

const defaults: MapReportFilters = {};
afterEach(() => cleanup());

function open(onApply = vi.fn(), authenticated = true, onRequestLogin = vi.fn()) {
  render(
    <MapFilters
      value={defaults}
      onApply={onApply}
      authenticated={authenticated}
      onRequestLogin={onRequestLogin}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '☷ Filtros' }));
  return { onApply, onRequestLogin };
}

describe('MapFilters', () => {
  it('opens and applies multiple report types without sending per-checkbox requests', () => {
    const { onApply } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    fireEvent.click(screen.getByText('Bache'));
    fireEvent.click(screen.getByText('Inundación'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledWith({ types: ['POTHOLE', 'FLOOD'] });
  });

  it('selects a server-relative period and filters statuses as a combined category', () => {
    const { onApply } = open();
    fireEvent.change(screen.getByLabelText('Antigüedad'), { target: { value: '7d' } });
    fireEvent.click(screen.getByText('Resueltos'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onApply).toHaveBeenCalledWith({ period: '7d', statuses: ['ACTIVE', 'STALE'] });
  });

  it('validates custom date range before applying', () => {
    const { onApply } = open();
    fireEvent.change(screen.getByLabelText('Antigüedad'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-07' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha inicial debe ser anterior');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('uses CABA local dates for a valid custom range', () => {
    const { onApply } = open();
    fireEvent.change(screen.getByLabelText('Antigüedad'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-07' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onApply).toHaveBeenCalledWith({
      fromDate: '2026-10-01T03:00:00.000Z',
      toDate: '2026-10-08T02:59:59.999Z',
    });
  });

  it('restores custom date inputs in Argentina local time from URL instants', () => {
    render(
      <MapFilters
        value={{ fromDate: '2026-10-01T03:00:00.000Z', toDate: '2026-10-08T02:59:59.999Z' }}
        onApply={vi.fn()}
        authenticated
        onRequestLogin={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-07');
  });

  it('clears filters and requires login before applying onlyMine', () => {
    const { onApply, onRequestLogin } = open(vi.fn(), false, vi.fn());
    fireEvent.click(screen.getByLabelText('Solo mis reportes'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onRequestLogin).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onApply).toHaveBeenCalledWith({});
  });
});
