import type { StreetLocationRepository } from './street-location-resolver.js';

export interface StreetDetail {
  id: string;
  officialName: string;
  normalizedName: string;
  segmentCount: number;
  neighborhoods: string[];
  communes: string[];
}

export interface NearbyStreet {
  id: string;
  officialName: string;
  distanceMeters: number;
  neighborhoodName: string | null;
  communeName: string | null;
}

export interface TerritoryDto {
  id: number;
  name: string;
  communeId?: number;
  geometry: unknown;
}

export interface StreetCatalogRepository extends StreetLocationRepository {
  findStreet(id: string): Promise<StreetDetail | null>;
  findNearbyStreets(query: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  }): Promise<NearbyStreet[]>;
  listNeighborhoods(): Promise<TerritoryDto[]>;
  listCommunes(): Promise<TerritoryDto[]>;
}

export class StreetCatalogService {
  constructor(private readonly repository: StreetCatalogRepository) {}

  findStreet(id: string) {
    return this.repository.findStreet(id);
  }

  findNearbyStreets(query: { latitude: number; longitude: number; radiusMeters: number }) {
    return this.repository.findNearbyStreets(query);
  }

  listNeighborhoods() {
    return this.repository.listNeighborhoods();
  }

  listCommunes() {
    return this.repository.listCommunes();
  }

  findNearestStreetSegment(latitude: number, longitude: number, maxDistanceMeters: number) {
    return this.repository.findNearestStreetSegment(latitude, longitude, maxDistanceMeters);
  }
}
