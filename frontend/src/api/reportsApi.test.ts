import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createReport,
  getReportsInViewport,
  ReportsApiError,
  submitReportFeedback,
} from './reportsApi.js';
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
  feedback: { confirmations: 0, resolvedReports: 0, userFeedback: null },
  freshness: {
    level: 'FRESH',
    confidence: 15,
    lastActivityAt: '2026-10-06T12:00:00.000Z',
    evaluatedAt: '2026-10-06T12:00:00.000Z',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem('street-status-voter-id');
});

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

describe('createReport', () => {
  it('posts report details and returns the created API DTO', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => report });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createReport({
        type: 'POTHOLE',
        severity: 'HIGH',
        description: 'Bache grande sobre el carril derecho',
        latitude: -34.6037,
        longitude: -58.3816,
      }),
    ).resolves.toEqual(report);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/reports'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('exposes backend validation errors as a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    await expect(
      createReport({ type: 'POTHOLE', severity: 'HIGH', latitude: 91, longitude: 0 }),
    ).rejects.toThrow('Revisá el tipo, la severidad y la ubicación del reporte.');
  });

  it('surfaces duplicate warnings and supports an explicit override', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409 }));
    await expect(
      createReport({ type: 'POTHOLE', severity: 'HIGH', latitude: -34.6, longitude: -58.4 }),
    ).rejects.toMatchObject({ code: 'SIMILAR_REPORT_EXISTS' });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => report });
    vi.stubGlobal('fetch', fetchMock);
    await createReport(
      { type: 'POTHOLE', severity: 'HIGH', latitude: -34.6, longitude: -58.4 },
      true,
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      allowSimilar: true,
    });
  });

  it('submits a feedback vote and returns the updated aggregate', async () => {
    const updatedReport: ReportDto = {
      ...report,
      feedback: { confirmations: 1, resolvedReports: 0, userFeedback: 'CONFIRM' },
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => updatedReport });
    vi.stubGlobal('fetch', fetchMock);

    await expect(submitReportFeedback('report-1', 'CONFIRM')).resolves.toEqual(updatedReport);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/reports/report-1/feedback'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });
});
