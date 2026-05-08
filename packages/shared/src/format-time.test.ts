/**
 * Unit tests for formatElapsed in packages/shared/src/format-time.ts.
 *
 * formatElapsed converts a millisecond duration to an "M:SS" string.
 * It is used by VoteResultsComponent, EstimatingPage, and
 * RoundHistoryComponent; a shared implementation replaced the three
 * previously-duplicated helpers (hence the package-level test).
 */

import { describe, expect, it } from 'vitest';
import { formatElapsed } from './format-time.js';

describe('formatElapsed', () => {
  it('0 ms → "0:00"', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });

  it('999 ms rounds down to 0 seconds → "0:00"', () => {
    expect(formatElapsed(999)).toBe('0:00');
  });

  it('1000 ms → "0:01"', () => {
    expect(formatElapsed(1000)).toBe('0:01');
  });

  it('59 999 ms → "0:59" (just under one minute)', () => {
    expect(formatElapsed(59_999)).toBe('0:59');
  });

  it('60 000 ms → "1:00" (exactly one minute)', () => {
    expect(formatElapsed(60_000)).toBe('1:00');
  });

  it('61 000 ms → "1:01" (seconds are zero-padded)', () => {
    expect(formatElapsed(61_000)).toBe('1:01');
  });

  it('600 000 ms → "10:00" (ten minutes, no zero-padding on minutes)', () => {
    expect(formatElapsed(600_000)).toBe('10:00');
  });

  it('3 661 000 ms → "61:01" (more than an hour, no hour component)', () => {
    expect(formatElapsed(3_661_000)).toBe('61:01');
  });

  it('negative input is clamped to 0 → "0:00"', () => {
    expect(formatElapsed(-5_000)).toBe('0:00');
  });

  it('seconds component is always two digits', () => {
    // 70 000 ms = 1 min 10 sec → "1:10", seconds already two-digit
    expect(formatElapsed(70_000)).toBe('1:10');
    // 65 000 ms = 1 min 5 sec → "1:05", single-digit second must be padded
    expect(formatElapsed(65_000)).toBe('1:05');
  });
});
