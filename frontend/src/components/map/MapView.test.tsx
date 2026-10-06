import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportDto } from '../../api/reportTypes.js';
import MapView from './MapView.js';

const { getReportsInViewport } = vi.hoisted(() => ({ getReportsInViewport: vi.fn() }));

vi.mock('../../api/reportsApi.js', () => ({ getReportsInViewport }));
vi.mock('leaflet', () => ({
  divIcon: (options: unknown) => options,
}));
vi.mock('react-leaflet', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const map = {
    getBounds: () => ({
      getSouth: () => -34.7,
      getNorth: () => -34.5,
      getWest: () => -58.5,
      getEast: () => -58.3,
    }),
    getZoom: () => 13,
    setView: vi.fn(),
  };
  return {
    MapContainer: ({ children }: React.PropsWithChildren) =>
      React.createElement('div', { 'data-testid': 'map' }, children),
    Marker: ({ children }: React.PropsWithChildren) =>
      React.createElement('div', { 'data-testid': 'marker' }, children),
    Popup: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
    TileLayer: () => null,
    useMap: () => map,
    useMapEvents: () => map,
  };
});

const report: ReportDto = {
  id: 'report-1',
  type: 'POTHOLE',
  severity: 'HIGH',
  description: 'Bache grande sobre el carril derecho',
  location: { latitude: -34.6037, longitude: -58.3816 },
  status: 'ACTIVE',
  createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('MapView reports', () => {
  it('loads reports for the map viewport and renders their marker popup', async () => {
    getReportsInViewport.mockResolvedValue([report]);

    render(<MapView />);

    expect(screen.getByText('Cargando reportes…')).toBeInTheDocument();
    await waitFor(() =>
      expect(getReportsInViewport).toHaveBeenCalledWith(
        { south: -34.7, north: -34.5, west: -58.5, east: -58.3 },
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText('1 reporte en esta zona.')).toBeInTheDocument();
    const marker = screen.getByTestId('marker');
    expect(marker).toBeInTheDocument();
    expect(within(marker).getByText('BACHE')).toBeInTheDocument();
    expect(marker.querySelector('.report-popup__severity')).toHaveTextContent('🔴 Alta');
    expect(within(marker).getByText('Bache grande sobre el carril derecho')).toBeInTheDocument();
    expect(within(marker).getByText('Estado: Activo')).toBeInTheDocument();
    expect(within(marker).getByText('Reportado: hace 12 minutos')).toBeInTheDocument();
  });

  it('shows a friendly error while keeping the map available', async () => {
    getReportsInViewport.mockRejectedValue(new Error('offline'));

    render(<MapView />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos actualizar los reportes.',
    );
    expect(screen.getByTestId('map')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
