import { divIcon } from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import type { ReportDto } from '../../api/reportTypes.js';
import { ReportMarkerPopup } from './ReportMarkerPopup.js';

const markerClasses: Record<ReportDto['type'], string> = {
  POTHOLE: 'pothole',
  FLOOD: 'flooding',
  ROAD_DAMAGE: 'road-damage',
  ROAD_BLOCKED: 'road-blocked',
  ROAD_WORK: 'construction',
  TRAFFIC_LIGHT: 'traffic-light',
  OTHER: 'other',
};

function createReportIcon(type: ReportDto['type']) {
  return divIcon({
    className: 'report-marker-wrapper',
    html: `<span class="report-marker report-marker--${markerClasses[type]}" aria-hidden="true"></span>`,
    iconSize: [32, 38],
    iconAnchor: [16, 34],
    popupAnchor: [0, -32],
  });
}

export function ReportMarker({ report }: { report: ReportDto }) {
  return (
    <Marker
      position={[report.location.latitude, report.location.longitude]}
      icon={createReportIcon(report.type)}
    >
      <Popup>
        <ReportMarkerPopup report={report} />
      </Popup>
    </Marker>
  );
}
