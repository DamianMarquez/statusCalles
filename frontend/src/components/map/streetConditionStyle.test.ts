import { describe, expect, it } from 'vitest';
import { NO_STREET_CONDITION_COLOR } from './streetConditionCatalog.js';
import { streetConditionLineStyle } from './streetConditionStyle.js';

describe('streetConditionLineStyle', () => {
  it('uses four visual bands without changing score levels', () => {
    expect(streetConditionLineStyle('EXCELLENT', 16, 'OPEN').color).toBe('#6f9f78');
    expect(streetConditionLineStyle('GOOD', 16, 'OPEN').color).toBe('#6f9f78');
    expect(streetConditionLineStyle('ACCEPTABLE', 16, 'OPEN').color).toBe('#c8ae55');
    expect(streetConditionLineStyle('UNCOMFORTABLE', 16, 'OPEN').color).toBe('#cc8654');
    expect(streetConditionLineStyle('CRITICAL', 16, 'OPEN').color).toBe('#c66a5e');
  });

  it('keeps segments without evidence visually distinct and gray', () => {
    expect(streetConditionLineStyle(null, 16, 'UNKNOWN').color).toBe(NO_STREET_CONDITION_COLOR);
  });

  it('keeps the center line crisp and increases its weight when close', () => {
    const distant = streetConditionLineStyle('GOOD', 12, 'OPEN');
    const close = streetConditionLineStyle('GOOD', 16, 'OPEN');
    expect(distant.weight).toBe(2.25);
    expect(distant.opacity).toBe(0.92);
    expect(close.weight).toBe(3);
    expect(close.opacity).toBe(0.92);
    expect(close.weight).toBeGreaterThan(distant.weight);
    expect(close.opacity).toBe(distant.opacity);
  });

  it('marks known blocked availability with a dashed line', () => {
    expect(streetConditionLineStyle('BAD', 16, 'BLOCKED').dashArray).toBe('7 5');
  });
});
