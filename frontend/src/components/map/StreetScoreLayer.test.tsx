import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreetScoreLayer } from './StreetScoreLayer.js';
import { getStreetConditionInViewport } from '../../api/streetsApi.js';

const mocks = vi.hoisted(() => {
  const sources = new Map<string, { data: unknown; setData: (data: unknown) => void }>();
  const layers = new Map<string, Record<string, unknown>>();
  const map = {
    getBounds: () => ({
      getSouth: () => -34.7,
      getNorth: () => -34.5,
      getWest: () => -58.5,
      getEast: () => -58.3,
    }),
    getZoom: () => 16,
    easeTo: vi.fn(),
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
    setFilter: vi.fn(),
    setLayoutProperty: vi.fn(),
    queryRenderedFeatures: vi.fn(() => []),
    getCanvas: () => ({ style: {} as Record<string, string> }),
    on: vi.fn(),
    off: vi.fn(),
  };
  return { map, sources, layers };
});

vi.mock('../../api/streetsApi.js', () => ({
  getStreetConditionInViewport: vi.fn(),
}));

vi.mock('./maplibre/mapLibre.js', () => ({
  useMapInstance: () => mocks.map,
  useMapEvents: () => mocks.map,
  focusMap: vi.fn(),
  MapPopup: () => null,
}));

const sampleFeature = {
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-58.4, -34.6],
      [-58.39, -34.6],
    ],
  },
  properties: {
    id: 'segment-1',
    streetId: 'street-1',
    streetName: 'Corrientes',
    roadClass: 'PRIMARY',
    targetType: 'SEGMENT',
    score: 38,
    level: 'BAD',
    condition: 'BAD',
    hasEvidence: true,
    hasReports: true,
    confidence: 'MEDIUM',
    availability: { status: 'OPEN', signals: [] },
    roadInformation: { surfaceType: 'ASPHALT', surfaceCondition: 'POOR', specialTreatments: [] },
    metrics: { reports: 1, activeReports: 1, confirmations: 0 },
    factors: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sources.clear();
  mocks.layers.clear();
  vi.mocked(getStreetConditionInViewport).mockResolvedValue({
    type: 'FeatureCollection',
    features: [sampleFeature],
  } as never);
});

afterEach(() => cleanup());

describe('StreetScoreLayer', () => {
  it('creates the pavement band below the street score line and the click target on top', () => {
    render(
      <StreetScoreLayer
        refreshKey={0}
        conditionVisible
        surfaceVisible
        onRoadSegmentSelected={vi.fn()}
        onViewStreetReports={vi.fn()}
      />,
    );

    const order = [...mocks.layers.keys()];
    expect(order.indexOf('street-surface-POOR')).toBeLessThan(order.indexOf('street-score-line'));
    expect(order.indexOf('street-score-line')).toBeLessThan(order.indexOf('street-score-hit'));
  });

  it('loads streets into flat properties for painting, gray when there is no evidence', async () => {
    render(
      <StreetScoreLayer
        refreshKey={0}
        conditionVisible
        onRoadSegmentSelected={vi.fn()}
        onViewStreetReports={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('1 segmentos o calles en el área visible.')).toBeInTheDocument(),
    );
    const data = mocks.sources.get('street-score')?.data as {
      features: { properties: Record<string, unknown> }[];
    };
    expect(data.features[0]?.properties).toMatchObject({
      id: 'segment-1',
      score: 38,
      hasEvidence: true,
      roadClass: 'PRIMARY',
    });
  });

  it('removes its layers and sources on unmount', () => {
    const { unmount } = render(
      <StreetScoreLayer
        refreshKey={0}
        conditionVisible
        onRoadSegmentSelected={vi.fn()}
        onViewStreetReports={vi.fn()}
      />,
    );
    unmount();
    expect(mocks.layers.size).toBe(0);
    expect(mocks.sources.size).toBe(0);
  });
});
