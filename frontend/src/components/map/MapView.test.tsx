import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportDto } from '../../api/reportTypes.js';
import MapView from './MapView.js';
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext.js';

const mocks = vi.hoisted(() => ({
  getReportsInViewport: vi.fn(),
  createReport: vi.fn(),
  submitReportFeedback: vi.fn(),
  focusMap: vi.fn(),
  mapEvents: {} as Record<string, (event: { lat: number; lng: number }) => void>,
  map: {
    getBounds: () => ({
      getSouth: () => -34.7,
      getNorth: () => -34.5,
      getWest: () => -58.5,
      getEast: () => -58.3,
    }),
    getZoom: () => 13,
  },
}));

vi.mock('../../api/reportsApi.js', () => ({
  getReportsInViewport: mocks.getReportsInViewport,
  createReport: mocks.createReport,
  submitReportFeedback: mocks.submitReportFeedback,
}));
vi.mock('./StreetScoreLayer.js', () => ({ StreetScoreLayer: () => null }));
vi.mock('./MapFeaturesLayer.js', () => ({ MapFeaturesLayer: () => null }));
vi.mock('./ZonesLayer.js', () => ({ ZonesLayer: () => null }));
vi.mock('./maplibre/mapLibre.js', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    MapCanvas: ({ children }: React.PropsWithChildren) =>
      React.createElement(
        'div',
        {
          'data-testid': 'map',
          onClick: () => mocks.mapEvents.click?.({ lat: -34.6037, lng: -58.3816 }),
        },
        children,
      ),
    MapMarker: ({ popup }: { popup?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'marker' }, popup),
    MapPopup: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
    focusMap: mocks.focusMap,
    useMapInstance: () => mocks.map,
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
  it('shows the street state by default and lets the user switch to pavement or both', () => {
    render(<MapView />);

    expect(screen.getByRole('radio', { name: 'Estado' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Pavimento' }));
    expect(screen.getByRole('radio', { name: 'Pavimento' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('region', { name: 'Leyenda del mapa' })).toHaveTextContent(
      'Tipo de pavimento',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Ambos' }));
    expect(screen.getByRole('region', { name: 'Leyenda del mapa' })).toHaveTextContent(
      'Estado de la calle',
    );
  });

  it('keeps the map and report flow without showing route planning controls', () => {
    render(<MapView />);

    expect(screen.getByTestId('map')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cómo llegar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Calcular ruta/ })).not.toBeInTheDocument();
  });

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
    await waitFor(() => expect(mocks.focusMap).toHaveBeenCalledWith(mocks.map, -34.6037, -58.3816));
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

  it('hides the community reports of a category when its toggle is turned off', async () => {
    mocks.getReportsInViewport.mockResolvedValue({ items: [report], hasMore: false });
    renderAuthenticatedMap();

    expect(await screen.findAllByTestId('marker')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Obras y cortes'));
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
    // El bache pertenece a "Baches y daños".
    fireEvent.click(screen.getByLabelText('Baches y daños'));
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Baches y daños'));
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
  });

  it('lets the user color communes or neighborhoods and shows the matching legend', () => {
    render(<MapView />);

    expect(
      screen.queryByRole('radiogroup', { name: 'Colorear zonas por' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Comunas' }));
    const zoneMetrics = within(screen.getByRole('radiogroup', { name: 'Colorear zonas por' }));
    fireEvent.click(zoneMetrics.getByRole('radio', { name: 'Pavimento' }));
    expect(screen.getByRole('region', { name: 'Leyenda del mapa' })).toHaveTextContent(
      'Zonas: pavimento predominante',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Críticos' }));
    expect(screen.getByRole('region', { name: 'Leyenda del mapa' })).toHaveTextContent(
      'Zonas: reportes críticos',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Ninguna' }));
    expect(screen.getByRole('region', { name: 'Leyenda del mapa' })).not.toHaveTextContent(
      'Zonas:',
    );
  });
});
