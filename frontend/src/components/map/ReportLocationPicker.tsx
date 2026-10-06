import { divIcon, type LeafletMouseEvent } from 'leaflet';
import { Marker, Popup, useMapEvents } from 'react-leaflet';
import type { UserLocation } from './types.js';

const draftIcon = divIcon({
  className: 'draft-marker-wrapper',
  html: '<span class="draft-marker" aria-hidden="true"></span>',
  iconSize: [34, 42],
  iconAnchor: [17, 38],
});

interface ReportLocationPickerProps {
  active: boolean;
  location: UserLocation | null;
  onSelect: (location: UserLocation) => void;
}

export function ReportLocationPicker({ active, location, onSelect }: ReportLocationPickerProps) {
  useMapEvents({
    click: (event: LeafletMouseEvent) => {
      if (active) {
        onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng });
      }
    },
  });

  if (!location) return null;

  return (
    <Marker position={[location.latitude, location.longitude]} icon={draftIcon} zIndexOffset={900}>
      <Popup>Ubicación seleccionada</Popup>
    </Marker>
  );
}
