import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreetScoreLayer, streetTileUrl } from './StreetScoreLayer.js';

const mocks = vi.hoisted(() => {
  const layers = new Map<string, Record<string, unknown>>();
  const filters = new Map<string, unknown>();
  const visibility = new Map<string, string>();
  const widths = new Map<string, unknown>();
  const handlers = new Map<string, Array<(event: unknown) => void>>();
  const sources = new Map<string, { setTiles: (tiles: string[]) => void; tiles: string[] }>();
  const queryRenderedFeatures = vi.fn(() => [] as Array<{ properties: Record<string, unknown> }>);
  const map = {
    getZoom: () => 16,
    easeTo: vi.fn(),
    getStyle: () => ({ layers: [] }),
    addSource: vi.fn((id: string, spec: { tiles: string[] }) => {
      const source = {
        tiles: spec.tiles,
        setTiles(tiles: string[]) {
          source.tiles = tiles;
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
    setFilter: vi.fn((id: string, filter: unknown) => filters.set(id, filter)),
    setLayoutProperty: vi.fn((id: string, name: string, value: string) => {
      if (name === 'visibility') visibility.set(id, value);
    }),
    setPaintProperty: vi.fn((id: string, name: string, value: unknown) => {
      if (name === 'line-width') widths.set(id, value);
    }),
    queryRenderedFeatures,
    getCanvas: () => ({ style: {} as Record<string, string> }),
    on: vi.fn((type: string, ...args: unknown[]) => {
      const handler = args[args.length - 1] as (event: unknown) => void;
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    }),
    off: vi.fn((type: string, ...args: unknown[]) => {
      const handler = args[args.length - 1];
      handlers.set(
        type,
        (handlers.get(type) ?? []).filter((item) => item !== handler),
      );
    }),
  };
  return { map, layers, filters, visibility, widths, handlers, sources, queryRenderedFeatures };
});

vi.mock('./maplibre/mapLibre.js', () => ({
  useMapInstance: () => mocks.map,
  focusMap: vi.fn(),
  MapPopup: ({ children }: { children: ReactNode }) => <div data-testid="popup">{children}</div>,
}));

const baseProps = {
  refreshKey: 0,
  onRoadSegmentSelected: vi.fn(),
  onViewStreetReports: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.layers.clear();
  mocks.filters.clear();
  mocks.visibility.clear();
  mocks.widths.clear();
  mocks.handlers.clear();
  mocks.sources.clear();
});

afterEach(() => cleanup());

describe('StreetScoreLayer (vector tiles)', () => {
  it('creates one tile source and draws pavement below the street score line, click target on top', () => {
    render(<StreetScoreLayer {...baseProps} />);

    expect(mocks.sources.get('street-tiles')?.tiles[0]).toMatch(
      /\/tiles\/streets\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=0$/,
    );
    const order = [...mocks.layers.keys()];
    expect(order.indexOf('street-surface-POOR')).toBeLessThan(order.indexOf('street-score-line'));
    expect(order.indexOf('street-score-line')).toBeLessThan(order.indexOf('street-score-hit'));
    for (const layer of mocks.layers.values()) expect(layer['source-layer']).toBe('streets');
  });

  it('shows only the street state, only the pavement, or both depending on the mode', () => {
    const { rerender } = render(<StreetScoreLayer {...baseProps} mode="condition" />);
    expect(mocks.visibility.get('street-score-line')).toBe('visible');
    expect(mocks.visibility.get('street-score-casing')).toBe('visible');
    expect(mocks.visibility.get('street-surface-GOOD')).toBe('none');

    rerender(<StreetScoreLayer {...baseProps} mode="surface" />);
    expect(mocks.visibility.get('street-score-line')).toBe('none');
    expect(mocks.visibility.get('street-surface-GOOD')).toBe('visible');

    rerender(<StreetScoreLayer {...baseProps} mode="both" />);
    expect(mocks.visibility.get('street-score-line')).toBe('visible');
    expect(mocks.visibility.get('street-surface-GOOD')).toBe('visible');
    // Con pavimento debajo, el borde claro sobra.
    expect(mocks.visibility.get('street-score-casing')).toBe('none');
  });

  it('applies level, road class and pavement filters in the browser without refetching', () => {
    render(
      <StreetScoreLayer
        {...baseProps}
        mode="both"
        levels={['BAD']}
        roadClasses={['PRIMARY']}
        surfaceTypes={['CONCRETE']}
      />,
    );
    const line = JSON.stringify(mocks.filters.get('street-score-line'));
    expect(line).toContain('"lv"');
    expect(line).toContain('BAD');
    expect(line).toContain('PRIMARY');
    const surface = JSON.stringify(mocks.filters.get('street-surface-GOOD'));
    expect(surface).toContain('CONCRETE');
    expect(surface).toContain('"has","st"');
    expect(mocks.map.addSource).toHaveBeenCalledTimes(1);
  });

  it('asks for new tiles with a different version after a change of the user', () => {
    const { rerender } = render(<StreetScoreLayer {...baseProps} refreshKey={0} />);
    rerender(<StreetScoreLayer {...baseProps} refreshKey={3} />);
    expect(mocks.sources.get('street-tiles')?.tiles[0]).toMatch(/\?v=3$/);
  });

  it('opens a short popup with the state and pavement when a street is clicked', () => {
    render(<StreetScoreLayer {...baseProps} />);
    mocks.queryRenderedFeatures.mockReturnValue([
      {
        properties: {
          id: 'seg-1',
          sid: 'street-1',
          n: 'Corrientes',
          rc: 'PRIMARY',
          sc: 38,
          lv: 'BAD',
          ev: true,
          ar: 2,
          st: 'ASPHALT',
          ss: 'OSM',
        },
      },
    ]);
    act(() => {
      for (const handler of mocks.handlers.get('click') ?? []) {
        handler({ point: { x: 1, y: 1 }, lngLat: { lat: -34.6, lng: -58.4 } });
      }
    });
    expect(screen.getByText('Corrientes')).toBeInTheDocument();
    expect(screen.getByText('Mala · 38/100')).toBeInTheDocument();
    expect(screen.getByText('2 reportes activos')).toBeInTheDocument();
    expect(screen.getByText('Pavimento: Asfalto')).toBeInTheDocument();
    expect(screen.getByText('Dato base de OpenStreetMap')).toBeInTheDocument();
    expect(screen.queryByText(/Interpretación visual/)).not.toBeInTheDocument();
  });

  it('selects a segment instead of opening the popup while choosing a road segment', () => {
    const onRoadSegmentSelected = vi.fn();
    render(
      <StreetScoreLayer
        {...baseProps}
        selectingRoadSegment
        onRoadSegmentSelected={onRoadSegmentSelected}
      />,
    );
    mocks.queryRenderedFeatures.mockReturnValue([
      { properties: { id: 'seg-9', sid: 's', n: 'Lavalle', rc: 'LOCAL', ev: false, len: 104 } },
    ]);
    act(() => {
      for (const handler of mocks.handlers.get('click') ?? []) {
        handler({ point: { x: 1, y: 1 }, lngLat: { lat: -34.6, lng: -58.4 } });
      }
    });
    expect(onRoadSegmentSelected).toHaveBeenCalledWith({
      id: 'seg-9',
      streetName: 'Lavalle',
      lengthMeters: 104,
    });
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
  });

  it('removes its layers and source on unmount', () => {
    const { unmount } = render(<StreetScoreLayer {...baseProps} />);
    unmount();
    expect(mocks.layers.size).toBe(0);
    expect(mocks.sources.size).toBe(0);
  });

  it('builds an absolute tile URL', () => {
    expect(streetTileUrl(2)).toMatch(
      /^https?:\/\/.+\/tiles\/streets\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=2$/,
    );
  });
});
