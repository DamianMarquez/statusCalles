import { afterEach, describe, expect, it } from 'vitest';
import type { MapReportFilters } from '../../api/reportTypes.js';
import {
  filtersActiveCount,
  readMapReportFilters,
  writeMapReportFilters,
} from './mapReportFilters.js';

afterEach(() => window.history.replaceState({}, '', '/'));

describe('map report filter URL state', () => {
  it('reads validated filters from the current search string', () => {
    expect(
      readMapReportFilters('?types=POTHOLE,FLOOD&statuses=ACTIVE,RESOLVED&period=7d&onlyMine=true'),
    ).toEqual({
      types: ['POTHOLE', 'FLOOD'],
      statuses: ['ACTIVE', 'RESOLVED'],
      period: '7d',
      onlyMine: true,
    });
    expect(readMapReportFilters('?types=INVALID&statuses=REJECTED&period=not-a-period')).toEqual(
      {},
    );
  });

  it('writes filters to a shareable query string and preserves other map query state', () => {
    window.history.replaceState({}, '', '/?focusId=report-1');
    const filters: MapReportFilters = {
      types: ['POTHOLE', 'FLOOD'],
      statuses: ['ACTIVE'],
      fromDate: '2026-10-01T03:00:00.000Z',
      onlyMine: true,
    };
    writeMapReportFilters(filters);
    const params = new URLSearchParams(window.location.search);
    expect(params.get('focusId')).toBe('report-1');
    expect(params.get('types')).toBe('POTHOLE,FLOOD');
    expect(params.get('statuses')).toBe('ACTIVE');
    expect(params.get('fromDate')).toBe('2026-10-01T03:00:00.000Z');
    expect(params.get('onlyMine')).toBe('true');
    expect(filtersActiveCount(filters)).toBe(4);
  });

  it('preserves intentionally empty type and status selections after a reload', () => {
    expect(readMapReportFilters('?types=NONE&statuses=NONE')).toEqual({ types: [], statuses: [] });
  });
});
