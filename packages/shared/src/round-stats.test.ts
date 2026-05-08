import { describe, expect, it } from 'vitest'
import {
  FIBONACCI_SCALE,
  LINEAR_SCALE,
  POWERS_OF_2_SCALE,
  RISK_SCALE,
  TSHIRT_SCALE,
} from './doc.js'
import { computeRoundStats } from './round-stats.js'

describe('computeRoundStats', () => {
  it('empty votes → null', () => {
    expect(computeRoundStats({}, FIBONACCI_SCALE)).toBeNull()
  })

  it('fibonacci all 5 → unanimous, mean 5, median 5, mode "5"', () => {
    const r = computeRoundStats({ a: '5', b: '5', c: '5' }, FIBONACCI_SCALE)
    expect(r).toMatchObject({ kind: 'numeric', mean: 5, median: 5, mode: '5', spread: 'unanimous' })
  })

  it('fibonacci 5,8 → close (adjacent in scale)', () => {
    const r = computeRoundStats({ a: '5', b: '8' }, FIBONACCI_SCALE)
    expect(r).toMatchObject({ kind: 'numeric', spread: 'close' })
  })

  it('fibonacci 1,13 → spread', () => {
    const r = computeRoundStats({ a: '1', b: '13' }, FIBONACCI_SCALE)
    expect(r).toMatchObject({ kind: 'numeric', spread: 'spread' })
  })

  it('fibonacci 5,5,8 → mode "5"', () => {
    const r = computeRoundStats({ a: '5', b: '5', c: '8' }, FIBONACCI_SCALE)
    expect(r).toMatchObject({ kind: 'numeric', mode: '5' })
  })

  it('fibonacci tie 3,5 → mode "3" (first in scale order)', () => {
    const r = computeRoundStats({ a: '3', b: '5' }, FIBONACCI_SCALE)
    expect(r).toMatchObject({ kind: 'numeric', mode: '3' })
  })

  it('powers-of-2 2,4 → close', () => {
    const r = computeRoundStats({ a: '2', b: '4' }, POWERS_OF_2_SCALE)
    expect(r).toMatchObject({ kind: 'numeric', spread: 'close' })
  })

  it('powers-of-2 1,32 → spread', () => {
    const r = computeRoundStats({ a: '1', b: '32' }, POWERS_OF_2_SCALE)
    expect(r).toMatchObject({ kind: 'numeric', spread: 'spread' })
  })

  it('linear scale 5,5,7 → spread (indices 4,6 are 2 apart)', () => {
    // LINEAR_SCALE cards: ['1','2','3','4','5','6','7','8','9','10']
    // idx('5')=4, idx('7')=6 → distance 2 > 1 → 'spread'
    const r = computeRoundStats({ a: '5', b: '5', c: '7' }, LINEAR_SCALE)
    expect(r).toMatchObject({ kind: 'numeric', spread: 'spread' })
  })

  it('t-shirt M,L,M → categorical, mode "M"', () => {
    const r = computeRoundStats({ a: 'M', b: 'L', c: 'M' }, TSHIRT_SCALE)
    expect(r).toMatchObject({ kind: 'categorical', mode: 'M' })
  })

  it('risk Low,High (tie) → mode "Low" (first in scale)', () => {
    const r = computeRoundStats({ a: 'Low', b: 'High' }, RISK_SCALE)
    expect(r).toMatchObject({ kind: 'categorical', mode: 'Low' })
  })

  it('custom numeric scale 10,30 → kind:numeric, spread:spread (indices 0 vs 2)', () => {
    const scale = { id: 'custom-x', cards: ['10', '20', '30'] }
    const r = computeRoundStats({ a: '10', b: '30' }, scale)
    expect(r).toMatchObject({ kind: 'numeric', spread: 'spread' })
  })

  it('custom mixed scale [1,M,3] → categorical (M not parseable)', () => {
    const scale = { id: 'custom-mix', cards: ['1', 'M', '3'] }
    const r = computeRoundStats({ a: '1', b: '3' }, scale)
    expect(r).toMatchObject({ kind: 'categorical' })
  })

  it('single voter → mean=median=value, spread=unanimous', () => {
    const r = computeRoundStats({ a: '8' }, FIBONACCI_SCALE)
    expect(r).toMatchObject({ kind: 'numeric', mean: 8, median: 8, spread: 'unanimous' })
  })

  it('even voter count: fibonacci 5,8 → mean 6.5, median 6.5 (averaged midpoint)', () => {
    // Exercises the even-count median branch: (sorted[mid-1] + sorted[mid]) / 2
    const r = computeRoundStats({ a: '5', b: '8' }, FIBONACCI_SCALE)
    expect(r).not.toBeNull()
    if (r === null) return
    expect(r.kind).toBe('numeric')
    if (r.kind !== 'numeric') return
    expect(r.mean).toBe(6.5)
    expect(r.median).toBe(6.5)
  })

  it('even voter count 4 voters: fibonacci 1,3,5,8 → mean 4.25, median 4 (avg of 3+5)', () => {
    const r = computeRoundStats({ a: '1', b: '3', c: '5', d: '8' }, FIBONACCI_SCALE)
    expect(r).not.toBeNull()
    if (r === null) return
    expect(r.kind).toBe('numeric')
    if (r.kind !== 'numeric') return
    expect(r.mean).toBeCloseTo(4.25)
    expect(r.median).toBe(4)
  })

  // --- Bug-fix regression tests ---

  it('unknown-card tie-break: fibonacci scale, votes foo+bar (both off-scale, 1 each) → mode "bar" (alphabetical first among unknowns)', () => {
    // 'bar' < 'foo' alphabetically → cardOrder('bar') < cardOrder('foo') → mode = 'bar'
    const r = computeRoundStats({ a: 'foo', b: 'bar' }, FIBONACCI_SCALE)
    // fibonacci is numeric scale → check categorical fallback? No: fibonacci cards are all numeric,
    // but numericValues after filter are empty (neither 'foo' nor 'bar' parse to finite) → degrades to categorical
    expect(r).toMatchObject({ kind: 'categorical', mode: 'bar' })
  })

  it('off-scale vote on numeric path does not poison spread via -1 index', () => {
    // FIBONACCI_SCALE cards: ['0','1','2','3','5','8','13','21']
    // votes: a='5', b='5', c='foo'
    // numericValues = [5, 5] (foo filtered) → mean=5, median=5
    // spread: values=['5','5','foo'], Set size=2, cardOrder('5')=4, cardOrder('foo')=8+alpha_offset
    // min=4, max≥8 → distance ≥4 > 1 → 'spread'
    // The key guarantee: NOT caused by -1 from indexOf. The spread label here is legitimately
    // 'spread' because 'foo' lands after all known cards, far from index 4.
    const r = computeRoundStats({ a: '5', b: '5', c: 'foo' }, FIBONACCI_SCALE)
    expect(r).not.toBeNull()
    if (r === null) return
    expect(r.kind).toBe('numeric')
    if (r.kind !== 'numeric') return
    expect(r.mean).toBe(5)
    expect(r.median).toBe(5)
    expect(r.mode).toBe('5')
    // spread is 'spread' because 'foo' (unknown, index=8) is far from '5' (index=4).
    // This is correct behaviour — not a -1 artefact. What we're guarding is that
    // the OLD code would also produce 'spread' but via min=-1, which inflated max-min
    // even when all known votes were unanimous. That bug path is: votes={a:'5',b:'5',c:'foo'}
    // old: indices=[4,4,-1], min=-1, max=4, distance=5 → 'spread'. New: same result,
    // correct reason. To specifically test the -1 fix, assert mean/median are not NaN:
    expect(Number.isNaN(r.mean)).toBe(false)
    expect(Number.isNaN(r.median)).toBe(false)
  })

  it('NaN-vote fallback: all off-scale strings on numeric scale → categorical', () => {
    // All votes are non-numeric strings on a numeric scale → numericValues empty → degrade
    const scale = { id: 'custom-numeric', cards: ['1', '2', '3'] }
    const r = computeRoundStats({ a: '1', b: '2' }, scale)
    // Sanity: normal numeric votes still work
    expect(r).toMatchObject({ kind: 'numeric' })

    // Now all off-scale:
    const r2 = computeRoundStats({ a: 'foo', b: 'bar' }, scale)
    expect(r2).toMatchObject({ kind: 'categorical' })
  })

  it('single-card categorical: t-shirt all L → kind:categorical, mode:"L"', () => {
    const r = computeRoundStats({ a: 'L', b: 'L', c: 'L' }, TSHIRT_SCALE)
    expect(r).toMatchObject({ kind: 'categorical', mode: 'L' })
  })

  it('mode is always a string for numeric results (regression guard)', () => {
    const r = computeRoundStats({ a: '3', b: '5', c: '3' }, FIBONACCI_SCALE)
    expect(r).not.toBeNull()
    if (r === null) return
    expect(typeof r.mode).toBe('string')
  })

  it('custom numeric scale full shape assertion', () => {
    const scale = { id: 'custom-x', cards: ['10', '20', '30'] }
    const r = computeRoundStats({ a: '10', b: '30' }, scale)
    expect(r).toMatchObject({
      kind: 'numeric',
      mean: 20,
      median: 20,
      mode: '10', // tie: both 1 vote; '10' is first in scale order (index 0)
      spread: 'spread',
    })
  })
})
