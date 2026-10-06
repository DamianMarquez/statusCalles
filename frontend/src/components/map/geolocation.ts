import type { UserLocation } from './types.js';

export type GeolocationErrorKind = 'unsupported' | 'permission-denied' | 'timeout' | 'unavailable';

export class GeolocationError extends Error {
  constructor(public readonly kind: GeolocationErrorKind) {
    super(kind);
    this.name = 'GeolocationError';
  }
}

type GeolocationProvider = Pick<Geolocation, 'getCurrentPosition'>;

export function requestUserLocation(
  provider: GeolocationProvider | undefined,
  options?: PositionOptions,
): Promise<UserLocation> {
  if (!provider) {
    return Promise.reject(new GeolocationError('unsupported'));
  }

  return new Promise((resolve, reject) => {
    provider.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        const kind: GeolocationErrorKind =
          error.code === error.PERMISSION_DENIED
            ? 'permission-denied'
            : error.code === error.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        reject(new GeolocationError(kind));
      },
      options,
    );
  });
}
