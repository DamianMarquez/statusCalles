import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportDto } from '../../api/reportTypes.js';
import MapView from './MapView.js';

const mocks = vi.hoisted(() => ({
  getReportsInViewport: vi.fn(),
  createReport: vi.fn(),
  submitReportFeedback: vi.fn(),
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
  },
}));

vi.mock('../../api/reportsApi.js', () => ({
  getReportsInViewport: mocks.getReportsInViewport,
  createReport: mocks.createReport,
  submitReportFeedback: mocks.submitReportFeedback,
}));
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
    Popup: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
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
  mocks.getReportsInViewport.mockResolvedValue([]);
  mocks.mapEvents = {};
});

afterEach(() => cleanup());

async function selectReportLocation() {
  fireEvent.click(screen.getByRole('button', { name: '+ Reportar problema' }));
  expect(screen.getByText('Elegí la ubicación del problema')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('map'));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
}

describe('MapView report creation', () => {
  it('opens the form after choosing a location on the map', async () => {
    render(<MapView />);
    await selectReportLocation();

    expect(screen.getByText('-34.60370, -58.38160')).toBeInTheDocument();
    expect(screen.getAllByText('Ubicación seleccionada')).toHaveLength(2);
  });

  it('validates required fields before sending', async () => {
    render(<MapView />);
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
    expect(await screen.findByText('1 reporte en esta zona.')).toBeInTheDocument();
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
    mocks.getReportsInViewport.mockResolvedValue([report]);
    mocks.submitReportFeedback.mockResolvedValue({
      ...report,
      feedback: { confirmations: 4, resolvedReports: 2, userFeedback: 'CONFIRM' },
      freshness: { ...report.freshness, confidence: 82 },
    });
    render(<MapView />);

    const confirmButton = await screen.findByRole('button', { name: /Sigue existiendo/ });
    fireEvent.click(confirmButton);

    expect(confirmButton).toHaveTextContent('4');
    expect(await screen.findByRole('button', { name: /Sigue existiendo/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(mocks.submitReportFeedback).toHaveBeenCalledWith('report-1', 'CONFIRM');
  });

  it('restores the current vote and shows an error if feedback is rejected', async () => {
    mocks.getReportsInViewport.mockResolvedValue([report]);
    mocks.submitReportFeedback.mockRejectedValue(new Error('No pudimos registrar tu respuesta.'));
    render(<MapView />);

    fireEvent.click(await screen.findByRole('button', { name: /Ya no existe/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos registrar tu respuesta.',
    );
    expect(screen.getByRole('button', { name: /Ya no existe/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Sigue existiendo/ })).toHaveTextContent('3');
  });
});
