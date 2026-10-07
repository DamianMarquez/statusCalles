import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRoute } from '../../api/routingApi.js';
import type { CalculatedRoute } from '../../api/routingApi.js';
import { RoutePlanner } from './RoutePlanner.js';

vi.mock('../../api/routingApi.js', () => ({ calculateRoute: vi.fn() }));

const route: CalculatedRoute = {
  route: {
    type: 'LineString',
    coordinates: [
      [-58.3816, -34.6037],
      [-58.3974, -34.5895],
    ],
  },
  distanceMeters: 2400,
  durationSeconds: 480,
  warnings: ['Esta ruta atraviesa 2 calles con estado crítico.'],
  affectedSegments: [],
  option: 'AVOID_BAD_STREETS',
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('RoutePlanner', () => {
  it('validates coordinates before requesting a route', () => {
    render(<RoutePlanner onRoute={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Cómo llegar/ }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: 'Buenos Aires' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '-34.5895, -58.3974' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular ruta' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ingresá cada ubicación como latitud, longitud.',
    );
    expect(calculateRoute).not.toHaveBeenCalled();
  });

  it('sends coordinates and preference then shows the route warning', async () => {
    vi.mocked(calculateRoute).mockResolvedValue(route);
    const onRoute = vi.fn();
    render(<RoutePlanner onRoute={onRoute} />);
    fireEvent.click(screen.getByRole('button', { name: /Cómo llegar/ }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '-34.6037, -58.3816' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '-34.5895, -58.3974' } });
    fireEvent.change(screen.getByLabelText('Preferencia'), {
      target: { value: 'AVOID_BAD_STREETS' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular ruta' }));

    expect(
      await screen.findByText(/Esta ruta atraviesa 2 calles con estado crítico/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ruta calculada según los criterios seleccionados'),
    ).toBeInTheDocument();
    expect(calculateRoute).toHaveBeenCalledWith(
      { latitude: -34.6037, longitude: -58.3816 },
      { latitude: -34.5895, longitude: -58.3974 },
      'AVOID_BAD_STREETS',
    );
    expect(onRoute).toHaveBeenCalledWith(route);
  });

  it('shows a provider error without drawing a route', async () => {
    vi.mocked(calculateRoute).mockRejectedValue(
      new Error('El proveedor de rutas no está disponible.'),
    );
    const onRoute = vi.fn();
    render(<RoutePlanner onRoute={onRoute} />);
    fireEvent.click(screen.getByRole('button', { name: /Cómo llegar/ }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '-34.6037, -58.3816' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '-34.5895, -58.3974' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular ruta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El proveedor de rutas no está disponible.',
    );
    expect(onRoute).toHaveBeenCalledWith(null);
  });
});
