import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportDto } from '../../api/reportTypes.js';
import MapView from './MapView.js';
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext.js';

const mocks = vi.hoisted(() => ({
  getReportsInViewport: vi.fn(),
  createReport: vi.fn(),
  submitReportFeedback: vi.fn(),
  calculateRoute: vi.fn(),
  searchAddresses: vi.fn(),
  mapEvents: {} as Record<string, (event: { latlng: { lat: number; lng: number } }) => void>,
  map: {
    getBounds: () => ({
      getSouth: () => -34.7,
      getNorth: () => -34.5,
      getWest: () => -58.5,
      getEast: () => -58.3,
    }),
    getZoom: () => 13,
    setView: vi.fn(),
    fitBounds: vi.fn(),
  },
}));

vi.mock('../../api/reportsApi.js', () => ({
  getReportsInViewport: mocks.getReportsInViewport,
  createReport: mocks.createReport,
  submitReportFeedback: mocks.submitReportFeedback,
}));
vi.mock('../../api/routingApi.js', () => ({ calculateRoute: mocks.calculateRoute }));
vi.mock('../../api/addressesApi.js', () => ({ searchAddresses: mocks.searchAddresses }));
vi.mock('leaflet', () => ({
  divIcon: (options: unknown) => options,
}));
vi.mock('react-leaflet', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    MapContainer: ({ children }: React.PropsWithChildren) =>
      React.createElement(
        'div',
        {
          'data-testid': 'map',
          onClick: () => mocks.mapEvents.click?.({ latlng: { lat: -34.6037, lng: -58.3816 } }),
        },
        children,
      ),
    Marker: ({ children }: React.PropsWithChildren) =>
      React.createElement('div', { 'data-testid': 'marker' }, children),
    Polyline: () => React.createElement('div', { 'data-testid': 'route-line' }),
    Popup: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
    Rectangle: ({ children }: React.PropsWithChildren) =>
      React.createElement('div', null, children),
    TileLayer: () => null,
    useMap: () => mocks.map,
    useMapEvents: (handlers: typeof mocks.mapEvents) => {
      Object.assign(mocks.mapEvents, handlers);
      return mocks.map;
    },
  };
});

const report: ReportDto = {
  id: 'report-1',
  type: 'POTHOLE',
  severity: 'HIGH',
  description: 'Bache grande sobre el carril derecho',
  location: { latitude: -34.6037, longitude: -58.3816 },
  status: 'ACTIVE',
  createdAt: '2026-10-06T11:48:00.000Z',
  updatedAt: '2026-10-06T11:48:00.000Z',
  feedback: { confirmations: 3, resolvedReports: 2, userFeedback: null },
  freshness: {
    level: 'FRESH',
    confidence: 70,
    lastActivityAt: '2026-10-06T11:48:00.000Z',
    evaluatedAt: '2026-10-06T12:00:00.000Z',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getReportsInViewport.mockResolvedValue({ items: [], hasMore: false });
  mocks.searchAddresses.mockImplementation(async (query: string) => [
    {
      id: query.toLowerCase().includes('corrientes') ? 'origin' : 'destination',
      type: 'STREET_NUMBER',
      displayName: query.toLowerCase().includes('corrientes')
        ? 'Av. Corrientes 1234, CABA'
        : 'Av. Santa Fe 1500, CABA',
      street: query.toLowerCase().includes('corrientes') ? 'Av. Corrientes' : 'Av. Santa Fe',
      streetCode: '3174',
      streetNumber: 1234,
      intersectionStreet: null,
      intersectionStreetCode: null,
      latitude: query.toLowerCase().includes('corrientes') ? -34.6037 : -34.5895,
      longitude: query.toLowerCase().includes('corrientes') ? -58.3816 : -58.3974,
      neighborhood: 'CABA',
      commune: 'CABA',
      confidence: null,
      source: 'USIG',
    },
  ]);
  mocks.mapEvents = {};
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

async function selectReportLocation() {
  fireEvent.click(screen.getByRole('button', { name: '+ Reportar problema' }));
  expect(screen.getByText('Elegí la ubicación del problema')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('map'));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
}

function renderAuthenticatedMap() {
  const authValue: AuthContextValue = {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'User',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    profile: null,
    loading: false,
    dialogOpen: false,
    openAuthDialog: vi.fn(),
    closeAuthDialog: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <MapView />
    </AuthContext.Provider>,
  );
}

describe('MapView report creation', () => {
  it('opens the form after choosing a location on the map', async () => {
    renderAuthenticatedMap();
    await selectReportLocation();

    expect(screen.getByText('-34.60370, -58.38160')).toBeInTheDocument();
    expect(screen.getAllByText('Ubicación seleccionada')).toHaveLength(2);
  });

  it('validates required fields before sending', async () => {
    renderAuthenticatedMap();
    await selectReportLocation();

    const form = screen.getByRole('dialog').querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(mocks.createReport).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tipo de problema')).toBeRequired();
    expect(screen.getByLabelText('Severidad')).toBeRequired();
  });

  it('creates a report, immediately adds its marker, centers the map, and confirms success', async () => {
    mocks.createReport.mockResolvedValue(report);
    render(<MapView />);
    await selectReportLocation();

    fireEvent.change(screen.getByLabelText('Tipo de problema'), { target: { value: 'POTHOLE' } });
    fireEvent.change(screen.getByLabelText('Severidad'), { target: { value: 'HIGH' } });
    fireEvent.change(screen.getByLabelText(/Descripción/), {
      target: { value: 'Bache grande sobre el carril derecho' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(
      await screen.findByText('Reporte enviado. Gracias por ayudar a mejorar las calles.'),
    ).toBeInTheDocument();
    expect(mocks.createReport).toHaveBeenCalledWith({
      type: 'POTHOLE',
      severity: 'HIGH',
      description: 'Bache grande sobre el carril derecho',
      latitude: -34.6037,
      longitude: -58.3816,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
    expect(
      await screen.findByText(/Mostrando todos los reportes disponibles · 1 en esta zona/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.map.setView).toHaveBeenCalledWith([-34.6037, -58.3816], 16, { animate: true }),
    );
  });

  it('shows a backend error and lets the user keep editing the report', async () => {
    mocks.createReport.mockRejectedValue(
      new Error('No pudimos enviar el reporte. Intentá de nuevo.'),
    );
    render(<MapView />);
    await selectReportLocation();
    fireEvent.change(screen.getByLabelText('Tipo de problema'), { target: { value: 'FLOOD' } });
    fireEvent.change(screen.getByLabelText('Severidad'), { target: { value: 'MEDIUM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos enviar el reporte.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByLabelText('Tipo de problema')).toHaveValue(
      'FLOOD',
    );
  });

  it('shows a loading state while the report is being sent', async () => {
    mocks.createReport.mockReturnValue(new Promise<ReportDto>(() => {}));
    render(<MapView />);
    await selectReportLocation();
    fireEvent.change(screen.getByLabelText('Tipo de problema'), { target: { value: 'OTHER' } });
    fireEvent.change(screen.getByLabelText('Severidad'), { target: { value: 'LOW' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));

    expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar formulario' })).toBeDisabled();
  });

  it('updates feedback counts immediately after voting on a report', async () => {
    mocks.getReportsInViewport.mockResolvedValue({ items: [report], hasMore: false });
    mocks.submitReportFeedback.mockResolvedValue({
      ...report,
      feedback: { confirmations: 4, resolvedReports: 2, userFeedback: 'CONFIRM' },
      freshness: { ...report.freshness, confidence: 82 },
    });
    renderAuthenticatedMap();

    const confirmButton = await screen.findByRole('button', { name: /Sigue existiendo/ });
    fireEvent.click(confirmButton);

    expect(confirmButton).toHaveTextContent('4');
    expect(await screen.findByRole('button', { name: /Sigue existiendo/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(mocks.submitReportFeedback).toHaveBeenCalledWith('report-1', 'CONFIRM');
  });

  it('keeps the map visible after report loading fails and retries the same filters', async () => {
    mocks.getReportsInViewport.mockRejectedValueOnce(new Error('network failure'));
    render(<MapView />);
    expect(await screen.findByText('No pudimos actualizar los reportes.')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay reportes en esta zona.')).toBeInTheDocument();
  });

  it('restores the current vote and shows an error if feedback is rejected', async () => {
    mocks.getReportsInViewport.mockResolvedValue({ items: [report], hasMore: false });
    mocks.submitReportFeedback.mockRejectedValue(new Error('No pudimos registrar tu respuesta.'));
    renderAuthenticatedMap();

    fireEvent.click(await screen.findByRole('button', { name: /Ya no existe/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos registrar tu respuesta.',
    );
    expect(screen.getByRole('button', { name: /Ya no existe/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Sigue existiendo/ })).toHaveTextContent('3');
  });

  it('renders the calculated route on Leaflet and fits the map to it', async () => {
    mocks.calculateRoute.mockResolvedValue({
      route: {
        type: 'LineString',
        coordinates: [
          [-58.3816, -34.6037],
          [-58.3974, -34.5895],
        ],
      },
      distanceMeters: 2400,
      durationSeconds: 480,
      warnings: ['Esta ruta atraviesa 2 tramos con señales de deterioro.'],
      affectedSegments: [],
      option: 'FASTEST',
    });
    render(<MapView />);
    fireEvent.click(screen.getByRole('button', { name: /Cómo llegar/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Desde' }), {
      target: { value: 'Corrientes 1234' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /Av. Corrientes 1234/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Hasta' }), {
      target: { value: 'Santa Fe 1500' },
    });
    fireEvent.click(await screen.findByRole('option', { name: /Av. Santa Fe 1500/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Calcular ruta' }));

    expect(await screen.findByTestId('route-line')).toBeInTheDocument();
    expect(await screen.findByText(/Esta ruta atraviesa 2 tramos/)).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.map.fitBounds).toHaveBeenCalledWith(
        [
          [-34.6037, -58.3816],
          [-34.5895, -58.3974],
        ],
        { padding: [44, 44], maxZoom: 17 },
      ),
    );
  });
});
