import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMapFeatures } from '../../api/mapFeaturesApi.js';
import { MapFeaturesLayer } from './MapFeaturesLayer.js';

const mocks = vi.hoisted(() => {
  const layers = new Map<string, Record<string, unknown>>();
  const visibility = new Map<string, string>();
  const handlers = new Map<string, Array<(event: unknown) => void>>();
  const sources = new Map<string, { data: unknown; setData: (data: unknown) => void }>();
  const query = vi.fn(() => [] as Array<{ properties: Record<string, unknown> }>);
  const map = {
    getStyle: () => ({ layers: [] }),
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
    getCanvas: () => ({ style: {} as Record<string, string> }),
    on: vi.fn((type: string, ...args: unknown[]) => {
      const handler = args[args.length - 1] as (event: unknown) => void;
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    }),
    off: vi.fn(),
  };
  return { map, layers, visibility, handlers, sources, query };
});

vi.mock('../../api/mapFeaturesApi.js', () => ({ getMapFeatures: vi.fn() }));
vi.mock('./maplibre/mapLibre.js', () => ({
  useMapInstance: () => mocks.map,
  MapPopup: ({ children }: { children: ReactNode }) => <div data-testid="popup">{children}</div>,
}));

const collection = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [-58.4, -34.6] as [number, number] },
      properties: { id: 'a', type: 'SPEED_BUMP', name: '', source: 'osm-traffic-calming' },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.layers.clear();
  mocks.visibility.clear();
  mocks.handlers.clear();
  mocks.sources.clear();
  vi.mocked(getMapFeatures).mockResolvedValue(collection);
});

afterEach(() => cleanup());

describe('MapFeaturesLayer', () => {
  it('loads the city marks once and draws speed reducers and public works as two layers', async () => {
    const { rerender } = render(<MapFeaturesLayer categories={['calming', 'works']} />);
    await waitFor(() => expect(mocks.sources.get('map-features')?.data).toBe(collection));
    expect([...mocks.layers.keys()]).toEqual(['map-features-calming', 'map-features-works']);
    rerender(<MapFeaturesLayer categories={['calming']} />);
    rerender(<MapFeaturesLayer categories={['calming', 'works']} />);
    expect(getMapFeatures).toHaveBeenCalledTimes(1);
  });

  it('shows each layer only while its category is on and skips loading when both are off', async () => {
    const { rerender } = render(<MapFeaturesLayer categories={['damage']} />);
    expect(getMapFeatures).not.toHaveBeenCalled();
    expect(mocks.visibility.get('map-features-calming')).toBe('none');
    expect(mocks.visibility.get('map-features-works')).toBe('none');
    rerender(<MapFeaturesLayer categories={['works']} />);
    expect(mocks.visibility.get('map-features-works')).toBe('visible');
    expect(mocks.visibility.get('map-features-calming')).toBe('none');
    await waitFor(() => expect(getMapFeatures).toHaveBeenCalledTimes(1));
  });

  it('opens a short popup for a speed reducer and for a public work', () => {
    render(<MapFeaturesLayer categories={['calming', 'works']} />);
    const click = () =>
      act(() => {
        for (const handler of mocks.handlers.get('click') ?? []) {
          handler({ point: { x: 1, y: 1 }, lngLat: { lat: -34.6, lng: -58.4 } });
        }
      });
    mocks.query.mockReturnValue([
      { properties: { id: 'a', type: 'DIP', name: '', source: 'osm-traffic-calming' } },
    ]);
    click();
    expect(screen.getByText('Badén')).toBeInTheDocument();
    expect(screen.getByText('Dato de OpenStreetMap')).toBeInTheDocument();

    mocks.query.mockReturnValue([
      {
        properties: {
          id: 'w',
          type: 'PUBLIC_WORK',
          name: 'Reurbanización Av. Ejemplo',
          source: 'gcba-ba-obras',
          jurisdiction: 'Ministerio de Espacio Público',
          startDate: '2025-03-01',
          endDate: '2026-12-31',
        },
      },
    ]);
    click();
    expect(screen.getByText('Reurbanización Av. Ejemplo')).toBeInTheDocument();
    expect(screen.getByText('Desde 01/03/2025 · hasta 31/12/2026')).toBeInTheDocument();
    expect(screen.getByText(/No indica cortes de tránsito/)).toBeInTheDocument();
  });
});
