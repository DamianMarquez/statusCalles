import { describe, expect, it } from 'vitest';
import { REPORT_TYPE_OPTIONS } from '../../api/reportCatalog.js';
import {
  ALL_MAP_CATEGORIES,
  CALMING_TYPES,
  calmingLabel,
  categoryOfReportType,
} from './mapCategories.js';

describe('map categories', () => {
  it('assigns every report type to exactly one category', () => {
    for (const option of REPORT_TYPE_OPTIONS) {
      expect(ALL_MAP_CATEGORIES).toContain(categoryOfReportType(option.value));
    }
    expect(categoryOfReportType('ROAD_WORK')).toBe('works');
    expect(categoryOfReportType('ROAD_BLOCKED')).toBe('works');
    expect(categoryOfReportType('POTHOLE')).toBe('damage');
    expect(categoryOfReportType('ROAD_SUBSIDENCE')).toBe('damage');
    expect(categoryOfReportType('FLOOD')).toBe('other');
  });

  it('labels every imported speed reducer type', () => {
    expect(CALMING_TYPES.map((item) => item.value)).toEqual([
      'SPEED_BUMP',
      'SPEED_HUMP',
      'RAISED_CROSSING',
      'DIP',
      'CUSHION',
      'NARROWING',
      'RUMBLE_STRIP',
    ]);
    expect(calmingLabel('DIP')).toBe('Badén');
    expect(calmingLabel('UNKNOWN')).toBe('Reductor de velocidad');
  });
});
