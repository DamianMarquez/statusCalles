import { useEffect, useState } from 'react';
import { divIcon } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { GeolocationError, requestUserLocation } from './geolocation.js';
import { mapConfig } from './mapConfig.js';
import { mockReports } from './mockReports.js';
import type { MapReport, ReportCategory, UserLocation } from './types.js';
import 'leaflet/dist/leaflet.css';

const reportCategoryLabels: Record<ReportCategory, string> = {
  pothole: 'Bache',
  flooding: 'Inundación',
  construction: 'Obra',
};

function reportIcon(category: ReportCategory) {
  return divIcon({
    className: 'report-marker-wrapper',
    html: `<span class="report-marker report-marker--${category}" aria-hidden="true"></span>`,
    iconSize: [32, 38],
    iconAnchor: [16, 34],
    popupAnchor: [0, -32],
  });
}

const currentLocationIcon = divIcon({
  className: 'user-marker-wrapper',
  html: '<span class="user-marker" aria-hidden="true"><span></span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function LocationFocus({ location }: { location: UserLocation }) {
  const map = useMap();
  useEffect(() => {
    map.setView([location.latitude, location.longitude], Math.max(map.getZoom(), 16), {
      animate: true,
    });
  }, [location.latitude, location.longitude, map]);
  return null;
}

function ReportMarker({ report }: { report: MapReport }) {
  return (
    <Marker position={[report.position[0], report.position[1]]} icon={reportIcon(report.category)}>
      <Popup>
        <div className="report-popup">
          <span className={`report-popup__type report-popup__type--${report.category}`}>
            {reportCategoryLabels[report.category]}
          </span>
          <strong>{report.title}</strong>
          <span>{report.description}</span>
        </div>
      </Popup>
    </Marker>
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
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

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
        {mockReports.map((report) => (
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
        {(['pothole', 'flooding', 'construction'] as const).map((category) => (
          <span className="map-legend__item" key={category}>
            <span className={`map-legend__dot map-legend__dot--${category}`} />
            {reportCategoryLabels[category]}
          </span>
        ))}
      </div>
    </section>
  );
}
