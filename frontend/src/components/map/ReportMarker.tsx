import { useState } from 'react';
import { MapMarker } from './maplibre/mapLibre.js';
import type { ReportDto, ReportFeedbackType } from '../../api/reportTypes.js';
import type { ReportFlagReason } from '../../api/reportsApi.js';
import { ReportMarkerPopup } from './ReportMarkerPopup.js';
import { REPORT_TYPE_OPTIONS } from '../../api/reportCatalog.js';

const markerClasses = Object.fromEntries(
  REPORT_TYPE_OPTIONS.map((option) => [option.value, option.markerClass]),
) as Record<ReportDto['type'], string>;

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
    <MapMarker
      position={[report.location.latitude, report.location.longitude]}
      className="report-marker-wrapper"
      html={`<span class="report-marker report-marker--${markerClasses[report.type]}" aria-hidden="true"></span>`}
      size={[32, 38]}
      anchor="bottom"
      offset={[0, 4]}
      popupMaxWidth="320px"
      onPopupToggle={setPopupOpen}
      popup={
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
      }
    />
  );
}
