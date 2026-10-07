import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnalyticsDashboard } from '../../api/analyticsApi.js';
import { AnalyticsDashboard } from './AnalyticsDashboard.js';

vi.mock('../../api/analyticsApi.js', () => ({ getAnalyticsDashboard: vi.fn() }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div aria-label="Mapa de concentración">{children}</div>
  ),
  TileLayer: () => <span>OpenStreetMap</span>,
  CircleMarker: () => null,
  Popup: () => null,
}));

const payload = {
  overview: {
    total: 123,
    active: 42,
    resolved: 31,
    stale: 50,
    average_resolution_hours: 36,
    confirmed: 70,
    confirmed_percent: 56.9,
    stale_percent: 40.7,
  },
  reports: {
    byType: [
      { type: 'POTHOLE', count: 90 },
      { type: 'FLOOD', count: 33 },
    ],
    bySeverity: [
      { severity: 3, count: 18 },
      { severity: 4, count: 5 },
    ],
  },
  neighborhoods: [
    {
      id: 1,
      name: 'Palermo',
      communeId: 14,
      communeName: 'Comuna 14',
      reports: 30,
      active: 12,
      resolved: 7,
    },
  ],
  communes: [
    {
      id: 14,
      name: 'Comuna 14',
      communeId: 14,
      communeName: 'Comuna 14',
      reports: 45,
      active: 20,
      resolved: 12,
    },
  ],
  trends: [
    { period: '2026-09-01T00:00:00.000Z', reports: 12, high_severity: 4, resolved: 3 },
    { period: '2026-09-08T00:00:00.000Z', reports: 16, high_severity: 3, resolved: 8 },
  ],
  streets: [
    {
      id: 'street-1',
      officialName: 'Avenida Ejemplo',
      reports: 20,
      score: { score: 42, level: 'BAD' },
    },
  ],
  segments: [
    {
      id: 'segment-1',
      officialName: 'Avenida Ejemplo',
      reports: 5,
      score: { score: 28, level: 'VERY_BAD' },
    },
  ],
  heatmap: [{ latitude: -34.6, longitude: -58.4, reports: 6, active: 4, high_severity: 2 }],
  official: {
    infrastructure: [{ type: 'BIKE_LANE', count: 10 }],
    sources: [
      {
        slug: 'streets',
        name: 'Calles',
        status: 'SUCCESS',
        lastSyncAt: '2026-09-01T00:00:00.000Z',
        lastRecordCount: 100,
      },
    ],
    realtime_traffic_available: false,
  },
};

describe('AnalyticsDashboard', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(getAnalyticsDashboard).mockClear();
    vi.mocked(getAnalyticsDashboard).mockResolvedValue(payload);
  });

  it('loads aggregate metrics, distributions, geography, scores, and official source status', async () => {
    render(<AnalyticsDashboard />);
    expect(await screen.findByText('123')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('Palermo')).toBeInTheDocument();
    expect(screen.getAllByText('Avenida Ejemplo')).toHaveLength(2);
    expect(screen.getByText('Infraestructura cargada')).toBeInTheDocument();
    expect(screen.getByText(/no disponibles/)).toBeInTheDocument();
    expect(screen.getByText('OpenStreetMap')).toBeInTheDocument();
  });

  it('reloads the analytics after changing the time range', async () => {
    render(<AnalyticsDashboard />);
    await screen.findByText('123');
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '30' } });
    await waitFor(() => expect(getAnalyticsDashboard).toHaveBeenCalledTimes(2));
    expect(vi.mocked(getAnalyticsDashboard).mock.calls[1]![0].from).toBeTypeOf('string');
  });

  it('shows a friendly load error', async () => {
    vi.mocked(getAnalyticsDashboard).mockRejectedValueOnce(
      new Error('No pudimos cargar los datos.'),
    );
    render(<AnalyticsDashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los datos.');
  });
});
