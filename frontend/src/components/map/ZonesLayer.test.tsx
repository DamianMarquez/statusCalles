import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getZones, type ZoneFeatureCollection } from '../../api/zonesApi.js';
import { ZonesLayer } from './ZonesLayer.js';

const mocks = vi.hoisted(() => {
  const layers = new Map<string, Record<string, unknown>>();
  const visibility = new Map<string, string>();
  const handlers = new Map<string, Array<(event: unknown) => void>>();
  const sources = new Map<string, { data: unknown; setData: (data: unknown) => void }>();
  const query = vi.fn((_point: unknown, options?: { layers?: string[] }) => {
    void options;
    return [] as Array<{ properties: Record<string, unknown> }>;
  });
  const map = {
    getStyle: () => ({ layers: [], glyphs: 'https://example.invalid/{fontstack}/{range}.pbf' }),
    addSource: vi.fn((id: string) => {
      const source = {
        data: null as unknown,
        setData(data: unknown) {
          source.data = data;
        },
      };
      sources.set(id, source);
    }),
    getSource: (id: string) => sources.get(id),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    addLayer: vi.fn((layer: { id: string }) => {
      layers.set(layer.id, layer as unknown as Record<string, unknown>);
    }),
    getLayer: (id: string) => layers.get(id),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    setLayoutProperty: vi.fn((id: string, name: string, value: string) => {
      if (name === 'visibility') visibility.set(id, value);
    }),
    queryRenderedFeatures: query,
    on: vi.fn((type: string, ...args: unknown[]) => {
      const handler = args[args.length - 1] as (event: unknown) => void;
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    }),
    off: vi.fn(),
  };
  return { map, layers, visibility, handlers, sources, query };
});

vi.mock('../../api/zonesApi.js', () => ({ getZones: vi.fn() }));
vi.mock('./maplibre/mapLibre.js', () => ({
  useMapInstance: () => mocks.map,
  MapPopup: ({ children }: { children: ReactNode }) => <div data-testid="popup">{children}</div>,
}));

function zone(id: number, overrides: Record<string, unknown> = {}) {
  return {
    type: 'Feature' as const,
    id,
    geometry: { type: 'Polygon' as const, coordinates: [] },
    properties: {
      id,
      name: `Comuna ${id}`,
      level: 'commune' as const,
      communeId: null,
      totalKm: 100,
      condition: {
        avgScore: 40,
        level: 'BAD',
        scoredSegments: 12,
        coveragePct: 3,
        sufficient: true,
      },
      surface: {
        dominant: { type: 'ASPHALT', pct: 70 },
        top: [{ type: 'ASPHALT', pct: 70 }],
        knownPct: 95,
      },
      intervention: {
        index: id * 3,
        publicWorks: 2,
        reportedWorks: 1,
        reportedCuts: 0,
        calming: 20,
        calmingByType: { SPEED_BUMP: 20 },
        calmingPerKm: 0.2,
      },
      critical: { critical: 1, high: 1, activeReports: 5, class: 1 as const },
      ...overrides,
    },
  };
}

const collection: ZoneFeatureCollection = {
  type: 'FeatureCollection',
  features: [zone(1), zone(2), zone(3)],
};

function clickMap() {
  act(() => {
    for (const handler of mocks.handlers.get('click') ?? []) {
      handler({ point: { x: 1, y: 1 }, lngLat: { lat: -34.6, lng: -58.4 } });
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.layers.clear();
  mocks.visibility.clear();
  mocks.handlers.clear();
  mocks.sources.clear();
  mocks.query.mockReturnValue([]);
  vi.mocked(getZones).mockResolvedValue(collection);
});

afterEach(() => cleanup());

describe('ZonesLayer', () => {
  it('creates hidden layers and loads nothing while no zone level is selected', () => {
    render(<ZonesLayer selection="none" metric="condition" />);
    expect([...mocks.layers.keys()]).toEqual(['zones-fill', 'zones-line', 'zones-label']);
    expect(getZones).not.toHaveBeenCalled();
    expect(mocks.visibility.get('zones-fill')).toBe('none');
  });

  it('loads the level once and paints each zone with the color of the metric', async () => {
    const { rerender } = render(<ZonesLayer selection="commune" metric="condition" />);
    await waitFor(() => expect(mocks.visibility.get('zones-fill')).toBe('visible'));
    const data = mocks.sources.get('zones')?.data as {
      features: Array<{ properties: { fillColor: string } }>;
    };
    const stateColors = data.features.map((feature) => feature.properties.fillColor);
    expect(new Set(stateColors).size).toBe(1);

    rerender(<ZonesLayer selection="commune" metric="intervention" />);
    await waitFor(() => {
      const next = mocks.sources.get('zones')?.data as {
        features: Array<{ properties: { fillColor: string } }>;
      };
      expect(
        new Set(next.features.map((feature) => feature.properties.fillColor)).size,
      ).toBeGreaterThan(1);
    });
    expect(getZones).toHaveBeenCalledTimes(1);
    expect(getZones).toHaveBeenCalledWith('commune', expect.anything());
  });

  it('hides the layers again when the selection goes back to none', async () => {
    const { rerender } = render(<ZonesLayer selection="commune" metric="surface" />);
    await waitFor(() => expect(mocks.visibility.get('zones-fill')).toBe('visible'));
    rerender(<ZonesLayer selection="none" metric="surface" />);
    await waitFor(() => expect(mocks.visibility.get('zones-fill')).toBe('none'));
  });

  it('asks for neighborhoods separately from communes', async () => {
    const { rerender } = render(<ZonesLayer selection="commune" metric="condition" />);
    await waitFor(() => expect(getZones).toHaveBeenCalledTimes(1));
    rerender(<ZonesLayer selection="neighborhood" metric="condition" />);
    await waitFor(() => expect(getZones).toHaveBeenCalledTimes(2));
    expect(getZones).toHaveBeenLastCalledWith('neighborhood', expect.anything());
  });

  it('opens the popup of the zone that was clicked with the metric in view', async () => {
    render(<ZonesLayer selection="commune" metric="critical" />);
    await waitFor(() => expect(mocks.visibility.get('zones-fill')).toBe('visible'));
    mocks.query.mockImplementation((_point, options) =>
      options?.layers?.includes('zones-fill') ? [{ properties: { id: 2 } }] : [],
    );
    clickMap();
    expect(screen.getByText('Comuna 2')).toBeInTheDocument();
    expect(screen.getByText('Reportes críticos activos: 1 · Altos: 1')).toBeInTheDocument();
  });

  it('does not open a zone popup when a street was clicked or while picking a location', async () => {
    const { rerender } = render(<ZonesLayer selection="commune" metric="condition" />);
    await waitFor(() => expect(mocks.visibility.get('zones-fill')).toBe('visible'));
    mocks.layers.set('street-score-hit', {});
    mocks.query.mockImplementation((_point, options) =>
      options?.layers?.includes('street-score-hit')
        ? [{ properties: { id: 'seg' } }]
        : [{ properties: { id: 1 } }],
    );
    clickMap();
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();

    mocks.layers.delete('street-score-hit');
    rerender(<ZonesLayer selection="commune" metric="condition" interactive={false} />);
    clickMap();
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
  });

  it('removes its layers and source on unmount', () => {
    const { unmount } = render(<ZonesLayer selection="none" metric="condition" />);
    unmount();
    expect(mocks.layers.size).toBe(0);
    expect(mocks.sources.size).toBe(0);
  });
});
