import { describe, expect, it, vi } from 'vitest';
import { GeolocationError, requestUserLocation } from './geolocation.js';

describe('requestUserLocation', () => {
  it('returns the browser coordinates', async () => {
    const provider = {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success({
          coords: { latitude: -34.6, longitude: -58.4 } as GeolocationCoordinates,
        } as GeolocationPosition);
      }),
    };

    await expect(requestUserLocation(provider)).resolves.toEqual({
      latitude: -34.6,
      longitude: -58.4,
    });
  });

  it('reports a permission denial with a typed error', async () => {
    const permissionError = Object.assign(new Error('denied'), {
      code: 1,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    }) as GeolocationPositionError;
    const provider = {
      getCurrentPosition: vi.fn((_: PositionCallback, failure: PositionErrorCallback) => {
        failure(permissionError);
      }),
    };

    await expect(requestUserLocation(provider)).rejects.toEqual(
      new GeolocationError('permission-denied'),
    );
  });

  it('reports a timeout with a typed error', async () => {
    const timeoutError = Object.assign(new Error('timed out'), {
      code: 3,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    }) as GeolocationPositionError;
    const provider = {
      getCurrentPosition: vi.fn((_: PositionCallback, failure: PositionErrorCallback) => {
        failure(timeoutError);
      }),
    };

    await expect(requestUserLocation(provider)).rejects.toEqual(new GeolocationError('timeout'));
  });

  it('handles browsers without geolocation support', async () => {
    await expect(requestUserLocation(undefined)).rejects.toEqual(
      new GeolocationError('unsupported'),
    );
  });
});
