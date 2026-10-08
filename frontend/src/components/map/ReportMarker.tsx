import { useState } from 'react';
import { divIcon } from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import type { ReportDto, ReportFeedbackType } from '../../api/reportTypes.js';
import type { ReportFlagReason } from '../../api/reportsApi.js';
import { ReportMarkerPopup } from './ReportMarkerPopup.js';
import { REPORT_TYPE_OPTIONS } from '../../api/reportCatalog.js';

const markerClasses = Object.fromEntries(
  REPORT_TYPE_OPTIONS.map((option) => [option.value, option.markerClass]),
) as Record<ReportDto['type'], string>;

function createReportIcon(type: ReportDto['type']) {
  return divIcon({
    className: 'report-marker-wrapper',
    html: `<span class="report-marker report-marker--${markerClasses[type]}" aria-hidden="true"></span>`,
    iconSize: [32, 38],
    iconAnchor: [16, 34],
    popupAnchor: [0, -32],
  });
}

export function ReportMarker({
  report,
  onVote,
  isVoting,
  feedbackError,
  authenticated,
  onRequestLogin,
  onFlag,
  flagBusy,
  flagError,
  flagSuccess,
}: {
  report: ReportDto;
  onVote: (type: ReportFeedbackType) => void;
  isVoting: boolean;
  feedbackError: string | null;
  authenticated: boolean;
  onRequestLogin: () => void;
  onFlag: (reason: ReportFlagReason) => void;
  flagBusy: boolean;
  flagError: string | null;
  flagSuccess: boolean;
}) {
  const [popupOpen, setPopupOpen] = useState(false);
  return (
    <Marker
      position={[report.location.latitude, report.location.longitude]}
      icon={createReportIcon(report.type)}
    >
      <Popup
        minWidth={240}
        eventHandlers={{ add: () => setPopupOpen(true), remove: () => setPopupOpen(false) }}
      >
        <ReportMarkerPopup
          report={report}
          onVote={onVote}
          isVoting={isVoting}
          feedbackError={feedbackError}
          authenticated={authenticated}
          onRequestLogin={onRequestLogin}
          popupOpen={popupOpen}
          onFlag={onFlag}
          flagBusy={flagBusy}
          flagError={flagError}
          flagSuccess={flagSuccess}
        />
      </Popup>
    </Marker>
  );
}
