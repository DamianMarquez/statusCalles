import { StreetPopup } from '../map/StreetPopup.js';
import { ZonePopup } from '../map/ZonePopup.js';
import type { StreetTileProperties } from '../map/types.js';
import type { ZoneProperties } from '../../api/zonesApi.js';

const SAMPLE_STREET: StreetTileProperties = {
  id: 'ejemplo',
  sid: 'ejemplo',
  n: 'Calle de ejemplo',
  rc: 'LOCAL',
  sc: 58,
  lv: 'UNCOMFORTABLE',
  ev: true,
  ar: 2,
  st: 'ASPHALT',
  ss: 'OSM',
};

const SAMPLE_ZONE: ZoneProperties = {
  id: 0,
  name: 'Comuna de ejemplo',
  level: 'commune',
  communeId: null,
  totalKm: 240,
  segments: 2300,
  condition: {
    avgScore: 61.5,
    level: 'ACCEPTABLE',
    scoredSegments: 48,
    coveragePct: 3.2,
    scoredKm: 7.7,
    sufficient: true,
  },
  surface: {
    dominant: { type: 'ASPHALT', pct: 78 },
    top: [
      { type: 'ASPHALT', pct: 78 },
      { type: 'CONCRETE', pct: 15 },
      { type: 'GRANITE_COBBLESTONE', pct: 5 },
    ],
    knownPct: 96,
    kmByType: {},
  },
  intervention: {
    index: 7.4,
    publicWorks: 2,
    reportedWorks: 1,
    reportedCuts: 0,
    calming: 130,
    calmingByType: { SPEED_BUMP: 90, DIP: 25 },
    calmingPerKm: 0.54,
  },
  critical: { critical: 1, high: 2, activeReports: 9, class: 1 },
  reportsByType: {},
};

/** Ejemplos de los popups reales (de calle y de zona), con datos inventados. */
export function PopupsDemo() {
  return (
    <div className="tutorial-demo tutorial-popups">
      <figure>
        <figcaption>Al tocar una calle</figcaption>
        <div className="tutorial-popup-sample">
          <StreetPopup street={SAMPLE_STREET} onViewReports={() => undefined} />
        </div>
      </figure>
      <figure>
        <figcaption>Al tocar una zona</figcaption>
        <div className="tutorial-popup-sample">
          <ZonePopup zone={SAMPLE_ZONE} metric="condition" />
        </div>
      </figure>
      <small>Vista ilustrativa · datos de ejemplo</small>
    </div>
  );
}
