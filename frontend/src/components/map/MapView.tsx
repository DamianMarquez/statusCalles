import { useCallback, useEffect, useRef, useState } from 'react';
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
import { createReport, flagReport } from '../../api/reportsApi.js';
import type { ReportFlagReason } from '../../api/reportsApi.js';
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
import { useViewportReports } from './useViewportReports.js';
import type { UserLocation } from './types.js';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../../auth/AuthContext.js';
import { RoutePlanner } from './RoutePlanner.js';
import type { CalculatedRoute } from '../../api/routingApi.js';
import type { RouteLocation } from './RoutePlanner.js';
import type { AddressSearchResult } from '../../api/addressesApi.js';
import { MapFilters } from './MapFilters.js';
import { useMapReportFilters } from './useMapReportFilters.js';
import { filtersActiveCount } from './mapReportFilters.js';
import { MapLegend } from './MapLegend.js';
import { MapLayerControls } from './MapLayerControls.js';

const currentLocationIcon = divIcon({
  className: 'user-marker-wrapper',
  html: '<span class="user-marker" aria-hidden="true"><span></span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const addressMarkerIcon = divIcon({
  className: 'address-marker-wrapper',
  html: '<span class="address-marker" aria-hidden="true">⌖</span>',
  iconSize: [34, 42],
  iconAnchor: [17, 38],
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

function RouteLocationFocus({ location }: { location: RouteLocation | null }) {
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

function MapQueryFocus() {
  const map = useMap();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const latitude = Number(params.get('focusLat'));
    const longitude = Number(params.get('focusLng'));
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      map.setView([latitude, longitude], Math.max(map.getZoom(), 16), { animate: true });
    }
  }, [map]);
  return null;
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

export default function MapView({
  startReportOnOpen = false,
  onStartReportHandled,
}: {
  startReportOnOpen?: boolean;
  onStartReportHandled?: () => void;
} = {}) {
  const { user, openAuthDialog, refreshProfile } = useAuth();
  const { filters, applyFilters } = useMapReportFilters();
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isPickingReportLocation, setIsPickingReportLocation] = useState(false);
  const [isReportFormOpen, setIsReportFormOpen] = useState(false);
  const [reportLocation, setReportLocation] = useState<UserLocation | null>(null);
  const [reportFocusLocation, setReportFocusLocation] = useState<UserLocation | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [calculatedRoute, setCalculatedRoute] = useState<CalculatedRoute | null>(null);
  const [routeLocations, setRouteLocations] = useState<{
    origin: RouteLocation | null;
    destination: RouteLocation | null;
  }>({ origin: null, destination: null });
  const [votingReportIds, setVotingReportIds] = useState<Set<string>>(() => new Set());
  const [feedbackErrors, setFeedbackErrors] = useState<Record<string, string>>({});
  const [flagBusyIds, setFlagBusyIds] = useState<Set<string>>(() => new Set());
  const [flagErrors, setFlagErrors] = useState<Record<string, string>>({});
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(() => new Set());
  const [legendOpen, setLegendOpen] = useState(false);
  const legendToggleRef = useRef<HTMLButtonElement>(null);
  const closeLegend = useCallback(() => {
    setLegendOpen(false);
    legendToggleRef.current?.focus();
  }, []);
  const [scoreRefreshKey, setScoreRefreshKey] = useState(0);
  const [reportsLayerVisible, setReportsLayerVisible] = useState(true);
  const [conditionLayerVisible, setConditionLayerVisible] = useState(true);
  const [conditionLevels, setConditionLevels] = useState<string[] | null>(null);
  const [streetReportTarget, setStreetReportTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const {
    reports,
    status: reportStatus,
    hasMore,
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
    (bounds: ViewportBounds) => {
      if (filters.onlyMine && !user) {
        openAuthDialog();
        return;
      }
      requestBounds(bounds, filters);
    },
    [filters, openAuthDialog, requestBounds, user],
  );

  async function handleLocateMe(): Promise<UserLocation | null> {
    setLocationError(null);
    setIsLocating(true);
    try {
      const location = await requestUserLocation(getGeolocationProvider(), {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });
      setUserLocation(location);
      return location;
    } catch (error) {
      setLocationError(getLocationErrorMessage(error));
      return null;
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

  useEffect(() => {
    if (startReportOnOpen) {
      startReport();
      onStartReportHandled?.();
    }
  }, [startReportOnOpen, onStartReportHandled]);

  function selectReportLocation(location: UserLocation) {
    setReportFocusLocation(location);
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

  async function flagReportFromMap(reportId: string, reason: ReportFlagReason) {
    if (!user) {
      openAuthDialog();
      return;
    }
    if (flagBusyIds.has(reportId)) return;
    setFlagErrors((current) => ({ ...current, [reportId]: '' }));
    setFlagBusyIds((current) => new Set(current).add(reportId));
    try {
      await flagReport(reportId, reason);
      setFlaggedIds((current) => new Set(current).add(reportId));
    } catch (error) {
      setFlagErrors((current) => ({
        ...current,
        [reportId]: error instanceof Error ? error.message : 'No pudimos enviar la denuncia.',
      }));
    } finally {
      setFlagBusyIds((current) => {
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
          : filtersActiveCount(filters) === 0
            ? `Mostrando todos los reportes disponibles · ${reportCount} en esta zona.`
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
        <MapQueryFocus />
        {conditionLayerVisible && (
          <StreetScoreLayer
            refreshKey={scoreRefreshKey}
            levels={conditionLevels}
            onViewStreetReports={(id, name) => {
              setStreetReportTarget({ id, name });
              setReportsLayerVisible(true);
            }}
          />
        )}
        <RouteLayer route={calculatedRoute} />
        {(['origin', 'destination'] as const).map((slot) => {
          const location = routeLocations[slot];
          if (!location) return null;
          return (
            <Marker
              key={slot}
              position={[location.latitude, location.longitude]}
              icon={addressMarkerIcon}
              zIndexOffset={950}
            >
              <Popup>
                <strong>{slot === 'origin' ? 'Origen' : 'Destino'}</strong>
                <br />
                {location.displayName}
              </Popup>
            </Marker>
          );
        })}
        <RouteLocationFocus location={routeLocations.destination ?? routeLocations.origin} />
        <ReportFocus location={reportFocusLocation} />
        <ReportLocationPicker
          active={isPickingReportLocation}
          location={reportLocation}
          onSelect={selectReportLocation}
        />
        {reportsLayerVisible &&
          reports
            .filter((report) => !streetReportTarget || report.street?.id === streetReportTarget.id)
            .map((report) => (
              <ReportMarker
                key={report.id}
                report={report}
                onVote={(type) => void voteOnReport(report.id, type)}
                isVoting={votingReportIds.has(report.id)}
                feedbackError={feedbackErrors[report.id] || null}
                authenticated={Boolean(user)}
                onRequestLogin={openAuthDialog}
                onFlag={(reason) => void flagReportFromMap(report.id, reason)}
                flagBusy={flagBusyIds.has(report.id)}
                flagError={flagErrors[report.id] || null}
                flagSuccess={flaggedIds.has(report.id)}
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
      <MapFilters
        value={filters}
        onApply={applyFilters}
        authenticated={Boolean(user)}
        onRequestLogin={openAuthDialog}
      />
      <MapLayerControls
        reports={reportsLayerVisible}
        condition={conditionLayerVisible}
        levels={conditionLevels}
        onReportsChange={setReportsLayerVisible}
        onConditionChange={setConditionLayerVisible}
        onLevelsChange={setConditionLevels}
      />
      {streetReportTarget && reportsLayerVisible && (
        <div className="street-report-focus" role="status">
          Reportes de {streetReportTarget.name}
          <button type="button" onClick={() => setStreetReportTarget(null)}>
            Mostrar todos
          </button>
        </div>
      )}
      <button
        className="map-legend-toggle"
        ref={legendToggleRef}
        type="button"
        aria-expanded={legendOpen}
        aria-controls="map-legend-panel"
        onClick={() => setLegendOpen((current) => !current)}
      >
        <span aria-hidden="true">ⓘ</span> Referencias
      </button>
      <MapLegend open={legendOpen} onClose={closeLegend} />
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
      <RoutePlanner
        onRoute={setCalculatedRoute}
        currentLocation={userLocation}
        onRequestLocation={handleLocateMe}
        onSelectLocation={(slot, location) =>
          setRouteLocations((current) => ({ ...current, [slot]: location }))
        }
      />
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
          onSelectAddress={(address: AddressSearchResult) => {
            const location = { latitude: address.latitude, longitude: address.longitude };
            setReportLocation(location);
            setReportFocusLocation(location);
          }}
          onCancel={cancelReport}
          onSubmit={submitReport}
        />
      )}
      {reportStatus === 'empty' && filtersActiveCount(filters) > 0 && (
        <div className="map-empty-filter" role="status">
          <span>No encontramos reportes con estos filtros.</span>
          <button type="button" onClick={() => applyFilters({})}>
            Limpiar filtros
          </button>
        </div>
      )}
      {reportStatus === 'loaded' && reports.length > 0 && hasMore && (
        <div className="map-results-limit" role="status">
          Hay más reportes en esta zona. Acercá el mapa para ver resultados más específicos.
        </div>
      )}
    </section>
  );
}
