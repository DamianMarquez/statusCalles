import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnalyticsDashboard } from '../../api/analyticsApi.js';
import { getZones } from '../../api/zonesApi.js';
import { makeZoneProperties } from '../../test/zoneFixture.js';
import { AnalyticsDashboard } from './AnalyticsDashboard.js';

vi.mock('../../api/analyticsApi.js', () => ({ getAnalyticsDashboard: vi.fn() }));
vi.mock('../../api/zonesApi.js', () => ({ getZones: vi.fn() }));
vi.mock('./ZoneExplorer.js', () => ({
  ZoneExplorer: () => <div aria-label="Explorador de zonas" />,
}));
vi.mock('./AnalyticsHeatMap.js', () => ({
  AnalyticsHeatMap: () => <div aria-label="Mapa de concentración" />,
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
        status: 'SUCCEEDED',
        lastSyncAt: '2026-09-01T00:00:00.000Z',
        lastRecordCount: 100,
      },
    ],
    realtime_traffic_available: false,
  },
};

const zones = {
  type: 'FeatureCollection' as const,
  features: [1, 2].map((id) => ({
    type: 'Feature' as const,
    id,
    geometry: { type: 'Polygon' as const, coordinates: [] },
    properties: makeZoneProperties(id),
  })),
};

describe('AnalyticsDashboard', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.mocked(getAnalyticsDashboard).mockClear();
    vi.mocked(getAnalyticsDashboard).mockResolvedValue(payload);
    vi.mocked(getZones).mockReset();
    vi.mocked(getZones).mockResolvedValue(zones);
  });

  it('starts on the summary with the report indicators and the city today', async () => {
    render(<AnalyticsDashboard />);
    expect(await screen.findByText('123')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
    const city = await screen.findByRole('region', { name: 'Resumen de la ciudad' });
    // Dos comunas de 100 km cada una.
    expect(city).toHaveTextContent('200');
    expect(city).toHaveTextContent('Kilómetros de calles');
    expect(city).toHaveTextContent('Obras públicas vigentes');
  });

  it('shows reports by category, barrios, communes, rankings and the heat map in Reportes', async () => {
    render(<AnalyticsDashboard />);
    await screen.findByText('123');
    fireEvent.click(screen.getByRole('tab', { name: 'Reportes' }));
    expect(screen.getByText('Palermo')).toBeInTheDocument();
    expect(screen.getAllByText('Avenida Ejemplo')).toHaveLength(2);
    expect(screen.getByLabelText('Mapa de concentración')).toBeInTheDocument();
    const categories = screen.getByRole('list', { name: 'Reportes por categoría' });
    expect(categories).toHaveTextContent('Baches y daños');
    expect(categories).toHaveTextContent('Obras y cortes');
  });

  it('shows pavement, speed reducers, works and the official sources in Calles y marcas', async () => {
    render(<AnalyticsDashboard />);
    await screen.findByText('123');
    fireEvent.click(screen.getByRole('tab', { name: 'Calles y marcas' }));
    expect(
      await screen.findByRole('list', { name: 'Kilómetros por tipo de pavimento' }),
    ).toHaveTextContent('Asfalto');
    expect(
      screen.getByRole('list', { name: 'Reductores de velocidad por tipo' }),
    ).toHaveTextContent('Badén');
    expect(screen.getByRole('list', { name: 'Obras y reportes activos' })).toHaveTextContent(
      'Obras públicas vigentes (GCBA)',
    );
    expect(screen.getByText('Infraestructura cargada')).toBeInTheDocument();
    expect(screen.getByText(/no disponibles/)).toBeInTheDocument();
    expect(screen.getByText('Actualizada')).toBeInTheDocument();
    expect(screen.getByText(/no usa el período/)).toBeInTheDocument();
  });

  it('opens the zone explorer and tells that the period does not apply', async () => {
    render(<AnalyticsDashboard />);
    await screen.findByText('123');
    fireEvent.click(screen.getByRole('tab', { name: 'Zonas' }));
    expect(screen.getByLabelText('Explorador de zonas')).toBeInTheDocument();
    expect(screen.getByLabelText('Período')).toBeDisabled();
    expect(screen.getByText(/no usa el período/)).toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys', async () => {
    render(<AnalyticsDashboard />);
    await screen.findByText('123');
    const summary = screen.getByRole('tab', { name: 'Resumen' });
    fireEvent.keyDown(summary, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Reportes' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Reportes' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Calles y marcas' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Calles y marcas' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
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

  it('keeps the report indicators when the zones fail to load', async () => {
    vi.mocked(getZones).mockRejectedValue(new Error('boom'));
    render(<AnalyticsDashboard />);
    expect(await screen.findByText('123')).toBeInTheDocument();
    expect(
      await screen.findByText('No pudimos cargar los datos de la ciudad.'),
    ).toBeInTheDocument();
  });
});
