import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HowToUse } from './HowToUse.js';

afterEach(() => cleanup());

describe('HowToUse', () => {
  it('shows the real feature guide and explains the score as an estimate', () => {
    render(<HowToUse />);
    expect(screen.getByRole('heading', { name: 'Cómo usar Street Status' })).toBeInTheDocument();
    expect(screen.getByText(/La condición física se calcula con baches/)).toBeInTheDocument();
    expect(screen.getByText(/no constituye consejo de seguridad/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Seguimiento de tus aportes' })).toBeInTheDocument();
    expect(screen.queryByText(/evitar calles bloqueadas/)).not.toBeInTheDocument();
  });

  it('runs local-only report filters and tutorial steps without writing to the API', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<HowToUse />);
    const typesFilter = screen.getByRole('group', { name: 'Tipos visibles' });
    fireEvent.click(within(typesFilter).getByRole('checkbox', { name: /Bache/ }));
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

  it('has an index that links to every section', () => {
    render(<HowToUse />);
    const index = screen.getByRole('navigation', { name: 'Índice de la guía' });
    const links = within(index).getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(8);
    for (const link of links) {
      const id = link.getAttribute('href')!.slice(1);
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(screen.queryByText(/verde también puede indicar/)).not.toBeInTheDocument();
  });

  it('switches the street reading between state, pavement and both', () => {
    render(<HowToUse />);
    const group = screen.getByRole('radiogroup', { name: 'Qué mostrar en las calles' });
    expect(screen.getByText(/Gris significa que todavía no hay reportes/)).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('radio', { name: 'Pavimento' }));
    expect(screen.getByText(/toma el color de su tipo de pavimento/)).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('radio', { name: 'Ambos' }));
    expect(screen.getByText(/el borde muestra el pavimento/)).toBeInTheDocument();
  });

  it('turns categories off locally and lists the speed reducer types', () => {
    render(<HowToUse />);
    const box = screen.getByRole('checkbox', { name: /Reductores/ });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(screen.getByRole('list', { name: 'Tipos de reductores' })).toBeInTheDocument();
  });

  it('explains each way of coloring zones, with its limit', () => {
    render(<HowToUse />);
    const group = screen.getByRole('radiogroup', { name: 'Colorear zonas por' });
    expect(screen.getByText(/Datos insuficientes/)).toBeInTheDocument();
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(4);
    fireEvent.click(radios[3]!);
    expect(screen.getByText(/Cero no significa sin problemas/)).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Tipo de zona' })).getByRole('radio', {
        name: 'Barrios',
      }),
    );
    expect(screen.getByText(/48 barrios/)).toBeInTheDocument();
  });

  it('shows sample street and zone popups', () => {
    render(<HowToUse />);
    expect(screen.getByText('Calle de ejemplo')).toBeInTheDocument();
    expect(screen.getByText('Al tocar una zona')).toBeInTheDocument();
  });
});
