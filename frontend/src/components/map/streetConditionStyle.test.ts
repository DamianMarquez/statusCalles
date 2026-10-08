import { describe, expect, it } from 'vitest';
import { NO_STREET_CONDITION_COLOR } from './streetConditionCatalog.js';
import { streetConditionLineStyle } from './streetConditionStyle.js';

describe('streetConditionLineStyle', () => {
  it('uses four visual bands without changing score levels', () => {
    expect(streetConditionLineStyle('EXCELLENT', 16, 'OPEN').color).toBe('#76bd83');
    expect(streetConditionLineStyle('GOOD', 16, 'OPEN').color).toBe('#76bd83');
    expect(streetConditionLineStyle('ACCEPTABLE', 16, 'OPEN').color).toBe('#e8c84b');
    expect(streetConditionLineStyle('UNCOMFORTABLE', 16, 'OPEN').color).toBe('#eb963f');
    expect(streetConditionLineStyle('CRITICAL', 16, 'OPEN').color).toBe('#d95a45');
  });

  it('keeps segments without evidence visually distinct and gray', () => {
    expect(streetConditionLineStyle(null, 16, 'UNKNOWN').color).toBe(NO_STREET_CONDITION_COLOR);
  });

  it('increases line weight and opacity at detailed zoom', () => {
    const distant = streetConditionLineStyle('GOOD', 12, 'OPEN');
    const close = streetConditionLineStyle('GOOD', 16, 'OPEN');
    expect(close.weight).toBeGreaterThan(distant.weight);
    expect(close.opacity).toBeGreaterThan(distant.opacity);
  });

  it('marks known blocked availability with a dashed line', () => {
    expect(streetConditionLineStyle('BAD', 16, 'BLOCKED').dashArray).toBe('7 5');
  });
});
