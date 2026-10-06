import { useCallback, useEffect, useState } from 'react';
import { divIcon } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { GeolocationError, requestUserLocation } from './geolocation.js';
import { mapConfig } from './mapConfig.js';
import type { ViewportBounds } from '../../api/reportTypes.js';
import { ReportMarker } from './ReportMarker.js';
import { reportTypeLabelsForMap } from './ReportMarkerPopup.js';
import { useViewportReports } from './useViewportReports.js';
import type { UserLocation } from './types.js';
import 'leaflet/dist/leaflet.css';

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
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const { reports, status: reportStatus, requestBounds, retry } = useViewportReports();
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
    <section className="map-stage" aria-label="Mapa de calles de Buenos Aires">
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
        {reports.map((report) => (
          <ReportMarker key={report.id} report={report} />
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
