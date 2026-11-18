import { describe, expect, it, vi } from 'vitest';
import { StreetScoreRefresher } from './street-score-refresher.js';
import type { StreetScoreStore, StreetScoreUpdate } from './street-score-store.js';
import type { StreetScoreReportInput } from './street-score-repository.js';

const now = new Date('2026-10-08T12:00:00Z');

function reportInput(severity: 'LOW' | 'CRITICAL'): StreetScoreReportInput {
  return {
    report: {
      id: `r-${severity}`,
      type: 'POTHOLE',
      severity,
      description: 'Bache',
      location: { latitude: -34.6, longitude: -58.4 },
      status: 'ACTIVE',
      createdAt: new Date('2026-10-07T12:00:00Z'),
      updatedAt: new Date('2026-10-07T12:00:00Z'),
    },
    feedback: {
      confirmations: 0,
      resolvedReports: 0,
      userFeedback: null,
      weightedConfirmations: 0,
      weightedResolvedReports: 0,
      latestConfirmationAt: null,
    },
    actorId: `u-${severity}`,
    segmentId: 'seg-1',
  };
}

function fakeStore(overrides: Partial<StreetScoreStore> = {}) {
  const saved: StreetScoreUpdate[][] = [];
  const store: StreetScoreStore = {
    findStreetEvidence: vi.fn().mockResolvedValue([]),
    saveStreetScores: vi.fn(async (updates) => {
      saved.push(updates);
    }),
    findStreetIdByReportId: vi.fn().mockResolvedValue(null),
    findStreetIdsToRefresh: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return { store, saved };
}

describe('StreetScoreRefresher', () => {
  it('stores segment and street scores when there is evidence', async () => {
    const { store, saved } = fakeStore({
      findStreetEvidence: vi.fn().mockResolvedValue([
        {
          streetId: 'street-1',
          segments: [{ id: 'seg-1', reports: [reportInput('CRITICAL')] }],
        },
      ]),
    });
    await new StreetScoreRefresher(store, () => now).refreshStreets(['street-1']);

    const update = saved[0]?.[0];
    expect(update?.streetId).toBe('street-1');
    expect(update?.segments).toHaveLength(1);
    expect(update?.segments[0]).toMatchObject({ id: 'seg-1', hasEvidence: true });
    expect(update?.segments[0]?.score).toBeLessThan(75);
    expect(update?.street).toMatchObject({ id: 'street-1', hasEvidence: true });
  });

  it('keeps the table sparse: a street without evidence stores nothing', async () => {
    const { store, saved } = fakeStore();
    await new StreetScoreRefresher(store, () => now).refreshStreets(['street-2']);
    expect(saved[0]).toEqual([{ streetId: 'street-2', street: null, segments: [] }]);
  });

  it('refreshes the street that owns a changed report', async () => {
    const { store } = fakeStore({
      findStreetIdByReportId: vi.fn().mockResolvedValue('street-1'),
    });
    await new StreetScoreRefresher(store, () => now).refreshForReport('report-1');
    expect(store.findStreetEvidence).toHaveBeenCalledWith(['street-1'], now);
  });

  it('never throws when the refresh fails', async () => {
    const { store } = fakeStore({
      findStreetIdByReportId: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      new StreetScoreRefresher(store, () => now).refreshForReport('report-1'),
    ).resolves.toBeUndefined();
    error.mockRestore();
  });

  it('refreshAll processes streets in batches', async () => {
    const ids = Array.from({ length: 5 }, (_, index) => `street-${index}`);
    const { store } = fakeStore({ findStreetIdsToRefresh: vi.fn().mockResolvedValue(ids) });
    const count = await new StreetScoreRefresher(store, () => now).refreshAll(2);
    expect(count).toBe(5);
    expect(store.saveStreetScores).toHaveBeenCalledTimes(3);
  });
});
