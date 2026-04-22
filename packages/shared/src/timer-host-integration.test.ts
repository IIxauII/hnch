/**
 * Integration tests for the ADR-0010 + ADR-0011 interaction:
 * timer-driven reveal combined with host election.
 *
 * These drive two in-process Yjs peers (synced via `Y.applyUpdate`)
 * and exercise the pure helpers that the client's `RoundTimerService`
 * and `HostElectionService` delegate to. The goal is to assert the
 * doc-level invariants without needing Angular or a real WebSocket.
 */

import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'

import { FIBONACCI_SCALE, type InitDocInit } from './doc.js'
import {
  appendRound,
  initDoc,
  patchSettings,
  projectDoc,
  revealRound,
  startRoundTimer,
} from './doc-projection.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedDoc(
  overrides: Partial<InitDocInit> = {},
): { doc: Y.Doc; init: InitDocInit } {
  const init: InitDocInit = {
    roomUuid: 'room-uuid-int',
    createdAt: 1_700_000_000_000,
    participantId: 'p-alice',
    displayName: 'Alice',
    defaultScale: FIBONACCI_SCALE,
    revealMode: 'timer',
    timerDurationMs: 60_000,
    ...overrides,
  }
  const doc = new Y.Doc()
  initDoc(doc, init)
  return { doc, init }
}

/** Sync docA's state into docB (one-way). */
function syncAtoB(docA: Y.Doc, docB: Y.Doc): void {
  const state = Y.encodeStateAsUpdate(docA)
  Y.applyUpdate(docB, state)
}

/** Full bidirectional sync. */
function syncBoth(docA: Y.Doc, docB: Y.Doc): void {
  syncAtoB(docA, docB)
  syncAtoB(docB, docA)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('timer + host election integration', () => {
  it('host writes revealedAt at timer expiry — exactly one write', () => {
    // Peer A (Alice) is the host; Peer B (Bob) is a joiner.
    const { doc: docA } = seedDoc()
    const docB = new Y.Doc()
    syncAtoB(docA, docB)

    // Start a round with a 60s timer on the host.
    const roundId = 'r1'
    const timerStart = 1_700_000_100_000
    docA.transact(() => {
      appendRound(docA, { id: roundId, createdAt: timerStart, createdBy: 'p-alice' })
      startRoundTimer(docA, roundId, timerStart)
    })
    syncBoth(docA, docB)

    // Verify both peers see the timer.
    const snapA = projectDoc(docA)
    const snapB = projectDoc(docB)
    expect(snapA.rounds[0]!.timerStartedAt).toBe(timerStart)
    expect(snapB.rounds[0]!.timerStartedAt).toBe(timerStart)
    expect(snapA.rounds[0]!.revealedAt).toBeUndefined()
    expect(snapB.rounds[0]!.revealedAt).toBeUndefined()

    // Timer expires — host (Alice) writes revealedAt.
    const expiryTime = timerStart + 60_000
    revealRound(docA, roundId, expiryTime)
    syncBoth(docA, docB)

    // Both peers see exactly one revealedAt.
    const finalA = projectDoc(docA)
    const finalB = projectDoc(docB)
    expect(finalA.rounds[0]!.revealedAt).toBe(expiryTime)
    expect(finalB.rounds[0]!.revealedAt).toBe(expiryTime)
  })

  it('concurrent reveal writes from host and fallback merge to one value', () => {
    // Simulates the race condition where both peers write revealedAt
    // near-simultaneously. Yjs last-writer-wins merges them.
    const { doc: docA } = seedDoc()
    const docB = new Y.Doc()
    syncAtoB(docA, docB)

    const roundId = 'r1'
    const timerStart = 1_700_000_100_000
    docA.transact(() => {
      appendRound(docA, { id: roundId, createdAt: timerStart, createdBy: 'p-alice' })
      startRoundTimer(docA, roundId, timerStart)
    })
    syncBoth(docA, docB)

    // Both write revealedAt independently (before sync).
    const expiryTime = timerStart + 60_000
    revealRound(docA, roundId, expiryTime)
    revealRound(docB, roundId, expiryTime + 100) // slightly different timestamp

    // Sync — Yjs merges, one value wins.
    syncBoth(docA, docB)

    const finalA = projectDoc(docA)
    const finalB = projectDoc(docB)

    // Both peers converge on the same value (deterministic merge).
    expect(finalA.rounds[0]!.revealedAt).toBeDefined()
    expect(finalA.rounds[0]!.revealedAt).toBe(finalB.rounds[0]!.revealedAt)
  })

  it('host drops before expiry — surviving peer writes revealedAt', () => {
    // Alice is host, Bob is joiner. Alice drops (stops syncing) before
    // the timer expires. Bob writes revealedAt as the fallback.
    const { doc: docA } = seedDoc()
    const docB = new Y.Doc()
    syncAtoB(docA, docB)

    const roundId = 'r1'
    const timerStart = 1_700_000_100_000
    docA.transact(() => {
      appendRound(docA, { id: roundId, createdAt: timerStart, createdBy: 'p-alice' })
      startRoundTimer(docA, roundId, timerStart)
    })
    syncBoth(docA, docB)

    // Alice drops — no more syncs from her side.

    // Bob detects expiry and elects himself as host.
    patchSettings(docB, { hostParticipantId: 'p-bob' })

    // Bob writes the fallback revealedAt after the grace period.
    const fallbackTime = timerStart + 60_000 + 2_000 // +2s grace
    revealRound(docB, roundId, fallbackTime)

    // Sync Bob's changes back to Alice (when she eventually reconnects).
    syncAtoB(docB, docA)

    const finalA = projectDoc(docA)
    const finalB = projectDoc(docB)

    // Both see the reveal.
    expect(finalA.rounds[0]!.revealedAt).toBe(fallbackTime)
    expect(finalB.rounds[0]!.revealedAt).toBe(fallbackTime)

    // Bob is the new host.
    expect(finalA.settings.hostParticipantId).toBe('p-bob')
    expect(finalB.settings.hostParticipantId).toBe('p-bob')
  })

  it('new host (elected after drop) can start the next round', () => {
    // After host election, the new host should be able to start rounds.
    const { doc: docA } = seedDoc()
    const docB = new Y.Doc()
    syncAtoB(docA, docB)

    // Round 1 with timer.
    const roundId = 'r1'
    const timerStart = 1_700_000_100_000
    docA.transact(() => {
      appendRound(docA, { id: roundId, createdAt: timerStart, createdBy: 'p-alice' })
      startRoundTimer(docA, roundId, timerStart)
    })
    syncBoth(docA, docB)

    // Alice drops. Bob becomes host and reveals.
    patchSettings(docB, { hostParticipantId: 'p-bob' })
    revealRound(docB, roundId, timerStart + 60_000 + 2_000)

    // Bob starts round 2.
    const round2Id = 'r2'
    const round2Start = timerStart + 120_000
    docB.transact(() => {
      appendRound(docB, { id: round2Id, createdAt: round2Start, createdBy: 'p-bob' })
      startRoundTimer(docB, round2Id, round2Start)
    })
    syncBoth(docA, docB)

    const finalB = projectDoc(docB)
    expect(finalB.rounds).toHaveLength(2)
    expect(finalB.rounds[1]!.id).toBe(round2Id)
    expect(finalB.rounds[1]!.createdBy).toBe('p-bob')
    expect(finalB.rounds[1]!.timerStartedAt).toBe(round2Start)
    expect(finalB.rounds[1]!.revealedAt).toBeUndefined()
  })
})
