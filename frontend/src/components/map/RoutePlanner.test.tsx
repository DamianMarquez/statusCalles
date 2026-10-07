import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRoute } from '../../api/routingApi.js';
import type { CalculatedRoute } from '../../api/routingApi.js';
import { searchAddresses } from '../../api/addressesApi.js';
import type { AddressSearchResult } from '../../api/addressesApi.js';
import { RoutePlanner } from './RoutePlanner.js';
import type { UserLocation } from './types.js';

vi.mock('../../api/routingApi.js', () => ({ calculateRoute: vi.fn() }));
vi.mock('../../api/addressesApi.js', () => ({ searchAddresses: vi.fn() }));

const originAddress: AddressSearchResult = {
  id: 'orig',
  type: 'STREET_NUMBER',
  displayName: 'Av. Corrientes 1234, CABA',
  street: 'Av. Corrientes',
  streetCode: '3174',
  streetNumber: 1234,
  intersectionStreet: null,
  intersectionStreetCode: null,
  latitude: -34.6037,
  longitude: -58.3816,
  neighborhood: 'Almagro',
  commune: 'CABA',
  confidence: null,
  source: 'USIG',
};
const destinationAddress: AddressSearchResult = {
  id: 'dest',
  type: 'INTERSECTION',
  displayName: 'Av. Corrientes y Av. Callao, CABA',
  street: 'Av. Corrientes',
  streetCode: '3174',
  streetNumber: null,
  intersectionStreet: 'Av. Callao',
  intersectionStreetCode: '3030',
  latitude: -34.5895,
  longitude: -58.3974,
  neighborhood: 'Balvanera',
  commune: 'CABA',
  confidence: null,
  source: 'USIG',
};
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
const defaultProps = () => ({
  onRoute: vi.fn(),
  currentLocation: null as UserLocation | null,
  onRequestLocation: vi.fn().mockResolvedValue(null),
  onSelectLocation: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchAddresses).mockImplementation(async (query) =>
    query.toLowerCase().includes('callao') ? [destinationAddress] : [originAddress],
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function selectSuggestion(label: string, query: string, resultName: string) {
  fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value: query } });
  await screen.findByRole('option', { name: new RegExp(resultName) });
  fireEvent.click(screen.getByRole('option', { name: new RegExp(resultName) }));
}

describe('RoutePlanner', () => {
  it('searches and selects an address and an intersection, then sends only their coordinates to routing', async () => {
    vi.mocked(calculateRoute).mockResolvedValue(route);
    const props = defaultProps();
    render(<RoutePlanner {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Cómo llegar/ }));
    await selectSuggestion('Desde', 'Corrientes 1234', 'Corrientes 1234');
    await selectSuggestion('Hasta', 'Corrientes y Callao', 'Corrientes y Av. Callao');
    fireEvent.change(screen.getByLabelText('Preferencia'), {
      target: { value: 'AVOID_BAD_STREETS' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular ruta' }));

    expect(
      await screen.findByText(/Esta ruta atraviesa 2 calles con estado crítico/),
    ).toBeInTheDocument();
    expect(calculateRoute).toHaveBeenCalledWith(
      { latitude: -34.6037, longitude: -58.3816 },
      { latitude: -34.5895, longitude: -58.3974 },
      'AVOID_BAD_STREETS',
    );
    expect(props.onSelectLocation).toHaveBeenCalledWith(
      'destination',
      expect.objectContaining({ type: 'INTERSECTION' }),
    );
    expect(props.onRoute).toHaveBeenCalledWith(route);
  });

  it('debounces typing and does not send a request until there are three characters', async () => {
    vi.useFakeTimers();
    const props = defaultProps();
    render(<RoutePlanner {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Cómo llegar/ }));
    const input = screen.getByRole('combobox', { name: 'Hasta' });
    fireEvent.change(input, { target: { value: 'co' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(searchAddresses).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'corrientes' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(searchAddresses).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(searchAddresses).toHaveBeenCalledTimes(1);
    expect(searchAddresses).toHaveBeenCalledWith('corrientes', expect.any(AbortSignal));
    vi.useRealTimers();
  });

  it('swaps selected endpoints without geocoding again and can use current browser location', async () => {
    const props = defaultProps();
    props.currentLocation = { latitude: -34.6, longitude: -58.4 };
    render(<RoutePlanner {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Cómo llegar/ }));
    await selectSuggestion('Hasta', 'Callao y Corrientes', 'Corrientes y Av. Callao');
    fireEvent.click(screen.getByRole('button', { name: 'Intercambiar origen y destino' }));
    expect(screen.getByRole('combobox', { name: 'Desde' })).toHaveValue(
      destinationAddress.displayName,
    );
    expect(searchAddresses).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Usar mi ubicación/ }));
    expect(props.onSelectLocation).toHaveBeenCalledWith(
      'origin',
      expect.objectContaining({ source: 'BROWSER', displayName: 'Mi ubicación' }),
    );
  });

  it('shows provider error and does not send routing without selected results', async () => {
    vi.mocked(searchAddresses).mockRejectedValue(
      new Error('No pudimos buscar la dirección en este momento.'),
    );
    const props = defaultProps();
    render(<RoutePlanner {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Cómo llegar/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Hasta' }), {
      target: { value: 'dirección desconocida' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos buscar la dirección en este momento.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Calcular ruta' }));
    expect(screen.getByText('Buscá y seleccioná un origen y un destino.')).toBeInTheDocument();
    expect(calculateRoute).not.toHaveBeenCalled();
  });
});
