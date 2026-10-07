import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createReport,
  getMyReports,
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
    const page = { items: [report], hasMore: false };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => page });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getReportsInViewport(
        { south: -34.7, north: -34.5, west: -58.5, east: -58.3 },
        {},
        new AbortController().signal,
      ),
    ).resolves.toEqual(page);

    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      '/api/reports?south=-34.70000&north=-34.50000&west=-58.50000&east=-58.30000',
    );
  });

  it('reports API failures as a user-safe error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(
      getReportsInViewport(
        { south: -34.7, north: -34.5, west: -58.5, east: -58.3 },
        {},
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ReportsApiError);
  });

  it('serializes combined filters in a single bounded viewport request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ items: [report], hasMore: true }) }),
    );
    const page = await getReportsInViewport(
      { south: -34.7, north: -34.5, west: -58.5, east: -58.3 },
      {
        types: ['POTHOLE', 'FLOOD'],
        statuses: ['ACTIVE'],
        period: '7d',
        minSeverity: 'HIGH',
        onlyMine: true,
      },
      new AbortController().signal,
    );
    expect(page).toMatchObject({ items: [report], hasMore: true });
    const requestedUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(requestedUrl).toContain('types=POTHOLE%2CFLOOD');
    expect(requestedUrl).toContain('statuses=ACTIVE');
    expect(requestedUrl).toContain('period=7d');
    expect(requestedUrl).toContain('minSeverity=HIGH');
    expect(requestedUrl).toContain('onlyMine=true');
  });
});

describe('getMyReports', () => {
  it('uses the authenticated current-user endpoint and accepts a bounded page', async () => {
    const owned = {
      ...report,
      publiclyVisible: true,
      feedbackCount: 3,
      latestActivityAt: report.updatedAt,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ items: [owned], hasMore: false }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMyReports(20, 10)).resolves.toMatchObject({ items: [owned], hasMore: false });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/me/reports?limit=20&offset=10'),
      expect.objectContaining({ credentials: 'include' }),
    );
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
