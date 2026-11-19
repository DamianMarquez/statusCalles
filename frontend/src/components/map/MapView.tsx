import { useCallback, useEffect, useRef, useState } from 'react';
import {
  focusMap,
  MapCanvas,
  MapMarker,
  useMapEvents,
  useMapInstance,
} from './maplibre/mapLibre.js';
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
import { ReportForm } from './ReportForm.js';
import { ReportLocationPicker } from './ReportLocationPicker.js';
import { ReportMarker } from './ReportMarker.js';
import { StreetScoreLayer } from './StreetScoreLayer.js';
import { RoadInformationPanel } from './RoadInformationPanel.js';
import { useViewportReports } from './useViewportReports.js';
import type { SelectedRoadSegment, StreetMode, UserLocation } from './types.js';
import { useAuth } from '../../auth/AuthContext.js';
import type { AddressSearchResult } from '../../api/addressesApi.js';
import { MapFilters } from './MapFilters.js';
import { useMapReportFilters } from './useMapReportFilters.js';
import { filtersActiveCount } from './mapReportFilters.js';
import { MapLegend } from './MapLegend.js';
import { MapLayerControls } from './MapLayerControls.js';
import { MapLayerLegend } from './MapLayerLegend.js';
import { MapFeaturesLayer } from './MapFeaturesLayer.js';
import { ZonesLayer } from './ZonesLayer.js';
import type { ZoneMetric, ZoneSelection } from './zoneColors.js';
import { ALL_MAP_CATEGORIES, categoryOfReportType, type MapCategory } from './mapCategories.js';
import type { StreetRoadClass } from '../../api/streetScoreTypes.js';
import type {
  SpecialTreatment,
  SurfaceCondition,
  SurfaceType,
} from '../../api/roadInformationTypes.js';

function readViewportBounds(map: ReturnType<typeof useMapInstance>): ViewportBounds {
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
  const map = useMapInstance();
  useEffect(() => {
    focusMap(map, location.latitude, location.longitude);
  }, [location.latitude, location.longitude, map]);
  return null;
}

function ReportFocus({ location }: { location: UserLocation | null }) {
  const map = useMapInstance();
  useEffect(() => {
    if (location) focusMap(map, location.latitude, location.longitude);
  }, [location, map]);
  return null;
}

function MapQueryFocus() {
  const map = useMapInstance();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const latitude = Number(params.get('focusLat'));
    const longitude = Number(params.get('focusLng'));
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      focusMap(map, latitude, longitude);
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
  const [isSelectingRoadSegment, setIsSelectingRoadSegment] = useState(false);
  const [selectedRoadSegment, setSelectedRoadSegment] = useState<SelectedRoadSegment | null>(null);
  const [isReportFormOpen, setIsReportFormOpen] = useState(false);
  const [reportLocation, setReportLocation] = useState<UserLocation | null>(null);
  const [reportFocusLocation, setReportFocusLocation] = useState<UserLocation | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
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
  const [visibleCategories, setVisibleCategories] = useState<MapCategory[]>(ALL_MAP_CATEGORIES);
  const [streetMode, setStreetMode] = useState<StreetMode>('condition');
  const [zoneSelection, setZoneSelection] = useState<ZoneSelection>('none');
  const [zoneMetric, setZoneMetric] = useState<ZoneMetric>('condition');
  const [surfaceTypes, setSurfaceTypes] = useState<SurfaceType[] | null>(null);
  const [surfaceConditions, setSurfaceConditions] = useState<SurfaceCondition[] | null>(null);
  const [surfaceTreatments, setSurfaceTreatments] = useState<SpecialTreatment[] | null>(null);
  const [conditionLevels, setConditionLevels] = useState<string[] | null>(null);
  const [roadClasses, setRoadClasses] = useState<StreetRoadClass[]>([
    'PRIMARY',
    'SECONDARY',
    'LOCAL',
  ]);
  const roadInfoReturnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!selectedRoadSegment) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedRoadSegment(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      roadInfoReturnFocusRef.current?.focus();
    };
  }, [selectedRoadSegment]);
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
    setIsSelectingRoadSegment(false);
    setReportSuccess(false);
    setReportLocation(null);
    setIsReportFormOpen(false);
    setIsPickingReportLocation(true);
  }

  function startRoadInformation() {
    if (!user) {
      openAuthDialog();
      return;
    }
    setIsPickingReportLocation(false);
    setIsReportFormOpen(false);
    setSelectedRoadSegment(null);
    roadInfoReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setIsSelectingRoadSegment(true);
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
      <MapCanvas className="street-map">
        <ViewportReports onViewportChange={handleViewportChange} />
        <MapQueryFocus />
        <ZonesLayer
          selection={zoneSelection}
          metric={zoneMetric}
          interactive={!isPickingReportLocation && !isSelectingRoadSegment}
        />
        <StreetScoreLayer
          refreshKey={scoreRefreshKey}
          mode={streetMode}
          levels={conditionLevels}
          roadClasses={roadClasses}
          surfaceTypes={surfaceTypes}
          surfaceConditions={surfaceConditions}
          surfaceTreatments={surfaceTreatments}
          selectingRoadSegment={isSelectingRoadSegment}
          onRoadSegmentSelected={(segment) => {
            setIsSelectingRoadSegment(false);
            setSelectedRoadSegment(segment);
          }}
          onViewStreetReports={(id, name) => {
            setStreetReportTarget({ id, name });
            setVisibleCategories(ALL_MAP_CATEGORIES);
          }}
        />
        <ReportFocus location={reportFocusLocation} />
        <ReportLocationPicker
          active={isPickingReportLocation}
          location={reportLocation}
          onSelect={selectReportLocation}
        />
        <MapFeaturesLayer categories={visibleCategories} />
        {reports
          .filter((report) => visibleCategories.includes(categoryOfReportType(report.type)))
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
            <MapMarker
              position={[userLocation.latitude, userLocation.longitude]}
              className="user-marker-wrapper"
              html='<span class="user-marker" aria-hidden="true"><span></span></span>'
              size={[28, 28]}
              anchor="center"
              zIndex={1000}
              popup="Mi ubicación"
            />
          </>
        )}
      </MapCanvas>
      {selectedRoadSegment && (
        <>
          <button
            className="road-information-backdrop"
            type="button"
            aria-label="Cerrar información de calle"
            onClick={() => setSelectedRoadSegment(null)}
          />
          <aside
            className="road-information-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="road-information-title"
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return;
              const focusable = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
                ),
              );
              const first = focusable[0];
              const last = focusable.at(-1);
              if (!first || !last) return;
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <header>
              <div>
                <span className="road-information-eyebrow">Tramo oficial seleccionado</span>
                <h2 id="road-information-title">{selectedRoadSegment.streetName}</h2>
                <p>
                  {selectedRoadSegment.lengthMeters !== null
                    ? `Extensión aproximada: ${Math.round(selectedRoadSegment.lengthMeters)} m. `
                    : ''}
                  La propuesta se aplica a este tramo completo.
                </p>
              </div>
              <button
                type="button"
                className="road-information-close"
                aria-label="Cerrar"
                onClick={() => setSelectedRoadSegment(null)}
              >
                ×
              </button>
            </header>
            <RoadInformationPanel
              key={selectedRoadSegment.id}
              segmentId={selectedRoadSegment.id}
              authenticated={Boolean(user)}
              onRequestLogin={openAuthDialog}
              onChanged={() => setScoreRefreshKey((current) => current + 1)}
              initialFormOpen
            />
          </aside>
        </>
      )}
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
        categories={visibleCategories}
        mode={streetMode}
        zoneSelection={zoneSelection}
        zoneMetric={zoneMetric}
        onZoneSelectionChange={setZoneSelection}
        onZoneMetricChange={setZoneMetric}
        levels={conditionLevels}
        roadClasses={roadClasses}
        surfaceTypes={surfaceTypes}
        surfaceConditions={surfaceConditions}
        surfaceTreatments={surfaceTreatments}
        onCategoriesChange={setVisibleCategories}
        onModeChange={setStreetMode}
        onLevelsChange={setConditionLevels}
        onRoadClassesChange={setRoadClasses}
        onSurfaceTypesChange={setSurfaceTypes}
        onSurfaceConditionsChange={setSurfaceConditions}
        onSurfaceTreatmentsChange={setSurfaceTreatments}
      />
      {streetReportTarget && visibleCategories.length > 0 && (
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
      <MapLayerLegend
        mode={streetMode}
        levels={conditionLevels}
        surfaceTypes={surfaceTypes}
        categories={visibleCategories}
        zoneSelection={zoneSelection}
        zoneMetric={zoneMetric}
      />
      <MapLegend open={legendOpen} onClose={closeLegend} />
      <div className="map-toolbar">
        <button
          className="report-start-button"
          type="button"
          onClick={startReport}
          disabled={isPickingReportLocation || isReportFormOpen || isSelectingRoadSegment}
        >
          + Reportar problema
        </button>
        <button
          className="report-start-button road-information-start-button"
          type="button"
          onClick={startRoadInformation}
          disabled={isPickingReportLocation || isReportFormOpen || isSelectingRoadSegment}
        >
          + Informar calle
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
      {isSelectingRoadSegment && (
        <div className="report-pick-prompt" role="status">
          <strong>Elegí el tramo de calle</strong>
          <span>Tocá una línea del mapa para proponer información de ese segmento.</span>
          <button type="button" onClick={() => setIsSelectingRoadSegment(false)}>
            Cancelar
          </button>
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
