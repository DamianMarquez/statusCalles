import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getZones, type ZoneFeatureCollection, type ZoneProperties } from '../../api/zonesApi.js';
import { makeZoneProperties } from '../../test/zoneFixture.js';
import { ZoneExplorer } from './ZoneExplorer.js';
import { buildRows } from './ZoneRanking.js';

vi.mock('../../api/zonesApi.js', () => ({ getZones: vi.fn() }));
vi.mock('../map/maplibre/mapLibre.js', () => ({
  MapCanvas: ({ children }: { children: ReactNode }) => (
    <div data-testid="mini-map">{children}</div>
  ),
}));
const layerProps = vi.hoisted(() => vi.fn());
vi.mock('../map/ZonesLayer.js', () => ({
  ZonesLayer: (props: { selection: string; metric: string }) => {
    layerProps(props);
    return null;
  },
}));

function collection(zones: ZoneProperties[]): ZoneFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((zone) => ({
      type: 'Feature' as const,
      id: zone.id,
      geometry: { type: 'Polygon' as const, coordinates: [] },
      properties: zone,
    })),
  };
}

const zones = [
  makeZoneProperties(1, {
    condition: {
      avgScore: 35,
      level: 'BAD',
      scoredSegments: 20,
      coveragePct: 4,
      scoredKm: 4,
      sufficient: true,
    },
    critical: { critical: 3, high: 1, activeReports: 8, class: 2 },
  }),
  makeZoneProperties(2, {
    condition: {
      avgScore: 80,
      level: 'GOOD',
      scoredSegments: 9,
      coveragePct: 2,
      scoredKm: 2,
      sufficient: true,
    },
  }),
  makeZoneProperties(3, {
    condition: {
      avgScore: null,
      level: null,
      scoredSegments: 1,
      coveragePct: 0,
      scoredKm: 0,
      sufficient: false,
    },
    critical: { critical: 0, high: 0, activeReports: 0, class: 0 },
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getZones).mockResolvedValue(collection(zones));
});

afterEach(() => cleanup());

describe('ZoneExplorer', () => {
  it('ranks the zones with the worst state first and the ones without data last', async () => {
    render(<ZoneExplorer />);
    const ranking = await screen.findByRole('list', { name: 'Ranking de zonas' });
    const names = within(ranking)
      .getAllByRole('button')
      .map((button) => button.textContent ?? '');
    expect(names[0]).toContain('Comuna 1');
    expect(names[0]).toContain('35/100');
    expect(names[1]).toContain('Comuna 2');
    expect(names[2]).toContain('Comuna 3');
    expect(names[2]).toContain('Datos insuficientes');
  });

  it('changes the ranking and the map layer when another reading is chosen', async () => {
    render(<ZoneExplorer />);
    await screen.findByRole('list', { name: 'Ranking de zonas' });
    fireEvent.click(screen.getByRole('radio', { name: 'Críticos' }));
    const ranking = screen.getByRole('list', { name: 'Ranking de zonas' });
    expect(within(ranking).getAllByRole('button')[0]).toHaveTextContent('3 críticos · 1 altos');
    expect(layerProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ selection: 'commune', metric: 'critical' }),
    );
  });

  it('asks for the neighborhoods when the level changes', async () => {
    render(<ZoneExplorer />);
    await screen.findByRole('list', { name: 'Ranking de zonas' });
    fireEvent.click(screen.getByRole('radio', { name: 'Barrios' }));
    await waitFor(() => expect(getZones).toHaveBeenCalledWith('neighborhood', expect.anything()));
    expect(layerProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ selection: 'neighborhood' }),
    );
  });

  it('shows the breakdown of the selected zone', async () => {
    render(<ZoneExplorer />);
    const ranking = await screen.findByRole('list', { name: 'Ranking de zonas' });
    fireEvent.click(within(ranking).getAllByRole('button')[0]!);
    expect(await screen.findByText(/Estado promedio: Mala · 35\/100/)).toBeInTheDocument();
  });

  it('collapses long rankings and expands them on demand', async () => {
    const many = Array.from({ length: 15 }, (_, index) => makeZoneProperties(index + 1));
    vi.mocked(getZones).mockResolvedValue(collection(many));
    render(<ZoneExplorer />);
    const ranking = await screen.findByRole('list', { name: 'Ranking de zonas' });
    expect(within(ranking).getAllByRole('button')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Ver las 15 zonas' }));
    expect(
      within(screen.getByRole('list', { name: 'Ranking de zonas' })).getAllByRole('button'),
    ).toHaveLength(15);
  });

  it('shows an error with a retry when the zones cannot be loaded', async () => {
    vi.mocked(getZones).mockRejectedValueOnce(new Error('boom'));
    render(<ZoneExplorer />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las zonas.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Ranking de zonas' })).toBeInTheDocument();
  });
});

describe('buildRows', () => {
  it('orders intervention and critical readings from the highest', () => {
    const rows = buildRows(zones, 'intervention');
    expect(rows.map((row) => row.id)).toEqual([3, 2, 1]);
    expect(buildRows(zones, 'critical')[0]!.id).toBe(1);
  });
});
