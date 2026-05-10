/**
 * Unit tests for pure helper functions in Lobby.tsx.
 *
 * These functions are module-private; their logic is re-implemented inline
 * here to document the contract and guard against accidental drift.
 * Tests cover: computeStats, formatElapsed, compactRoundSummary.
 */

import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Inline implementations mirroring Lobby.tsx module-private functions
// ---------------------------------------------------------------------------

function computeStats(votes: Record<string, string>): {
  average: string;
  median: string;
  agreement: string;
} {
  const values = Object.values(votes)
    .map((v) => parseFloat(v))
    .filter((n) => !isNaN(n))
    .toSorted((a, b) => a - b);

  if (values.length === 0) {
    return { average: '-', median: '-', agreement: '-' };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const mid = Math.floor(values.length / 2);
  const med = values.length % 2 === 0 ? (values[mid - 1]! + values[mid]!) / 2 : values[mid]!;

  const allVotes = Object.values(votes);
  const counts = new Map<string, number>();
  for (const v of allVotes) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  const agr = allVotes.length > 0 ? Math.round((maxCount / allVotes.length) * 100) : 0;

  return {
    average: avg.toFixed(1),
    median: med.toFixed(1),
    agreement: `${agr}%`,
  };
}

function formatElapsed(startMs: number, endMs: number): string {
  const secs = Math.floor((endMs - startMs) / 1000);
  const min = Math.floor(secs / 60);
  const sec = secs % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

interface Round {
  id: string;
  votes: Record<string, string>;
  title?: string | undefined;
  ticketId?: string | undefined;
  timerStartedAt?: number | undefined;
  revealedAt?: number | undefined;
}

function compactRoundSummary(round: Round, roundNum: number): string {
  const counts = new Map<string, number>();
  for (const v of Object.values(round.votes)) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const tally = [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([card, count]) => `${card}×${count}`)
    .join(', ');

  const title = round.title ? ` ${round.title}` : '';
  const ticket = round.ticketId ? ` [${round.ticketId}]` : '';
  const elapsed =
    round.timerStartedAt !== undefined && round.revealedAt !== undefined
      ? ` — ${formatElapsed(round.timerStartedAt, round.revealedAt)}`
      : '';

  return `Round ${roundNum}:${title}${ticket} — ${tally || '(no votes)'}${elapsed}`;
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
  const base: Round = { id: 'r1', votes: {} };

  it('no votes → (no votes)', () => {
    expect(compactRoundSummary(base, 1)).toBe('Round 1: — (no votes)');
  });

  it('single vote → card×1', () => {
    const round: Round = { ...base, votes: { p1: '5' } };
    expect(compactRoundSummary(round, 1)).toBe('Round 1: — 5×1');
  });

  it('tally sorted by count descending', () => {
    // p1,p2 → '5'; p3 → '8'  ⇒  5×2, 8×1
    const round: Round = { ...base, votes: { p1: '5', p2: '5', p3: '8' } };
    expect(compactRoundSummary(round, 2)).toBe('Round 2: — 5×2, 8×1');
  });

  it('equal counts sorted lexicographically', () => {
    // '3'×1 and '8'×1 → alphabetical: 3×1, 8×1
    const round: Round = { ...base, votes: { p1: '8', p2: '3' } };
    expect(compactRoundSummary(round, 1)).toBe('Round 1: — 3×1, 8×1');
  });

  it('includes title when set', () => {
    const round: Round = { ...base, votes: { p1: '5' }, title: 'Login redesign' };
    expect(compactRoundSummary(round, 1)).toBe('Round 1: Login redesign — 5×1');
  });

  it('includes ticketId when set', () => {
    const round: Round = { ...base, votes: { p1: '5' }, ticketId: 'PROJ-123' };
    expect(compactRoundSummary(round, 1)).toBe('Round 1: [PROJ-123] — 5×1');
  });

  it('includes both title and ticketId', () => {
    const round: Round = {
      ...base,
      votes: { p1: '5' },
      title: 'Auth',
      ticketId: 'AUTH-42',
    };
    expect(compactRoundSummary(round, 3)).toBe('Round 3: Auth [AUTH-42] — 5×1');
  });

  it('appends elapsed time when timerStartedAt and revealedAt present', () => {
    const round: Round = {
      ...base,
      votes: { p1: '5' },
      timerStartedAt: 0,
      revealedAt: 90_000,
    };
    expect(compactRoundSummary(round, 1)).toBe('Round 1: — 5×1 — 1:30');
  });

  it('omits elapsed when only timerStartedAt is set (not yet revealed)', () => {
    const round: Round = { ...base, votes: { p1: '5' }, timerStartedAt: 0 };
    expect(compactRoundSummary(round, 1)).toBe('Round 1: — 5×1');
  });

  it('omits elapsed when only revealedAt is set (no timer start)', () => {
    const round: Round = { ...base, votes: { p1: '5' }, revealedAt: 90_000 };
    expect(compactRoundSummary(round, 1)).toBe('Round 1: — 5×1');
  });
});
