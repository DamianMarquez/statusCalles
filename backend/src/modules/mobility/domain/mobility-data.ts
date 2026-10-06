export type MobilityInfrastructureType = 'BIKE_LANE' | 'METROBUS_CORRIDOR' | 'METROBUS_STOP';

export interface MobilityInfrastructureItem {
  id: string;
  type: MobilityInfrastructureType;
  name: string;
  details: Record<string, unknown>;
  source: { name: string; url: string; lastSuccessfulSync: string | null };
}

export interface MobilitySourceStatus {
  source: string;
  url: string;
  status: 'NEVER' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'SUSPENDED';
  lastAttempt: string | null;
  lastSuccessfulSync: string | null;
  recordsImported: number | null;
  errorMessage: string | null;
}

export interface TrafficDataProvider {
  getCurrentTraffic(): Promise<
    { available: true; observedAt: string; summary: string } | { available: false; reason: string }
  >;
}

export interface OfficialIncidentProvider {
  listActiveIncidents(): Promise<
    | {
        available: true;
        incidents: Array<{ externalId: string; type: string; description: string }>;
      }
    | { available: false; reason: string }
  >;
}

export interface TrafficVolumeProvider {
  listMeasurements(): Promise<
    | {
        available: true;
        measurements: Array<{ sensorId: string; measuredAt: string; vehicleCount: number }>;
      }
    | { available: false; reason: string }
  >;
}
