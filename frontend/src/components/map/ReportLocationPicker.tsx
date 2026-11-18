import { MapMarker, useMapEvents } from './maplibre/mapLibre.js';
import type { UserLocation } from './types.js';

interface ReportLocationPickerProps {
  active: boolean;
  location: UserLocation | null;
  onSelect: (location: UserLocation) => void;
}

export function ReportLocationPicker({ active, location, onSelect }: ReportLocationPickerProps) {
  useMapEvents({
    click: (event) => {
      if (active) onSelect({ latitude: event.lat, longitude: event.lng });
    },
  });

  if (!location) return null;

  return (
    <MapMarker
      position={[location.latitude, location.longitude]}
      className="draft-marker-wrapper"
      html='<span class="draft-marker" aria-hidden="true"></span>'
      size={[34, 42]}
      anchor="bottom"
      offset={[0, 4]}
      zIndex={900}
      popup="Ubicación seleccionada"
    />
  );
}
