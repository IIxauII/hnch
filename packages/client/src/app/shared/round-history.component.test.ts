/**
 * Unit tests for RoundHistoryComponent — specifically the `entries` computed
 * signal that drives the compact round-history list.
 *
 * The key logic under test:
 *  - Rounds without `revealedAt` are filtered out
 *  - Entries appear in reverse chronological order (newest first)
 *  - Round numbers reflect original array position, not display position
 *  - Vote summary groups identical cards by count (sorted count-desc,
 *    tie-broken by scale order) and formats as "card×count, card×count"
 *  - Rounds with no votes render "No votes"
 *  - Elapsed time uses formatElapsed(revealedAt - timerStartedAt)
 *  - Rounds missing timerStartedAt produce null elapsed
 *
 * Pattern: Ionic component stubs + TestBed, matching avatar-vote-row style.
 */

import { Component, NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'
import type { Round } from '@hnch/shared'

// Provide minimal Angular stub components so the standalone component
// can compile its imports without requiring the full Ionic runtime.
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp } = await import('@angular/core')

  @Comp({ selector: 'ion-button', template: '', standalone: true })
  class IonButton {}

  @Comp({ selector: 'ion-icon', template: '', standalone: true })
  class IonIcon {}

  return { IonButton, IonIcon }
})

vi.mock('ionicons', () => ({ addIcons: vi.fn() }))
vi.mock('ionicons/icons', () => ({ pencilOutline: '' }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScale(cards: string[]) {
  return { id: 'fibonacci', cards }
}

function makeRound(
  overrides: Partial<Round> & Pick<Round, 'id' | 'scale' | 'votes'>,
): Round {
  return {
    createdAt: Date.now(),
    createdBy: 'p1',
    ...overrides,
  }
}

async function createComponent(rounds: readonly Round[], isHost = false) {
  const { RoundHistoryComponent } = await import('./round-history.component')
  const fixture = TestBed.createComponent(RoundHistoryComponent)
  fixture.componentRef.setInput('rounds', rounds)
  fixture.componentRef.setInput('isHost', isHost)
  fixture.detectChanges()
  return fixture.componentInstance
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoundHistoryComponent.entries', () => {
  // ── Filtering ─────────────────────────────────────────────────────────────

  it('returns empty array when no rounds', async () => {
    const c = await createComponent([])
    expect(c.entries()).toHaveLength(0)
  })

  it('filters out rounds that have no revealedAt', async () => {
    const scale = makeScale(['1', '2', '3'])
    const notRevealed = makeRound({ id: 'r1', scale, votes: { p1: '1' } })
    const c = await createComponent([notRevealed])
    expect(c.entries()).toHaveLength(0)
  })

  it('includes only rounds that have revealedAt', async () => {
    const scale = makeScale(['1', '2', '3'])
    const revealed = makeRound({ id: 'r1', scale, votes: { p1: '1' }, revealedAt: 1000 })
    const notRevealed = makeRound({ id: 'r2', scale, votes: {} })
    const c = await createComponent([revealed, notRevealed])
    expect(c.entries()).toHaveLength(1)
    expect(c.entries()[0]!.roundId).toBe('r1')
  })

  // ── Ordering & round numbering ────────────────────────────────────────────

  it('returns entries in reverse chronological order (newest first)', async () => {
    const scale = makeScale(['1', '2'])
    const r1 = makeRound({ id: 'r1', scale, votes: {}, revealedAt: 1000 })
    const r2 = makeRound({ id: 'r2', scale, votes: {}, revealedAt: 2000 })
    const r3 = makeRound({ id: 'r3', scale, votes: {}, revealedAt: 3000 })
    const c = await createComponent([r1, r2, r3])
    const entries = c.entries()
    expect(entries).toHaveLength(3)
    expect(entries[0]!.roundId).toBe('r3')
    expect(entries[1]!.roundId).toBe('r2')
    expect(entries[2]!.roundId).toBe('r1')
  })

  it('round numbers reflect original array position (1-based), not display order', async () => {
    const scale = makeScale(['1', '2'])
    const r1 = makeRound({ id: 'r1', scale, votes: {}, revealedAt: 1000 })
    const r2 = makeRound({ id: 'r2', scale, votes: {}, revealedAt: 2000 })
    const c = await createComponent([r1, r2])
    const entries = c.entries()
    // Display order: r2 (index 0), r1 (index 1) — newest first
    // Round numbers must reflect original position: r1 → Round 1, r2 → Round 2
    expect(entries[0]!.roundNumber).toBe(2) // r2 is entry 0 (newest), but was round 2
    expect(entries[1]!.roundNumber).toBe(1) // r1 is entry 1 (oldest), but was round 1
  })

  // ── Vote summary ──────────────────────────────────────────────────────────

  it('"No votes" when round has no votes', async () => {
    const scale = makeScale(['1', '2', '3'])
    const r = makeRound({ id: 'r1', scale, votes: {}, revealedAt: 1000 })
    const c = await createComponent([r])
    expect(c.entries()[0]!.summary).toBe('No votes')
  })

  it('single unanimous vote produces "card×count"', async () => {
    const scale = makeScale(['1', '2', '3', '5'])
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '5', p2: '5', p3: '5' },
      revealedAt: 2000,
    })
    const c = await createComponent([r])
    expect(c.entries()[0]!.summary).toBe('5×3')
  })

  it('multiple cards are sorted count-desc', async () => {
    const scale = makeScale(['1', '2', '3', '5'])
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '5', p2: '5', p3: '3' },
      revealedAt: 2000,
    })
    const c = await createComponent([r])
    // 5 appears twice, 3 once → "5×2, 3×1"
    expect(c.entries()[0]!.summary).toBe('5×2, 3×1')
  })

  it('count ties are broken by scale order (card appearing earlier wins)', async () => {
    const scale = makeScale(['1', '2', '3', '5'])
    const r = makeRound({
      id: 'r1',
      scale,
      votes: { p1: '3', p2: '1' }, // both count 1; "1" is earlier in scale
      revealedAt: 2000,
    })
    const c = await createComponent([r])
    // "1" (index 0) beats "3" (index 2) on tie
    expect(c.entries()[0]!.summary).toBe('1×1, 3×1')
  })

  // ── Elapsed time ──────────────────────────────────────────────────────────

  it('computes elapsed as formatElapsed(revealedAt − timerStartedAt)', async () => {
    const scale = makeScale(['1', '2'])
    // 90 000 ms = 1 min 30 sec → "1:30"
    const r = makeRound({
      id: 'r1',
      scale,
      votes: {},
      revealedAt: 100_000,
      timerStartedAt: 10_000,
    })
    const c = await createComponent([r])
    expect(c.entries()[0]!.elapsed).toBe('1:30')
  })

  it('elapsed is null when timerStartedAt is absent', async () => {
    const scale = makeScale(['1', '2'])
    const r = makeRound({ id: 'r1', scale, votes: {}, revealedAt: 1000 })
    const c = await createComponent([r])
    expect(c.entries()[0]!.elapsed).toBeNull()
  })

  it('elapsed is null when revealedAt is absent (guard)', async () => {
    const scale = makeScale(['1', '2'])
    // revealedAt absent → filtered out entirely; entries returns []
    const r = makeRound({ id: 'r1', scale, votes: {}, timerStartedAt: 0 })
    const c = await createComponent([r])
    expect(c.entries()).toHaveLength(0)
  })

  // ── Title passthrough ─────────────────────────────────────────────────────

  it('title is undefined when round has no title', async () => {
    const scale = makeScale(['1'])
    const r = makeRound({ id: 'r1', scale, votes: {}, revealedAt: 500 })
    const c = await createComponent([r])
    expect(c.entries()[0]!.title).toBeUndefined()
  })

  it('title is forwarded when round has a title', async () => {
    const scale = makeScale(['1'])
    const r = makeRound({
      id: 'r1',
      scale,
      votes: {},
      revealedAt: 500,
      title: 'Auth migration',
    })
    const c = await createComponent([r])
    expect(c.entries()[0]!.title).toBe('Auth migration')
  })
})
