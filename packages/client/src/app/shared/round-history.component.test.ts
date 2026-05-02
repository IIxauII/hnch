/**
 * Unit tests for RoundHistoryComponent.entries() computed signal.
 *
 * The component is purely presentational and has no DI dependencies;
 * tests create it via TestBed.createComponent and inspect the
 * computed `entries()` directly without querying the DOM.
 */

import { TestBed } from '@angular/core/testing'
import { describe, it, expect } from 'vitest'
import type { Round, Scale } from '@hnch/shared'
import { RoundHistoryComponent } from './round-history.component'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIBO_SCALE: Scale = {
  id: 'fibonacci',
  cards: ['1', '2', '3', '5', '8', '13'],
}

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'r1',
    createdBy: 'host',
    createdAt: 0,
    scale: FIBO_SCALE,
    votes: {},
    ...overrides,
  }
}

function mount(rounds: readonly Round[]) {
  const fixture = TestBed.createComponent(RoundHistoryComponent)
  fixture.componentRef.setInput('rounds', rounds)
  fixture.detectChanges()
  return fixture.componentInstance
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoundHistoryComponent.entries()', () => {
  describe('empty / no-reveal cases', () => {
    it('returns empty array when rounds is empty', () => {
      const comp = mount([])
      expect(comp.entries()).toEqual([])
    })

    it('skips rounds without revealedAt', () => {
      const round = makeRound({ id: 'r1', votes: { p1: '5' } })
      const comp = mount([round])
      expect(comp.entries()).toEqual([])
    })

    it('includes only rounds that have revealedAt', () => {
      const revealed = makeRound({ id: 'r1', revealedAt: 5000, votes: { p1: '5' } })
      const unrevealed = makeRound({ id: 'r2', votes: { p1: '3' } })
      const comp = mount([revealed, unrevealed])
      expect(comp.entries()).toHaveLength(1)
      expect(comp.entries()[0].roundNumber).toBe(1)
    })
  })

  describe('round numbering', () => {
    it('numbers a single revealed round as 1', () => {
      const comp = mount([makeRound({ id: 'r1', revealedAt: 1000, votes: { p1: '5' } })])
      expect(comp.entries()[0].roundNumber).toBe(1)
    })

    it('numbers two revealed rounds as 2, 1 (reversed chronological output)', () => {
      const r1 = makeRound({ id: 'r1', revealedAt: 1000, votes: { p1: '5' } })
      const r2 = makeRound({ id: 'r2', revealedAt: 2000, votes: { p1: '8' } })
      const entries = mount([r1, r2]).entries()
      // Newest first in output — r2 is the first entry, but roundNumber=2
      expect(entries[0].roundNumber).toBe(2)
      expect(entries[1].roundNumber).toBe(1)
    })

    it('preserves stable numbering even with mixed revealed/unrevealed input', () => {
      // Positions: 0=revealed(r1), 1=unrevealed, 2=revealed(r3)
      const r1 = makeRound({ id: 'r1', revealedAt: 1000, votes: { p1: '5' } })
      const r2 = makeRound({ id: 'r2', votes: {} }) // unrevealed — filtered out
      const r3 = makeRound({ id: 'r3', revealedAt: 3000, votes: { p1: '8' } })
      const entries = mount([r1, r2, r3]).entries()
      // Filtered revealed: [r1, r3]; reversed: [r3, r1]
      // r3 is at originalIndex=1 → roundNumber=2
      // r1 is at originalIndex=0 → roundNumber=1
      expect(entries).toHaveLength(2)
      expect(entries[0].roundNumber).toBe(2)
      expect(entries[1].roundNumber).toBe(1)
    })
  })

  describe('title field', () => {
    it('includes title when round has one', () => {
      const round = makeRound({ revealedAt: 1000, title: 'Auth epic', votes: { p1: '5' } })
      const [entry] = mount([round]).entries()
      expect(entry.title).toBe('Auth epic')
    })

    it('has undefined title when round has none', () => {
      const round = makeRound({ revealedAt: 1000, votes: { p1: '5' } })
      const [entry] = mount([round]).entries()
      expect(entry.title).toBeUndefined()
    })
  })

  describe('vote summary (summary field)', () => {
    it('shows "No votes" when no votes cast', () => {
      const round = makeRound({ revealedAt: 1000, votes: {} })
      const [entry] = mount([round]).entries()
      expect(entry.summary).toBe('No votes')
    })

    it('formats a single-vote round as "card×1"', () => {
      const round = makeRound({ revealedAt: 1000, votes: { p1: '5' } })
      const [entry] = mount([round]).entries()
      expect(entry.summary).toBe('5×1')
    })

    it('groups and counts identical votes', () => {
      const round = makeRound({
        revealedAt: 1000,
        votes: { p1: '5', p2: '5', p3: '8' },
      })
      const [entry] = mount([round]).entries()
      // 5 appears twice (count desc) then 8 appears once
      expect(entry.summary).toBe('5×2, 8×1')
    })

    it('sorts by count descending', () => {
      const round = makeRound({
        revealedAt: 1000,
        votes: { p1: '1', p2: '1', p3: '1', p4: '8', p5: '8' },
      })
      const [entry] = mount([round]).entries()
      expect(entry.summary).toBe('1×3, 8×2')
    })

    it('breaks count ties by scale order (lower-index card first)', () => {
      // 1 and 5 both appear once; 1 is at index 0, 5 is at index 3 in FIBO_SCALE
      const round = makeRound({
        revealedAt: 1000,
        votes: { p1: '5', p2: '1' }, // order in votes doesn't matter
      })
      const [entry] = mount([round]).entries()
      expect(entry.summary).toBe('1×1, 5×1')
    })

    it('places cards not in the scale after scale cards (by scale order 9999 fallback)', () => {
      const round = makeRound({
        revealedAt: 1000,
        votes: { p1: '?', p2: '1' }, // '?' not in scale
      })
      const [entry] = mount([round]).entries()
      // 1 is in scale (index 0), '?' is not → 1 before ?
      expect(entry.summary).toBe('1×1, ?×1')
    })
  })

  describe('elapsed field', () => {
    it('is null when timerStartedAt is undefined', () => {
      const round = makeRound({
        revealedAt: 5000,
        timerStartedAt: undefined,
        votes: { p1: '5' },
      })
      const [entry] = mount([round]).entries()
      expect(entry.elapsed).toBeNull()
    })

    it('computes elapsed as revealedAt - timerStartedAt formatted', () => {
      const round = makeRound({
        revealedAt: 63_000,
        timerStartedAt: 0,
        votes: { p1: '5' },
      })
      const [entry] = mount([round]).entries()
      expect(entry.elapsed).toBe('1:03')
    })

    it('elapsed is "0:00" when revealed immediately (same timestamp)', () => {
      const round = makeRound({
        revealedAt: 10_000,
        timerStartedAt: 10_000,
        votes: { p1: '5' },
      })
      const [entry] = mount([round]).entries()
      expect(entry.elapsed).toBe('0:00')
    })
  })

  describe('multiple rounds — reversal and ordering', () => {
    it('outputs rounds in reverse order (newest first)', () => {
      const r1 = makeRound({ id: 'r1', revealedAt: 1000, votes: { p1: '5' } })
      const r2 = makeRound({ id: 'r2', revealedAt: 2000, votes: { p1: '8' } })
      const r3 = makeRound({ id: 'r3', revealedAt: 3000, votes: { p1: '13' } })
      const entries = mount([r1, r2, r3]).entries()
      // Newest (r3 → round 3) first, oldest (r1 → round 1) last
      expect(entries.map((e) => e.roundNumber)).toEqual([3, 2, 1])
    })
  })
})
