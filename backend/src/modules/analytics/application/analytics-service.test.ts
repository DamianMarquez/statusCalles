import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from './analytics-service.js';

describe('AnalyticsService', () => {
  it('uses current evidence for score rankings regardless of the chart time filter', async () => {
    const repository = {
      streets: vi
        .fn()
        .mockResolvedValue([
          { id: 'street-1', officialName: 'Avenida Uno', reports: 5, active: 4, high_severity: 2 },
        ]),
      segments: vi
        .fn()
        .mockResolvedValue([
          { id: 'segment-1', streetId: 'street-1', officialName: 'Avenida Uno', reports: 3 },
        ]),
    };
    const streetScores = {
      findForStreet: vi.fn().mockResolvedValue({ score: 41, level: 'BAD', confidence: 'MEDIUM' }),
      findForSegment: vi.fn().mockResolvedValue({ score: 35, level: 'BAD', confidence: 'LOW' }),
    };
    const service = new AnalyticsService(repository as never, streetScores as never);
    const filters = { from: new Date('2026-01-01T00:00:00Z'), type: 'POTHOLE' as const };

    const streets = await service.streets(filters, 5);
    const segments = await service.segments(filters, 5);

    expect(repository.streets).toHaveBeenCalledWith({}, 5);
    expect(repository.segments).toHaveBeenCalledWith({}, 5);
    expect(streetScores.findForStreet).toHaveBeenCalledWith('street-1');
    expect(streetScores.findForSegment).toHaveBeenCalledWith('segment-1');
    expect(streets).toMatchObject([{ score: { score: 41, level: 'BAD' } }]);
    expect(segments).toMatchObject([{ score: { score: 35, level: 'BAD' } }]);
  });
});
