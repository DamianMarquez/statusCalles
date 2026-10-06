import { describe, expect, it } from 'vitest';
import { SuspendedGcbaTransportProvider } from './suspended-transport-provider.js';

describe('suspended GCBA transport provider', () => {
  it('reports unavailable for live traffic, incidents, and volumes without fabricating records', async () => {
    const provider = new SuspendedGcbaTransportProvider();
    await expect(provider.getCurrentTraffic()).resolves.toMatchObject({ available: false });
    await expect(provider.listActiveIncidents()).resolves.toMatchObject({ available: false });
    await expect(provider.listMeasurements()).resolves.toMatchObject({ available: false });
  });
});
