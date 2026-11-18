import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { streetConditionColor } from './streetConditionCatalog.js';
import { SURFACE_TYPE_OPTIONS } from '../../api/roadInformationTypes.js';
import { StreetScoreLayer } from './StreetScoreLayer.js';

const mocks = vi.hoisted(() => ({
  map: {
    getBounds: () => ({
      getSouth: () => -34.7,
      getNorth: () => -34.5,
      getWest: () => -58.5,
      getEast: () => -58.3,
    }),
    getZoom: () => 16,
    setZoom: vi.fn(),
    closePopup: vi.fn(),
  },
}));

vi.mock('../../api/streetsApi.js', () => ({
  getStreetConditionInViewport: vi.fn(),
}));

vi.mock('react-leaflet', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const sampleFeature = {
    properties: {
      condition: 'BAD',
      availability: { status: 'OPEN' },
      roadInformation: { surfaceType: 'ASPHALT', surfaceCondition: 'POOR' },
    },
  };
  return {
    GeoJSON: (props: { style: (feature: never) => { color: string } }) => {
      const style = props.style(sampleFeature as never);
      return React.createElement('div', {
        'data-testid': 'geojson-layer',
        'data-color': style.color,
      });
    },
    Popup: () => null,
    useMap: () => mocks.map,
    useMapEvents: () => mocks.map,
  };
});

afterEach(() => cleanup());

describe('StreetScoreLayer', () => {
  it('draws the pavement band before the general street condition core', () => {
    render(
      <StreetScoreLayer
        refreshKey={0}
        conditionVisible
        surfaceVisible
        onRoadSegmentSelected={vi.fn()}
        onViewStreetReports={vi.fn()}
      />,
    );

    const layers = screen.getAllByTestId('geojson-layer');
    expect(layers).toHaveLength(2);
    expect(layers[0]).toHaveAttribute(
      'data-color',
      SURFACE_TYPE_OPTIONS.find((item) => item.value === 'ASPHALT')?.color,
    );
    expect(layers[1]).toHaveAttribute('data-color', streetConditionColor('BAD'));
  });
});
