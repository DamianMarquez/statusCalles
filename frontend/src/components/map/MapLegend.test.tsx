import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapLegend } from './MapLegend.js';

afterEach(() => cleanup());

describe('MapLegend', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<MapLegend open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows map references and closes with Escape', () => {
    const onClose = vi.fn();
    render(<MapLegend open onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Referencias del mapa' })).toBeInTheDocument();
    expect(screen.getByText('Condición física de las calles')).toBeInTheDocument();
    expect(screen.getByText('Buena por defecto · sin score calculado')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes from its accessible close button', () => {
    const onClose = vi.fn();
    render(<MapLegend open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar leyenda' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
