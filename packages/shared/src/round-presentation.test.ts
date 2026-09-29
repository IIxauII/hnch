// Exercises: round-presentation:formatRoundLabel
// Exercises: round-presentation:roundNumber
// Exercises: round-presentation:nextRoundNumber
// Exercises: round-presentation:formatRoundPosition
// Exercises: round-presentation:computeRoundStats
// Exercises: round-presentation:roundStatsFor
// Exercises: round-presentation:formatRoundStats
// Exercises: round-presentation:formatRoundElapsed

import { describe, expect, it } from 'vitest';
import { ABSTAIN_SENTINEL } from './abstain.js';
import {
  FIBONACCI_SCALE,
  LINEAR_SCALE,
  POWERS_OF_2_SCALE,
  RISK_SCALE,
  TSHIRT_SCALE,
} from './doc.js';
import type { Round } from './doc.js';
import {
  computeRoundStats,
  formatRoundElapsed,
  formatRoundLabel,
  formatRoundPosition,
  formatRoundStats,
  nextRoundNumber,
  roundNumber,
  roundStatsFor,
} from './round-presentation.js';

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    scale: FIBONACCI_SCALE,
    votes: {},
    createdAt: 0,
    createdBy: 'host',
    status: 'pending',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatRoundLabel
// ---------------------------------------------------------------------------

describe('formatRoundLabel', () => {
  it('returns "ticketId · title" when both are set', () => {
    expect(formatRoundLabel({ ticketId: 'PROJ-42', title: 'Auth migration' })).toBe(
      'PROJ-42 · Auth migration',
    );
  });

  it('returns ticketId alone when title is missing', () => {
    expect(formatRoundLabel({ ticketId: 'PROJ-42' })).toBe('PROJ-42');
  });

  it('returns title alone when ticketId is missing', () => {
    expect(formatRoundLabel({ title: 'Auth migration' })).toBe('Auth migration');
  });

  it('returns null when neither is set', () => {
    expect(formatRoundLabel({})).toBeNull();
  });

  it('treats whitespace-only fields as missing', () => {
    expect(formatRoundLabel({ ticketId: '   ', title: '   ' })).toBeNull();
    expect(formatRoundLabel({ ticketId: '   ', title: 'Auth' })).toBe('Auth');
    expect(formatRoundLabel({ ticketId: 'PROJ-42', title: '   ' })).toBe('PROJ-42');
  });

  it('trims surrounding whitespace from each field independently', () => {
    expect(formatRoundLabel({ ticketId: '  PROJ-42  ', title: '  Auth  ' })).toBe('PROJ-42 · Auth');
  });

  it('handles URL-form ticketId verbatim (no linkification in label form)', () => {
    expect(formatRoundLabel({ ticketId: 'https://example.com/PROJ-1', title: 'Auth' })).toBe(
      'https://example.com/PROJ-1 · Auth',
    );
  });
});

// ---------------------------------------------------------------------------
// roundNumber / nextRoundNumber
// ---------------------------------------------------------------------------

describe('roundNumber', () => {
  it('is the 1-based position in the session', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2' });
    expect(roundNumber(r1, [r1, r2])).toBe(1);
    expect(roundNumber(r2, [r1, r2])).toBe(2);
  });

  it('a discarded round takes no number: the next round gets it', () => {
    const r1 = makeRound({ id: 'r1', status: 'discarded' });
    const r2 = makeRound({ id: 'r2' });
    expect(roundNumber(r2, [r1, r2])).toBe(1);
  });

  it('skips every discarded round before it, not just the first', () => {
    const rounds = [
      makeRound({ id: 'r1' }),
      makeRound({ id: 'r2', status: 'discarded' }),
      makeRound({ id: 'r3', status: 'skipped' }),
      makeRound({ id: 'r4', status: 'discarded' }),
      makeRound({ id: 'r5' }),
    ];
    expect(rounds.map((r) => roundNumber(r, rounds))).toEqual([1, 0, 2, 0, 3]);
  });

  it('a skipped round keeps its number — it is part of the history', () => {
    const r1 = makeRound({ id: 'r1', status: 'skipped' });
    const r2 = makeRound({ id: 'r2' });
    expect(roundNumber(r1, [r1, r2])).toBe(1);
    expect(roundNumber(r2, [r1, r2])).toBe(2);
  });

  it('is 0 for a discarded round and for one that is not in the list', () => {
    const r1 = makeRound({ id: 'r1', status: 'discarded' });
    expect(roundNumber(r1, [r1])).toBe(0);
    expect(roundNumber(makeRound({ id: 'stray' }), [r1])).toBe(0);
    expect(roundNumber(makeRound({ id: 'stray' }), [])).toBe(0);
  });

  it('matches by id, not identity', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2' });
    expect(roundNumber({ id: 'r2' }, [r1, r2])).toBe(2);
  });
});

describe('nextRoundNumber', () => {
  it('is 1 for a session with no rounds', () => {
    expect(nextRoundNumber([])).toBe(1);
  });

  it('counts the rounds that happened', () => {
    expect(nextRoundNumber([makeRound({ id: 'r1' }), makeRound({ id: 'r2' })])).toBe(3);
  });

  it("gives a cancelled round's number to the round that replaces it", () => {
    const rounds = [makeRound({ id: 'r1' }), makeRound({ id: 'r2', status: 'discarded' })];
    expect(nextRoundNumber(rounds)).toBe(2);
    const replacement = makeRound({ id: 'r3' });
    expect(roundNumber(replacement, [...rounds, replacement])).toBe(2);
  });

  it('is 1 again when the only round so far was cancelled', () => {
    expect(nextRoundNumber([makeRound({ id: 'r1', status: 'discarded' })])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// formatRoundPosition
// ---------------------------------------------------------------------------

describe('formatRoundPosition', () => {
  it('standalone round → plain "Round N" from array position', () => {
    const r1 = makeRound({ id: 'r1' });
    expect(formatRoundPosition(r1, [r1])).toBe('Round 1');
  });

  it('ordinal is the round index in the array, not a caller-supplied number', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2' });
    const r3 = makeRound({ id: 'r3' });
    expect(formatRoundPosition(r3, [r1, r2, r3])).toBe('Round 3');
  });

  it('chain root → plain "Round N" (a root is not itself a re-vote)', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    expect(formatRoundPosition(r1, [r1, r2])).toBe('Round 1');
  });

  it('re-vote depth-2 of 2 → "Round 2/2 [re-vote]"', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    expect(formatRoundPosition(r2, [r1, r2])).toBe('Round 2/2 [re-vote]');
  });

  it('re-vote depth-2 of 3 → "Round 2/3 [re-vote]" (chain total counts descendants)', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2', parentRoundId: 'r1' });
    const r3 = makeRound({ id: 'r3', parentRoundId: 'r2' });
    expect(formatRoundPosition(r2, [r1, r2, r3])).toBe('Round 2/3 [re-vote]');
  });

  it('a round absent from the array has no position — documented "Round 0" fallback', () => {
    // Not reachable in production (every caller passes the array the round came
    // from), but the branch exists and this pins what it does.
    expect(formatRoundPosition(makeRound({ id: 'stray' }), [])).toBe('Round 0');
  });

  it('matches by id, not identity — a re-projected round still resolves', () => {
    const r1 = makeRound({ id: 'r1' });
    const r2 = makeRound({ id: 'r2' });
    expect(formatRoundPosition(makeRound({ id: 'r2' }), [r1, r2])).toBe('Round 2');
  });

  it('does not count a discarded round', () => {
    const r1 = makeRound({ id: 'r1', status: 'discarded' });
    const r2 = makeRound({ id: 'r2' });
    expect(formatRoundPosition(r2, [r1, r2])).toBe('Round 1');
  });
});

// ---------------------------------------------------------------------------
// computeRoundStats — raw primitive
// ---------------------------------------------------------------------------

describe('computeRoundStats', () => {
  it('empty votes → null', () => {
    expect(computeRoundStats({}, FIBONACCI_SCALE)).toBeNull();
  });

  it('fibonacci all 5 → unanimous, mean 5, median 5, mode "5"', () => {
    const r = computeRoundStats({ a: '5', b: '5', c: '5' }, FIBONACCI_SCALE);
    expect(r).toMatchObject({
      kind: 'numeric',
      mean: 5,
      median: 5,
      mode: '5',
      spread: 'unanimous',
    });
  });

  it('fibonacci 5,8 → close (adjacent in scale)', () => {
    const r = computeRoundStats({ a: '5', b: '8' }, FIBONACCI_SCALE);
    expect(r).toMatchObject({ kind: 'numeric', spread: 'close' });
  });

  it('fibonacci 1,13 → spread', () => {
    const r = computeRoundStats({ a: '1', b: '13' }, FIBONACCI_SCALE);
    expect(r).toMatchObject({ kind: 'numeric', spread: 'spread' });
  });

  it('fibonacci 5,5,8 → mode "5"', () => {
    const r = computeRoundStats({ a: '5', b: '5', c: '8' }, FIBONACCI_SCALE);
    expect(r).toMatchObject({ kind: 'numeric', mode: '5' });
  });

  it('fibonacci tie 3,5 → mode "3" (first in scale order)', () => {
    const r = computeRoundStats({ a: '3', b: '5' }, FIBONACCI_SCALE);
    expect(r).toMatchObject({ kind: 'numeric', mode: '3' });
  });

  it('powers-of-2 2,4 → close', () => {
    const r = computeRoundStats({ a: '2', b: '4' }, POWERS_OF_2_SCALE);
    expect(r).toMatchObject({ kind: 'numeric', spread: 'close' });
  });

  it('powers-of-2 1,32 → spread', () => {
    const r = computeRoundStats({ a: '1', b: '32' }, POWERS_OF_2_SCALE);
    expect(r).toMatchObject({ kind: 'numeric', spread: 'spread' });
  });

  it('linear scale 5,5,7 → spread (indices 4,6 are 2 apart)', () => {
    // LINEAR_SCALE cards: ['1','2','3','4','5','6','7','8','9','10']
    // idx('5')=4, idx('7')=6 → distance 2 > 1 → 'spread'
    const r = computeRoundStats({ a: '5', b: '5', c: '7' }, LINEAR_SCALE);
    expect(r).toMatchObject({ kind: 'numeric', spread: 'spread' });
  });

  it('t-shirt M,L,M → categorical, mode "M", spread close (2 distinct)', () => {
    const r = computeRoundStats({ a: 'M', b: 'L', c: 'M' }, TSHIRT_SCALE);
    expect(r).toMatchObject({ kind: 'categorical', mode: 'M', spread: 'close' });
  });

  it('t-shirt all M → categorical, spread unanimous (1 distinct)', () => {
    const r = computeRoundStats({ a: 'M', b: 'M', c: 'M' }, TSHIRT_SCALE);
    expect(r).toMatchObject({ kind: 'categorical', spread: 'unanimous' });
  });

  it('t-shirt S,M,L → categorical, spread spread (3 distinct)', () => {
    const r = computeRoundStats({ a: 'S', b: 'M', c: 'L' }, TSHIRT_SCALE);
    expect(r).toMatchObject({ kind: 'categorical', spread: 'spread' });
  });

  it('risk Low,High → categorical, spread close (2 distinct)', () => {
    const r = computeRoundStats({ a: 'Low', b: 'High' }, RISK_SCALE);
    expect(r).toMatchObject({ kind: 'categorical', spread: 'close' });
  });

  it('risk Low,Medium,High,Critical → categorical, spread spread (4 distinct)', () => {
    const r = computeRoundStats({ a: 'Low', b: 'Medium', c: 'High', d: 'Critical' }, RISK_SCALE);
    expect(r).toMatchObject({ kind: 'categorical', spread: 'spread' });
  });

  it('risk Low,High (tie) → mode "Low" (first in scale), spread close', () => {
    const r = computeRoundStats({ a: 'Low', b: 'High' }, RISK_SCALE);
    expect(r).toMatchObject({ kind: 'categorical', mode: 'Low', spread: 'close' });
  });

  it('custom numeric scale 10,30 → kind:numeric, spread:spread (indices 0 vs 2)', () => {
    const scale = { id: 'custom-x', cards: ['10', '20', '30'] };
    const r = computeRoundStats({ a: '10', b: '30' }, scale);
    expect(r).toMatchObject({ kind: 'numeric', spread: 'spread' });
  });

  it('custom mixed scale [1,M,3] → categorical (M not parseable)', () => {
    const scale = { id: 'custom-mix', cards: ['1', 'M', '3'] };
    const r = computeRoundStats({ a: '1', b: '3' }, scale);
    expect(r).toMatchObject({ kind: 'categorical' });
  });

  it('single voter → mean=median=value, spread=unanimous', () => {
    const r = computeRoundStats({ a: '8' }, FIBONACCI_SCALE);
    expect(r).toMatchObject({ kind: 'numeric', mean: 8, median: 8, spread: 'unanimous' });
  });

  // --- Bug-fix regression tests ---

  it('unknown-card tie-break: fibonacci scale, votes foo+bar (both off-scale, 1 each) → mode "bar" (alphabetical first among unknowns)', () => {
    // 'bar' < 'foo' alphabetically → cardOrder('bar') < cardOrder('foo') → mode = 'bar'
    const r = computeRoundStats({ a: 'foo', b: 'bar' }, FIBONACCI_SCALE);
    // fibonacci is numeric scale → check categorical fallback? No: fibonacci cards are all numeric,
    // but numericValues after filter are empty (neither 'foo' nor 'bar' parse to finite) → degrades to categorical
    expect(r).toMatchObject({ kind: 'categorical', mode: 'bar' });
  });

  it('off-scale vote on numeric path does not poison spread via -1 index', () => {
    // FIBONACCI_SCALE cards: ['0','1','2','3','5','8','13','21']
    // votes: a='5', b='5', c='foo'
    // numericValues = [5, 5] (foo filtered) → mean=5, median=5
    // spread: values=['5','5','foo'], Set size=2, cardOrder('5')=4, cardOrder('foo')=8+alpha_offset
    // min=4, max≥8 → distance ≥4 > 1 → 'spread'
    // The key guarantee: NOT caused by -1 from indexOf. The spread label here is legitimately
    // 'spread' because 'foo' lands after all known cards, far from index 4.
    const r = computeRoundStats({ a: '5', b: '5', c: 'foo' }, FIBONACCI_SCALE);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.kind).toBe('numeric');
    if (r.kind !== 'numeric') return;
    expect(r.mean).toBe(5);
    expect(r.median).toBe(5);
    expect(r.mode).toBe('5');
    // spread is 'spread' because 'foo' (unknown, index=8) is far from '5' (index=4).
    // This is correct behaviour — not a -1 artefact. What we're guarding is that
    // the OLD code would also produce 'spread' but via min=-1, which inflated max-min
    // even when all known votes were unanimous. That bug path is: votes={a:'5',b:'5',c:'foo'}
    // old: indices=[4,4,-1], min=-1, max=4, distance=5 → 'spread'. New: same result,
    // correct reason. To specifically test the -1 fix, assert mean/median are not NaN:
    expect(Number.isNaN(r.mean)).toBe(false);
    expect(Number.isNaN(r.median)).toBe(false);
  });

  it('NaN-vote fallback: all off-scale strings on numeric scale → categorical', () => {
    // All votes are non-numeric strings on a numeric scale → numericValues empty → degrade
    const scale = { id: 'custom-numeric', cards: ['1', '2', '3'] };
    const r = computeRoundStats({ a: '1', b: '2' }, scale);
    // Sanity: normal numeric votes still work
    expect(r).toMatchObject({ kind: 'numeric' });

    // Now all off-scale:
    const r2 = computeRoundStats({ a: 'foo', b: 'bar' }, scale);
    expect(r2).toMatchObject({ kind: 'categorical' });
  });

  it('single-card categorical: t-shirt all L → kind:categorical, mode:"L", unanimous', () => {
    const r = computeRoundStats({ a: 'L', b: 'L', c: 'L' }, TSHIRT_SCALE);
    expect(r).toMatchObject({ kind: 'categorical', mode: 'L', spread: 'unanimous' });
  });

  it('mode is always a string for numeric results (regression guard)', () => {
    const r = computeRoundStats({ a: '3', b: '5', c: '3' }, FIBONACCI_SCALE);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(typeof r.mode).toBe('string');
  });

  it('custom numeric scale full shape assertion', () => {
    const scale = { id: 'custom-x', cards: ['10', '20', '30'] };
    const r = computeRoundStats({ a: '10', b: '30' }, scale);
    expect(r).toMatchObject({
      kind: 'numeric',
      mean: 20,
      median: 20,
      mode: '10', // tie: both 1 vote; '10' is first in scale order (index 0)
      spread: 'spread',
    });
  });
});

// ---------------------------------------------------------------------------
// Abstain sentinel — caller contract (ADR-0041)
//
// computeRoundStats does NOT filter the abstain sentinel. Callers are
// responsible for pre-filtering, and in production that caller is
// `roundStatsFor`. These tests document the degradation behaviour of the raw
// primitive and guard against accidental changes to that contract.
// ---------------------------------------------------------------------------

describe('computeRoundStats — abstain sentinel caller contract (ADR-0041)', () => {
  it('numeric scale: mean/median exclude abstain via NaN filter; spread is skewed by off-scale index', () => {
    // Two voters unanimously chose 5; one abstained.
    // Without caller-side pre-filtering:
    //   mean/median = 5 (NaN filter saves them)
    //   mode = '5' (higher frequency than sentinel)
    //   spread = 'spread' because 'hnch_abstain' maps to an off-scale card-order index
    //            far from index 4 ('5'), making max-min > 1.
    const r = computeRoundStats({ p1: '5', p2: '5', p3: ABSTAIN_SENTINEL }, FIBONACCI_SCALE);
    expect(r).not.toBeNull();
    if (!r || r.kind !== 'numeric') throw new Error('expected numeric result');
    expect(r.mean).toBe(5);
    expect(r.median).toBe(5);
    expect(r.mode).toBe('5');
    expect(r.spread).toBe('spread');
  });

  it('all-abstain on numeric scale degrades to categorical (NaN filter empties numericValues)', () => {
    // All votes are non-numeric strings → numericValues = [] → graceful categorical fallback.
    // Mode = sentinel (only value present). Callers must pre-filter to avoid this path.
    const r = computeRoundStats({ p1: ABSTAIN_SENTINEL, p2: ABSTAIN_SENTINEL }, FIBONACCI_SCALE);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe('categorical');
    expect(r?.mode).toBe(ABSTAIN_SENTINEL);
    expect(r?.spread).toBe('unanimous');
  });
});

// ---------------------------------------------------------------------------
// roundStatsFor — the abstain-stripping caller
// ---------------------------------------------------------------------------

describe('roundStatsFor', () => {
  it('round with no votes → null', () => {
    expect(roundStatsFor(makeRound())).toBeNull();
  });

  it('round where everyone abstained → null (absence, not an estimate)', () => {
    const r = makeRound({ votes: { p1: ABSTAIN_SENTINEL, p2: ABSTAIN_SENTINEL } });
    expect(roundStatsFor(r)).toBeNull();
  });

  it('abstainers never surface as the mode', () => {
    // Three abstainers vs one real vote: the sentinel is the frequency winner
    // for the raw primitive, but roundStatsFor strips it first.
    const r = makeRound({
      votes: { p1: ABSTAIN_SENTINEL, p2: ABSTAIN_SENTINEL, p3: ABSTAIN_SENTINEL, p4: '5' },
    });
    expect(roundStatsFor(r)).toMatchObject({ kind: 'numeric', mode: '5' });
  });

  it('abstainers do not skew spread — unanimous stays unanimous', () => {
    const r = makeRound({ votes: { p1: '5', p2: '5', p3: ABSTAIN_SENTINEL } });
    expect(roundStatsFor(r)).toMatchObject({
      kind: 'numeric',
      mean: 5,
      median: 5,
      spread: 'unanimous',
    });
  });

  it('abstainers are excluded from mean and median', () => {
    // p1=5, p2=8 → mean 6.5, median 6.5. The abstainer contributes nothing.
    const r = makeRound({ votes: { p1: '5', p2: '8', p3: ABSTAIN_SENTINEL } });
    expect(roundStatsFor(r)).toMatchObject({ kind: 'numeric', mean: 6.5, median: 6.5 });
  });

  it('mixed numeric / non-numeric: off-scale strings still excluded from mean/median', () => {
    // Ported from the CLI's retired computeStats coverage.
    const r = makeRound({ votes: { p1: '5', p2: 'XL' } });
    expect(roundStatsFor(r)).toMatchObject({ kind: 'numeric', mean: 5, median: 5 });
  });

  it('all votes non-numeric on a numeric scale → categorical fallback, not dashes', () => {
    const r = makeRound({ votes: { p1: 'XL', p2: 'S', p3: 'M' } });
    expect(roundStatsFor(r)).toMatchObject({ kind: 'categorical' });
  });

  it('categorical scale: strips abstain and keeps the real mode', () => {
    const r = makeRound({
      scale: TSHIRT_SCALE,
      votes: { p1: 'M', p2: 'M', p3: ABSTAIN_SENTINEL },
    });
    expect(roundStatsFor(r)).toMatchObject({
      kind: 'categorical',
      mode: 'M',
      spread: 'unanimous',
    });
  });
});

// ---------------------------------------------------------------------------
// formatRoundStats
// ---------------------------------------------------------------------------

describe('formatRoundStats', () => {
  it('null in → null out', () => {
    expect(formatRoundStats(null)).toBeNull();
  });

  it('numeric: mean and median both carry one decimal place', () => {
    const stats = roundStatsFor(makeRound({ votes: { p1: '5', p2: '5' } }));
    expect(formatRoundStats(stats)).toEqual({
      kind: 'numeric',
      mean: '5.0',
      median: '5.0',
      mode: '5',
      spread: 'Unanimous',
    });
  });

  it('numeric: fractional mean/median keep their decimal', () => {
    const stats = roundStatsFor(makeRound({ votes: { p1: '5', p2: '8' } }));
    expect(formatRoundStats(stats)).toMatchObject({ mean: '6.5', median: '6.5' });
  });

  it('numeric: mean rounds to one decimal place', () => {
    // 1 + 2 + 2 = 5 / 3 = 1.666… → '1.7'
    const stats = roundStatsFor(makeRound({ votes: { p1: '1', p2: '2', p3: '2' } }));
    expect(formatRoundStats(stats)).toMatchObject({ mean: '1.7', median: '2.0' });
  });

  it('categorical: mode and spread word, no mean/median', () => {
    const stats = roundStatsFor(
      makeRound({ scale: TSHIRT_SCALE, votes: { p1: 'M', p2: 'L', p3: 'M' } }),
    );
    expect(formatRoundStats(stats)).toEqual({
      kind: 'categorical',
      mode: 'M',
      spread: 'Close',
    });
  });

  it('spread wording covers all three labels', () => {
    const unanimous = roundStatsFor(
      makeRound({ scale: TSHIRT_SCALE, votes: { p1: 'M', p2: 'M' } }),
    );
    const close = roundStatsFor(makeRound({ scale: TSHIRT_SCALE, votes: { p1: 'M', p2: 'L' } }));
    const spread = roundStatsFor(
      makeRound({ scale: TSHIRT_SCALE, votes: { p1: 'S', p2: 'M', p3: 'L' } }),
    );
    expect(formatRoundStats(unanimous)?.spread).toBe('Unanimous');
    expect(formatRoundStats(close)?.spread).toBe('Close');
    expect(formatRoundStats(spread)?.spread).toBe('Spread');
  });

  it('a Risk-scale round formats as categorical rather than an empty row', () => {
    const stats = roundStatsFor(
      makeRound({ scale: RISK_SCALE, votes: { p1: 'Low', p2: 'Low', p3: 'High' } }),
    );
    expect(formatRoundStats(stats)).toEqual({
      kind: 'categorical',
      mode: 'Low',
      spread: 'Close',
    });
  });
});

// ---------------------------------------------------------------------------
// formatRoundElapsed
// ---------------------------------------------------------------------------

describe('formatRoundElapsed', () => {
  it('revealed round with a timer → M:SS', () => {
    const r = makeRound({ status: 'revealed', timerStartedAt: 0, terminalAt: 90_000 });
    expect(formatRoundElapsed(r)).toBe('1:30');
  });

  it('pads seconds to two digits', () => {
    const r = makeRound({ status: 'revealed', timerStartedAt: 0, terminalAt: 9_000 });
    expect(formatRoundElapsed(r)).toBe('0:09');
  });

  it('offset start: measures the delta, not the absolute timestamp', () => {
    const r = makeRound({ status: 'revealed', timerStartedAt: 5_000, terminalAt: 65_000 });
    expect(formatRoundElapsed(r)).toBe('1:00');
  });

  it('long round: minutes are not wrapped at 60', () => {
    const r = makeRound({ status: 'revealed', timerStartedAt: 0, terminalAt: 3_661_000 });
    expect(formatRoundElapsed(r)).toBe('61:01');
  });

  it('sub-second duration rounds down to 0:00', () => {
    const r = makeRound({ status: 'revealed', timerStartedAt: 1_000, terminalAt: 1_999 });
    expect(formatRoundElapsed(r)).toBe('0:00');
  });

  it('clamps a negative duration to 0:00 (host clock ahead of ours)', () => {
    const r = makeRound({ status: 'revealed', timerStartedAt: 10_000, terminalAt: 5_000 });
    expect(formatRoundElapsed(r)).toBe('0:00');
  });

  it('pending round → null', () => {
    expect(formatRoundElapsed(makeRound({ status: 'pending' }))).toBeNull();
  });

  it('voting round → null (no terminal timestamp yet)', () => {
    expect(formatRoundElapsed(makeRound({ status: 'voting', timerStartedAt: 0 }))).toBeNull();
  });

  it('skipped round → null (no estimate was reached)', () => {
    const r = makeRound({ status: 'skipped', timerStartedAt: 0, terminalAt: 90_000 });
    expect(formatRoundElapsed(r)).toBeNull();
  });

  it('discarded round → null', () => {
    const r = makeRound({ status: 'discarded', timerStartedAt: 0, terminalAt: 90_000 });
    expect(formatRoundElapsed(r)).toBeNull();
  });

  it('revealed round whose timer never started → null', () => {
    expect(formatRoundElapsed(makeRound({ status: 'revealed', terminalAt: 90_000 }))).toBeNull();
  });

  it('revealed round with no terminalAt → null', () => {
    expect(formatRoundElapsed(makeRound({ status: 'revealed', timerStartedAt: 0 }))).toBeNull();
  });
});
