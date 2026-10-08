import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HowToUse } from './HowToUse.js';

afterEach(() => cleanup());

describe('HowToUse', () => {
  it('shows the real feature guide and explains the score as an estimate', () => {
    render(<HowToUse />);
    expect(screen.getByRole('heading', { name: 'Cómo usar Street Status' })).toBeInTheDocument();
    expect(screen.getByText(/Street Score combina reportes comunitarios/)).toBeInTheDocument();
    expect(screen.getByText(/direcciones e intersecciones/)).toBeInTheDocument();
  });

  it('runs local-only report filters and tutorial steps without writing to the API', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<HowToUse />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Bache/ }));
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'STRONG' && element.textContent === '2 reportes de ejemplo',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver siguiente paso' }));
    expect(screen.getByText('Describí el problema')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
