import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReportsInViewport, ReportsApiError } from './reportsApi.js';
import type { ReportDto } from './reportTypes.js';

const report: ReportDto = {
  id: 'report-1',
  type: 'POTHOLE',
  severity: 'HIGH',
  description: 'Bache grande sobre el carril derecho',
  location: { latitude: -34.6037, longitude: -58.3816 },
  status: 'ACTIVE',
  createdAt: '2026-10-06T12:00:00.000Z',
  updatedAt: '2026-10-06T12:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('getReportsInViewport', () => {
  it('requests and returns reports for the visible bounds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [report] });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getReportsInViewport(
        { south: -34.7, north: -34.5, west: -58.5, east: -58.3 },
        new AbortController().signal,
      ),
    ).resolves.toEqual([report]);

    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      '/api/reports?south=-34.70000&north=-34.50000&west=-58.50000&east=-58.30000',
    );
  });

  it('reports API failures as a user-safe error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(
      getReportsInViewport(
        { south: -34.7, north: -34.5, west: -58.5, east: -58.3 },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ReportsApiError);
  });
});
