export interface StreetLocationResolution {
  streetId: string;
  streetSegmentId: string;
}

export interface StreetLocationResolver {
  resolveStreetFromLocation(
    latitude: number,
    longitude: number,
  ): Promise<StreetLocationResolution | null>;
}

export interface StreetLocationRepository {
  findNearestStreetSegment(
    latitude: number,
    longitude: number,
    maxDistanceMeters: number,
  ): Promise<StreetLocationResolution | null>;
}

export class StreetLocationResolverService implements StreetLocationResolver {
  constructor(
    private readonly repository: StreetLocationRepository,
    private readonly maxDistanceMeters = 35,
  ) {}

  resolveStreetFromLocation(
    latitude: number,
    longitude: number,
  ): Promise<StreetLocationResolution | null> {
    return this.repository.findNearestStreetSegment(latitude, longitude, this.maxDistanceMeters);
  }
}
