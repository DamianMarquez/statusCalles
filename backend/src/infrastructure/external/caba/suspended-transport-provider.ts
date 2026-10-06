import type {
  OfficialIncidentProvider,
  TrafficDataProvider,
  TrafficVolumeProvider,
} from '../../../modules/mobility/domain/mobility-data.js';

const unavailable = {
  available: false as const,
  reason: 'La API/GTFS de Transporte GCBA está publicada como suspendida y en revisión.',
};

/** Adapter placeholder: no HTTP calls are made while GCBA declares the API suspended. */
export class SuspendedGcbaTransportProvider
  implements TrafficDataProvider, OfficialIncidentProvider, TrafficVolumeProvider
{
  async getCurrentTraffic() {
    return unavailable;
  }

  async listActiveIncidents() {
    return unavailable;
  }

  async listMeasurements() {
    return unavailable;
  }
}
