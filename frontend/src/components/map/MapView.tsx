import { useCallback, useEffect, useState } from 'react';
import { divIcon } from 'leaflet';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { createReport } from '../../api/reportsApi.js';
import type {
  CreateReportInput,
  ReportFeedbackSummary,
  ReportFeedbackType,
  ViewportBounds,
} from '../../api/reportTypes.js';
import { submitReportFeedback } from '../../api/reportsApi.js';
import { GeolocationError, requestUserLocation } from './geolocation.js';
import { mapConfig } from './mapConfig.js';
import { ReportForm } from './ReportForm.js';
import { ReportLocationPicker } from './ReportLocationPicker.js';
import { ReportMarker } from './ReportMarker.js';
import { StreetScoreLayer } from './StreetScoreLayer.js';
import { reportTypeLabelsForMap } from './ReportMarkerPopup.js';
import { useViewportReports } from './useViewportReports.js';
import type { UserLocation } from './types.js';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../../auth/AuthContext.js';
import { RoutePlanner } from './RoutePlanner.js';
import type { CalculatedRoute } from '../../api/routingApi.js';

const reportTypeClasses: Record<keyof typeof reportTypeLabelsForMap, string> = {
  POTHOLE: 'pothole',
  FLOOD: 'flooding',
  ROAD_DAMAGE: 'road-damage',
  ROAD_BLOCKED: 'road-blocked',
  ROAD_WORK: 'construction',
  TRAFFIC_LIGHT: 'traffic-light',
  OTHER: 'other',
};

const currentLocationIcon = divIcon({
  className: 'user-marker-wrapper',
  html: '<span class="user-marker" aria-hidden="true"><span></span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function readViewportBounds(map: ReturnType<typeof useMap>): ViewportBounds {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast(),
  };
}

function ViewportReports({
  onViewportChange,
}: {
  onViewportChange: (bounds: ViewportBounds) => void;
}) {
  const map = useMapEvents({
    moveend: () => onViewportChange(readViewportBounds(map)),
  });

  useEffect(() => {
    onViewportChange(readViewportBounds(map));
  }, [map, onViewportChange]);

  return null;
}

function LocationFocus({ location }: { location: UserLocation }) {
  const map = useMap();
  useEffect(() => {
    map.setView([location.latitude, location.longitude], Math.max(map.getZoom(), 16), {
      animate: true,
    });
  }, [location.latitude, location.longitude, map]);
  return null;
}

function ReportFocus({ location }: { location: UserLocation | null }) {
  const map = useMap();
  useEffect(() => {
    if (location) {
      map.setView([location.latitude, location.longitude], Math.max(map.getZoom(), 16), {
        animate: true,
      });
    }
  }, [location, map]);
  return null;
}

function RouteLayer({ route }: { route: CalculatedRoute | null }) {
  const map = useMap();
  const positions =
    route?.route.coordinates.map(
      ([longitude, latitude]) => [latitude, longitude] as [number, number],
    ) ?? [];
  useEffect(() => {
    if (positions.length >= 2) map.fitBounds(positions, { padding: [44, 44], maxZoom: 17 });
  }, [map, route]);
  if (!route || positions.length < 2) return null;
  return (
    <Polyline positions={positions} pathOptions={{ color: '#246fc5', weight: 6, opacity: 0.9 }} />
  );
}

function getGeolocationProvider(): Geolocation | undefined {
  return typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
}

function getLocationErrorMessage(error: unknown): string {
  if (!(error instanceof GeolocationError))
    return 'No pudimos obtener tu ubicación. Intentá de nuevo.';

  switch (error.kind) {
    case 'unsupported':
      return 'Tu navegador no admite la geolocalización.';
    case 'permission-denied':
      return 'El permiso de ubicación fue denegado. Podés habilitarlo desde la configuración del navegador.';
    case 'timeout':
      return 'La solicitud de ubicación tardó demasiado. Intentá de nuevo.';
    case 'unavailable':
      return 'La ubicación no está disponible en este momento.';
  }
}

export default function MapView() {
  const { user, openAuthDialog, refreshProfile } = useAuth();
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isPickingReportLocation, setIsPickingReportLocation] = useState(false);
  const [isReportFormOpen, setIsReportFormOpen] = useState(false);
  const [reportLocation, setReportLocation] = useState<UserLocation | null>(null);
  const [reportFocusLocation, setReportFocusLocation] = useState<UserLocation | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [calculatedRoute, setCalculatedRoute] = useState<CalculatedRoute | null>(null);
  const [votingReportIds, setVotingReportIds] = useState<Set<string>>(() => new Set());
  const [feedbackErrors, setFeedbackErrors] = useState<Record<string, string>>({});
  const [scoreRefreshKey, setScoreRefreshKey] = useState(0);
  const {
    reports,
    status: reportStatus,
    requestBounds,
    retry,
    addReport,
    updateReportFeedback,
    replaceReport,
  } = useViewportReports();
  useEffect(() => {
    retry();
  }, [user?.id, retry]);
  const handleViewportChange = useCallback(
    (bounds: ViewportBounds) => requestBounds(bounds),
    [requestBounds],
  );

  async function handleLocateMe() {
    setLocationError(null);
    setIsLocating(true);
    try {
      const location = await requestUserLocation(getGeolocationProvider(), {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });
      setUserLocation(location);
    } catch (error) {
      setLocationError(getLocationErrorMessage(error));
    } finally {
      setIsLocating(false);
    }
  }

  function startReport() {
    setReportSuccess(false);
    setReportLocation(null);
    setIsReportFormOpen(false);
    setIsPickingReportLocation(true);
  }

  function selectReportLocation(location: UserLocation) {
    setReportLocation(location);
    setIsPickingReportLocation(false);
    setIsReportFormOpen(true);
  }

  function cancelReport() {
    setIsReportFormOpen(false);
    setIsPickingReportLocation(false);
    setReportLocation(null);
  }

  async function submitReport(input: CreateReportInput, allowSimilar = false) {
    const createdReport = allowSimilar
      ? await createReport(input, true)
      : await createReport(input);
    addReport(createdReport);
    void refreshProfile().catch(() => undefined);
    setScoreRefreshKey((current) => current + 1);
    const createdLocation = createdReport.location;
    setReportFocusLocation(createdLocation);
    setReportLocation(null);
    setIsReportFormOpen(false);
    setReportSuccess(true);
    return createdReport;
  }

  function useCurrentReportLocation() {
    if (userLocation) selectReportLocation(userLocation);
  }

  async function voteOnReport(reportId: string, type: ReportFeedbackType) {
    const report = reports.find((item) => item.id === reportId);
    if (!report || report.feedback.userFeedback === type || votingReportIds.has(reportId)) return;

    const previousFeedback = report.feedback;
    const confirmations =
      previousFeedback.confirmations - (previousFeedback.userFeedback === 'CONFIRM' ? 1 : 0);
    const resolvedReports =
      previousFeedback.resolvedReports - (previousFeedback.userFeedback === 'RESOLVED' ? 1 : 0);
    const optimisticFeedback: ReportFeedbackSummary = {
      confirmations: confirmations + (type === 'CONFIRM' ? 1 : 0),
      resolvedReports: resolvedReports + (type === 'RESOLVED' ? 1 : 0),
      userFeedback: type,
    };

    updateReportFeedback(reportId, optimisticFeedback);
    setFeedbackErrors((current) => ({ ...current, [reportId]: '' }));
    setVotingReportIds((current) => new Set(current).add(reportId));
    try {
      const updatedReport = await submitReportFeedback(reportId, type);
      replaceReport(updatedReport);
      void refreshProfile().catch(() => undefined);
      setScoreRefreshKey((current) => current + 1);
    } catch (error) {
      updateReportFeedback(reportId, previousFeedback);
      setFeedbackErrors((current) => ({
        ...current,
        [reportId]:
          error instanceof Error
            ? error.message
            : 'No pudimos registrar tu respuesta. Intentá de nuevo.',
      }));
    } finally {
      setVotingReportIds((current) => {
        const next = new Set(current);
        next.delete(reportId);
        return next;
      });
    }
  }

  const reportCount = reports.length;
  const statusMessage =
    reportStatus === 'loading'
      ? reportCount === 0
        ? 'Cargando reportes…'
        : 'Actualizando reportes…'
      : reportStatus === 'error'
        ? 'No pudimos actualizar los reportes.'
        : reportStatus === 'empty'
          ? 'No hay reportes en esta zona.'
          : `${reportCount} ${reportCount === 1 ? 'reporte' : 'reportes'} en esta zona.`;

  return (
    <section
      className={`map-stage${isPickingReportLocation ? ' map-stage--picking' : ''}`}
      aria-label="Mapa de calles de Buenos Aires"
    >
      <MapContainer
        center={mapConfig.center}
        zoom={mapConfig.zoom}
        minZoom={mapConfig.minZoom}
        maxZoom={mapConfig.maxZoom}
        maxBounds={mapConfig.maxBounds}
        maxBoundsViscosity={0.8}
        scrollWheelZoom
        className="street-map"
      >
        <TileLayer url={mapConfig.tileUrl} attribution={mapConfig.tileAttribution} />
        <ViewportReports onViewportChange={handleViewportChange} />
        <StreetScoreLayer refreshKey={scoreRefreshKey} />
        <RouteLayer route={calculatedRoute} />
        <ReportFocus location={reportFocusLocation} />
        <ReportLocationPicker
          active={isPickingReportLocation}
          location={reportLocation}
          onSelect={selectReportLocation}
        />
        {reports.map((report) => (
          <ReportMarker
            key={report.id}
            report={report}
            onVote={(type) => void voteOnReport(report.id, type)}
            isVoting={votingReportIds.has(report.id)}
            feedbackError={feedbackErrors[report.id] || null}
            authenticated={Boolean(user)}
            onRequestLogin={openAuthDialog}
          />
        ))}
        {userLocation && (
          <>
            <LocationFocus location={userLocation} />
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={currentLocationIcon}
              zIndexOffset={1000}
            >
              <Popup>Mi ubicación</Popup>
            </Marker>
          </>
        )}
      </MapContainer>
      <div className="report-status" aria-live="polite">
        <span role={reportStatus === 'error' ? 'alert' : 'status'}>{statusMessage}</span>
        {reportStatus === 'error' && (
          <button type="button" className="report-status__retry" onClick={retry}>
            Reintentar
          </button>
        )}
      </div>
      <div className="map-toolbar">
        <button
          className="report-start-button"
          type="button"
          onClick={startReport}
          disabled={isPickingReportLocation || isReportFormOpen}
        >
          + Reportar problema
        </button>
        <button
          className="locate-button"
          type="button"
          onClick={handleLocateMe}
          disabled={isLocating}
          aria-busy={isLocating}
        >
          <span className="locate-button__icon" aria-hidden="true">
            ⌖
          </span>
          {isLocating ? 'Buscando ubicación…' : 'Mi ubicación'}
        </button>
        {locationError && (
          <p className="location-error" role="alert">
            {locationError}
          </p>
        )}
      </div>
      <RoutePlanner onRoute={setCalculatedRoute} />
      {isPickingReportLocation && (
        <div className="report-pick-prompt" role="status">
          <strong>Elegí la ubicación del problema</strong>
          <span>Tocá el mapa para colocar el marcador.</span>
          <div>
            {userLocation && (
              <button type="button" onClick={() => selectReportLocation(userLocation)}>
                Usar mi ubicación
              </button>
            )}
            <button type="button" onClick={cancelReport}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {reportSuccess && (
        <div className="report-success" role="status">
          <span>Reporte enviado. Gracias por ayudar a mejorar las calles.</span>
          <button
            type="button"
            aria-label="Cerrar confirmación"
            onClick={() => setReportSuccess(false)}
          >
            ×
          </button>
        </div>
      )}
      {isReportFormOpen && reportLocation && (
        <ReportForm
          location={reportLocation}
          currentLocation={userLocation}
          onUseCurrentLocation={useCurrentReportLocation}
          onCancel={cancelReport}
          onSubmit={submitReport}
        />
      )}
      <div className="map-legend" aria-label="Tipos de reporte">
        {Object.entries(reportTypeLabelsForMap).map(([type, label]) => (
          <span className="map-legend__item" key={type}>
            <span
              className={`map-legend__dot map-legend__dot--${reportTypeClasses[type as keyof typeof reportTypeClasses]}`}
            />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
