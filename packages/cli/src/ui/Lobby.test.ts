/**
 * Unit tests for pure helpers exported from lobby-helpers.ts.
 * Imports the real implementations (no inline copies).
 */

import { describe, expect, it } from 'vitest';

import type { Round, Scale } from '@hnch/shared';

import { compactRoundSummary, computeStats, formatElapsed } from './lobby-helpers.js';

const SCALE: Scale = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8', '13'] };

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    scale: SCALE,
    votes: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeStats
// ---------------------------------------------------------------------------

describe('computeStats — empty / non-numeric', () => {
  it('returns all dashes when votes map is empty', () => {
    expect(computeStats({})).toEqual({ average: '-', median: '-', agreement: '-' });
  });

  it('returns all dashes when all votes are non-numeric strings', () => {
    expect(computeStats({ p1: 'XL', p2: 'S', p3: 'M' })).toEqual({
      average: '-',
      median: '-',
      agreement: '-',
    });
  });
});

describe('computeStats — numeric votes', () => {
  it('single voter: avg = median = vote, agreement = 100%', () => {
    expect(computeStats({ p1: '8' })).toEqual({
      average: '8.0',
      median: '8.0',
      agreement: '100%',
    });
  });

  it('two voters with same vote: 100% agreement', () => {
    expect(computeStats({ p1: '5', p2: '5' })).toEqual({
      average: '5.0',
      median: '5.0',
      agreement: '100%',
    });
  });

  it('two voters with different votes: avg, median, 50% agreement', () => {
    const stats = computeStats({ p1: '3', p2: '5' });
    expect(stats.average).toBe('4.0');
    expect(stats.median).toBe('4.0');
    expect(stats.agreement).toBe('50%');
  });

  it('three voters: correct average, median, and agreement', () => {
    // values sorted: [5, 5, 8] — avg = 6.0, median = 5.0, agreement = 2/3 ≈ 67%
    const stats = computeStats({ p1: '5', p2: '8', p3: '5' });
    expect(stats.average).toBe('6.0');
    expect(stats.median).toBe('5.0');
    expect(stats.agreement).toBe('67%');
  });

  it('four voters no majority: agreement = 25%', () => {
    const stats = computeStats({ p1: '1', p2: '2', p3: '3', p4: '4' });
    expect(stats.average).toBe('2.5');
    expect(stats.median).toBe('2.5');
    expect(stats.agreement).toBe('25%');
  });

  it('even count: median is average of two middle values', () => {
    // values: [2, 4] → median = (2+4)/2 = 3.0
    const stats = computeStats({ p1: '4', p2: '2' });
    expect(stats.median).toBe('3.0');
  });

  it('consensus: all four vote 13 → 100% agreement', () => {
    const stats = computeStats({ p1: '13', p2: '13', p3: '13', p4: '13' });
    expect(stats.agreement).toBe('100%');
  });
});

describe('computeStats — mixed numeric / non-numeric', () => {
  it('non-numeric votes are excluded from avg/median but included in agreement denominator', () => {
    // values for avg/median: [5] — avg=5.0, median=5.0
    // allVotes for agreement: ['5', 'XL'] — counts {'5':1,'XL':1}, maxCount=1, agr=50%
    const stats = computeStats({ p1: '5', p2: 'XL' });
    expect(stats.average).toBe('5.0');
    expect(stats.median).toBe('5.0');
    expect(stats.agreement).toBe('50%');
  });
});

// ---------------------------------------------------------------------------
// formatElapsed
// ---------------------------------------------------------------------------

describe('formatElapsed', () => {
  it('0 ms elapsed → 0:00', () => {
    expect(formatElapsed(0, 0)).toBe('0:00');
  });

  it('30 s → 0:30', () => {
    expect(formatElapsed(0, 30_000)).toBe('0:30');
  });

  it('60 s → 1:00', () => {
    expect(formatElapsed(0, 60_000)).toBe('1:00');
  });

  it('61 s → 1:01', () => {
    expect(formatElapsed(0, 61_000)).toBe('1:01');
  });

  it('pads seconds to two digits: 9 s → 0:09', () => {
    expect(formatElapsed(0, 9_000)).toBe('0:09');
  });

  it('offset start: computes delta correctly', () => {
    expect(formatElapsed(5_000, 65_000)).toBe('1:00');
  });

  it('large elapsed: 3661 s → 61:01', () => {
    expect(formatElapsed(0, 3_661_000)).toBe('61:01');
  });

  it('sub-second duration rounds down to 0:00', () => {
    expect(formatElapsed(1000, 1999)).toBe('0:00');
  });
});

// ---------------------------------------------------------------------------
// compactRoundSummary
// ---------------------------------------------------------------------------

describe('compactRoundSummary', () => {
  it('no votes → (no votes)', () => {
    expect(compactRoundSummary(makeRound(), 1)).toBe('Round 1: — (no votes)');
  });

  it('single vote → card×1', () => {
    expect(compactRoundSummary(makeRound({ votes: { p1: '5' } }), 1)).toBe('Round 1: — 5×1');
  });

  it('tally sorted by count descending', () => {
    expect(compactRoundSummary(makeRound({ votes: { p1: '5', p2: '5', p3: '8' } }), 2)).toBe(
      'Round 2: — 5×2, 8×1',
    );
  });

  it('equal counts sorted lexicographically', () => {
    expect(compactRoundSummary(makeRound({ votes: { p1: '8', p2: '3' } }), 1)).toBe(
      'Round 1: — 3×1, 8×1',
    );
  });

  it('includes title when set', () => {
    expect(compactRoundSummary(makeRound({ votes: { p1: '5' }, title: 'Login redesign' }), 1)).toBe(
      'Round 1: Login redesign — 5×1',
    );
  });

  it('includes ticketId when set', () => {
    expect(compactRoundSummary(makeRound({ votes: { p1: '5' }, ticketId: 'PROJ-123' }), 1)).toBe(
      'Round 1: [PROJ-123] — 5×1',
    );
  });

  it('includes both title and ticketId', () => {
    expect(
      compactRoundSummary(makeRound({ votes: { p1: '5' }, title: 'Auth', ticketId: 'AUTH-42' }), 3),
    ).toBe('Round 3: Auth [AUTH-42] — 5×1');
  });

  it('appends elapsed time when timerStartedAt and revealedAt present', () => {
    expect(
      compactRoundSummary(
        makeRound({ votes: { p1: '5' }, timerStartedAt: 0, revealedAt: 90_000 }),
        1,
      ),
    ).toBe('Round 1: — 5×1 — 1:30');
  });

  it('omits elapsed when only timerStartedAt is set (not yet revealed)', () => {
    expect(compactRoundSummary(makeRound({ votes: { p1: '5' }, timerStartedAt: 0 }), 1)).toBe(
      'Round 1: — 5×1',
    );
  });

  it('omits elapsed when only revealedAt is set (no timer start)', () => {
    expect(compactRoundSummary(makeRound({ votes: { p1: '5' }, revealedAt: 90_000 }), 1)).toBe(
      'Round 1: — 5×1',
    );
  });
});
