import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'

import {
  FIBONACCI_SCALE,
  TSHIRT_SCALE,
  participantRole,
  type Participant,
  type Scale,
} from './doc.js'
import {
  appendRound,
  castVote,
  clearVote,
  currentRound,
  DOC_META_KEY,
  DOC_PARTICIPANTS_KEY,
  DOC_ROUNDS_KEY,
  DOC_SETTINGS_KEY,
  endSessionForEveryone,
  initDoc,
  isConsensus,
  patchSettings,
  projectDoc,
  revealRound,
  upsertParticipant,
  type DocProjection,
  type InitDocInit,
} from './doc-projection.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/**
 * A freshly seeded doc suitable for most tests. Returns both the doc
 * and the init payload so assertions can reference the input values.
 */
function seedDoc(
  overrides: Partial<InitDocInit> = {},
): { doc: Y.Doc; init: InitDocInit } {
  const init: InitDocInit = {
    roomUuid: 'room-uuid-1',
    createdAt: 1_700_000_000_000,
    participantId: 'p-host',
    displayName: 'Alice',
    defaultScale: FIBONACCI_SCALE,
    sessionName: 'Sprint 42 planning',
    ...overrides,
  }
  const doc = new Y.Doc()
  initDoc(doc, init)
  return { doc, init }
}

// ---------------------------------------------------------------------------
// initDoc
// ---------------------------------------------------------------------------

describe('initDoc', () => {
  it('seeds meta, settings, and the host participant in one pass', () => {
    const { doc, init } = seedDoc()
    const snap = projectDoc(doc)

    expect(snap.meta).toEqual({
      roomUuid: init.roomUuid,
      createdAt: init.createdAt,
      createdBy: init.participantId,
    })
    expect(snap.settings).toEqual({
      name: init.sessionName,
      defaultScale: FIBONACCI_SCALE,
      hostParticipantId: init.participantId,
    })
    expect(snap.participants).toEqual([
      {
        id: init.participantId,
        displayName: init.displayName,
        joinedAt: init.createdAt,
      },
    ])
    expect(snap.rounds).toEqual([])
  })

  it('omits optional settings keys when not provided', () => {
    const { doc } = seedDoc({ sessionName: undefined })
    const snap = projectDoc(doc)

    expect('name' in snap.settings).toBe(false)
  })

  it('throws when called on an already-seeded doc', () => {
    const { doc } = seedDoc()
    expect(() =>
      initDoc(doc, {
        roomUuid: 'other',
        createdAt: 0,
        participantId: 'p-other',
        displayName: 'Bob',
        defaultScale: TSHIRT_SCALE,
      }),
    ).toThrow(/already seeded/)
  })

  it('fires observers exactly once per init (single transaction)', () => {
    const doc = new Y.Doc()
    let events = 0
    const handler = (): void => {
      events += 1
    }
    doc.on('afterTransaction', handler)

    initDoc(doc, {
      roomUuid: 'room-tx',
      createdAt: 1,
      participantId: 'p',
      displayName: 'A',
      defaultScale: FIBONACCI_SCALE,
    })

    doc.off('afterTransaction', handler)
    expect(events).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// patchSettings
// ---------------------------------------------------------------------------

describe('patchSettings', () => {
  it('shallow-merges a partial patch', () => {
    const { doc } = seedDoc()
    patchSettings(doc, { name: 'Renamed' })
    const snap = projectDoc(doc)

    expect(snap.settings.name).toBe('Renamed')
    // Untouched keys survive the patch.
    expect(snap.settings.defaultScale).toEqual(FIBONACCI_SCALE)
    expect(snap.settings.hostParticipantId).toBe('p-host')
  })

  it('treats `undefined` as explicit key deletion', () => {
    const { doc } = seedDoc()
    patchSettings(doc, { name: undefined })
    const snap = projectDoc(doc)

    expect('name' in snap.settings).toBe(false)
  })

  it('replaces the defaultScale wholesale (no per-card merge)', () => {
    const { doc } = seedDoc()
    patchSettings(doc, { defaultScale: TSHIRT_SCALE })
    const snap = projectDoc(doc)

    expect(snap.settings.defaultScale).toEqual(TSHIRT_SCALE)
  })
})

// ---------------------------------------------------------------------------
// upsertParticipant
// ---------------------------------------------------------------------------

describe('upsertParticipant', () => {
  it('adds a new participant', () => {
    const { doc } = seedDoc()
    const bob: Participant = { displayName: 'Bob', joinedAt: 1_700_000_001_000 }
    upsertParticipant(doc, 'p-bob', bob)
    const snap = projectDoc(doc)

    expect(snap.participants.map((p) => p.id)).toEqual(['p-host', 'p-bob'])
    expect(snap.participants[1]).toEqual({ id: 'p-bob', ...bob })
  })

  it('updates an existing participant in place (same id, new displayName)', () => {
    const { doc } = seedDoc()
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice (edited)',
      joinedAt: 1_700_000_000_000,
    })
    const snap = projectDoc(doc)

    expect(snap.participants).toHaveLength(1)
    expect(snap.participants[0]!.displayName).toBe('Alice (edited)')
  })

  it('orders participants by joinedAt, then id, independently of insert order', () => {
    const { doc } = seedDoc({
      participantId: 'p-middle',
      createdAt: 500,
      displayName: 'M',
    })
    upsertParticipant(doc, 'p-last', { displayName: 'L', joinedAt: 1000 })
    upsertParticipant(doc, 'p-first', { displayName: 'F', joinedAt: 100 })
    // Ties on joinedAt → fall back to id ordering.
    upsertParticipant(doc, 'p-tie-b', { displayName: 'Tb', joinedAt: 100 })
    upsertParticipant(doc, 'p-tie-a', { displayName: 'Ta', joinedAt: 100 })

    const snap = projectDoc(doc)
    expect(snap.participants.map((p) => p.id)).toEqual([
      'p-first',
      'p-tie-a',
      'p-tie-b',
      'p-middle',
      'p-last',
    ])
  })
})

// ---------------------------------------------------------------------------
// appendRound
// ---------------------------------------------------------------------------

describe('appendRound', () => {
  it('inherits scale from settings.defaultScale and snapshots it', () => {
    const { doc } = seedDoc()
    const id = appendRound(doc, {
      id: 'r1',
      createdAt: 1_700_000_100_000,
      createdBy: 'p-host',
      title: 'Auth migration',
    })

    expect(id).toBe('r1')
    const snap = projectDoc(doc)
    expect(snap.rounds).toHaveLength(1)
    expect(snap.rounds[0]!.scale).toEqual(FIBONACCI_SCALE)
    expect(snap.rounds[0]!.title).toBe('Auth migration')
    expect(snap.rounds[0]!.votes).toEqual({})

    // Snapshot isolation: mutating the default scale afterwards must not
    // rewrite the existing round's scale.
    patchSettings(doc, { defaultScale: TSHIRT_SCALE })
    const snap2 = projectDoc(doc)
    expect(snap2.rounds[0]!.scale).toEqual(FIBONACCI_SCALE)
    expect(snap2.settings.defaultScale).toEqual(TSHIRT_SCALE)
  })

  it('accepts an explicit scale override', () => {
    const { doc } = seedDoc()
    appendRound(doc, {
      id: 'r-tshirt',
      createdAt: 1,
      createdBy: 'p-host',
      scale: TSHIRT_SCALE,
    })
    const snap = projectDoc(doc)
    expect(snap.rounds[0]!.scale).toEqual(TSHIRT_SCALE)
  })

  it('carries optional context fields and parentRoundId through', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 10, createdBy: 'p-host' })
    appendRound(doc, {
      id: 'r2',
      createdAt: 20,
      createdBy: 'p-host',
      title: 'Auth migration',
      description: 'Re-vote after break-out discussion',
      ticketId: 'PROJ-1234',
      parentRoundId: 'r1',
    })
    const snap = projectDoc(doc)
    expect(snap.rounds.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(snap.rounds[1]).toMatchObject({
      parentRoundId: 'r1',
      title: 'Auth migration',
      description: 'Re-vote after break-out discussion',
      ticketId: 'PROJ-1234',
    })
  })

  it('throws when no defaultScale is set and no override is provided', () => {
    // Direct Yjs poke: remove the defaultScale to simulate a malformed doc.
    const { doc } = seedDoc()
    doc.getMap(DOC_SETTINGS_KEY).delete('defaultScale')
    expect(() =>
      appendRound(doc, { id: 'r-bare', createdAt: 1, createdBy: 'p-host' }),
    ).toThrow(/defaultScale/)
  })
})

// ---------------------------------------------------------------------------
// castVote / clearVote
// ---------------------------------------------------------------------------

describe('castVote / clearVote', () => {
  it('sets a vote and overwrites on re-cast', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    castVote(doc, 'r1', 'p-host', '5')
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' })
    castVote(doc, 'r1', 'p-host', '8')
    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '8' })
  })

  it('clears a specific participant without disturbing others', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    castVote(doc, 'r1', 'p-host', '5')
    castVote(doc, 'r1', 'p-bob', '3')
    clearVote(doc, 'r1', 'p-host')

    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-bob': '3' })
  })

  it('no-ops after the round is revealed (reveals are immutable)', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    castVote(doc, 'r1', 'p-host', '5')
    revealRound(doc, 'r1', 42)

    castVote(doc, 'r1', 'p-host', '13')
    clearVote(doc, 'r1', 'p-host')

    expect(projectDoc(doc).rounds[0]!.votes).toEqual({ 'p-host': '5' })
  })

  it('throws on unknown round ids', () => {
    const { doc } = seedDoc()
    expect(() => castVote(doc, 'nope', 'p-host', '5')).toThrow(/not found/)
    expect(() => clearVote(doc, 'nope', 'p-host')).toThrow(/not found/)
  })
})

// ---------------------------------------------------------------------------
// revealRound
// ---------------------------------------------------------------------------

describe('revealRound', () => {
  it('stamps revealedAt', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    revealRound(doc, 'r1', 1_700_000_200_000)
    expect(projectDoc(doc).rounds[0]!.revealedAt).toBe(1_700_000_200_000)
  })

  it('throws on unknown round ids', () => {
    const { doc } = seedDoc()
    expect(() => revealRound(doc, 'nope', 1)).toThrow(/not found/)
  })
})

// ---------------------------------------------------------------------------
// appendRound always writes timerStartedAt (stopwatch)
// ---------------------------------------------------------------------------

describe('appendRound timerStartedAt', () => {
  it('always writes timerStartedAt equal to createdAt', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1_700_000_100_000, createdBy: 'p-host' })
    const snap = projectDoc(doc)
    expect(snap.rounds[0]!.timerStartedAt).toBe(1_700_000_100_000)
    expect(snap.rounds[0]!.revealedAt).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// currentRound
// ---------------------------------------------------------------------------

describe('currentRound', () => {
  it('returns null for empty rounds', () => {
    const { doc } = seedDoc()
    expect(currentRound(projectDoc(doc))).toBeNull()
  })

  it('returns the only round when one exists and is unrevealed', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    expect(currentRound(projectDoc(doc))!.id).toBe('r1')
  })

  it('returns the last unrevealed round when earlier rounds are revealed', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    appendRound(doc, { id: 'r2', createdAt: 2, createdBy: 'p-host' })
    appendRound(doc, { id: 'r3', createdAt: 3, createdBy: 'p-host' })
    revealRound(doc, 'r1', 10)
    revealRound(doc, 'r2', 20)

    expect(currentRound(projectDoc(doc))!.id).toBe('r3')
  })

  it('falls back to the last round when all are revealed', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    appendRound(doc, { id: 'r2', createdAt: 2, createdBy: 'p-host' })
    revealRound(doc, 'r1', 10)
    revealRound(doc, 'r2', 20)

    expect(currentRound(projectDoc(doc))!.id).toBe('r2')
  })
})

// ---------------------------------------------------------------------------
// Projection round-trip + containers
// ---------------------------------------------------------------------------

describe('projectDoc round-trip', () => {
  it('produces a fully-typed snapshot over a populated doc', () => {
    const { doc } = seedDoc()
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 1_700_000_050_000 })
    const r1 = appendRound(doc, {
      id: 'r1',
      createdAt: 1_700_000_100_000,
      createdBy: 'p-host',
      title: 'Auth migration',
    })
    castVote(doc, r1, 'p-host', '5')
    castVote(doc, r1, 'p-bob', '8')
    revealRound(doc, r1, 1_700_000_110_000)
    appendRound(doc, {
      id: 'r2',
      createdAt: 1_700_000_120_000,
      createdBy: 'p-host',
      parentRoundId: r1,
      title: 'Auth migration',
    })

    const snap: DocProjection = projectDoc(doc)

    // Participants stable-ordered by joinedAt.
    expect(snap.participants.map((p) => p.id)).toEqual(['p-host', 'p-bob'])

    // Rounds keep insertion order; votes project as plain records.
    expect(snap.rounds.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(snap.rounds[0]!.votes).toEqual({ 'p-host': '5', 'p-bob': '8' })
    expect(snap.rounds[0]!.revealedAt).toBe(1_700_000_110_000)
    expect(snap.rounds[1]!.parentRoundId).toBe('r1')

    // currentRound picks the unrevealed re-vote.
    expect(currentRound(snap)!.id).toBe('r2')
  })

  it('uses the documented top-level container keys', () => {
    const { doc } = seedDoc()
    // Touching these keys directly on the raw doc must see the same data.
    expect(doc.getMap(DOC_META_KEY).get('roomUuid')).toBe('room-uuid-1')
    expect(doc.getMap(DOC_SETTINGS_KEY).get('hostParticipantId')).toBe('p-host')
    expect(doc.getMap(DOC_PARTICIPANTS_KEY).size).toBe(1)
    expect(doc.getArray(DOC_ROUNDS_KEY).length).toBe(0)
  })

  it('is safe against later mutations of the source doc (values, not live handles)', () => {
    const { doc } = seedDoc()
    const snap = projectDoc(doc)
    upsertParticipant(doc, 'p-bob', { displayName: 'Bob', joinedAt: 5 })

    // The earlier snapshot reflects the state at the time it was built.
    expect(snap.participants).toHaveLength(1)
    expect(projectDoc(doc).participants).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Custom scale round-trip (sanity: projections don't collapse unknown scales)
// ---------------------------------------------------------------------------

describe('custom scales round-trip', () => {
  it('preserves a non-builtin scale verbatim', () => {
    const custom: Scale = { id: 'custom-xau', cards: ['🟢', '🟡', '🔴', '?'] }
    const { doc } = seedDoc({ defaultScale: custom })
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })

    const snap = projectDoc(doc)
    expect(snap.settings.defaultScale).toEqual(custom)
    expect(snap.rounds[0]!.scale).toEqual(custom)
  })
})

// ---------------------------------------------------------------------------
// isConsensus
// ---------------------------------------------------------------------------

describe('isConsensus', () => {
  it('returns false when no votes exist', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    const snap = projectDoc(doc)
    expect(isConsensus(snap.rounds[0]!)).toBe(false)
  })

  it('returns false when only one vote exists', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    castVote(doc, 'r1', 'p-host', '5')
    const snap = projectDoc(doc)
    expect(isConsensus(snap.rounds[0]!)).toBe(false)
  })

  it('returns true when two identical votes exist', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    castVote(doc, 'r1', 'p-host', '5')
    castVote(doc, 'r1', 'p-bob', '5')
    const snap = projectDoc(doc)
    expect(isConsensus(snap.rounds[0]!)).toBe(true)
  })

  it('returns false when two different votes exist', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    castVote(doc, 'r1', 'p-host', '5')
    castVote(doc, 'r1', 'p-bob', '8')
    const snap = projectDoc(doc)
    expect(isConsensus(snap.rounds[0]!)).toBe(false)
  })

  it('returns false when three votes with one outlier exist', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    castVote(doc, 'r1', 'p-host', '5')
    castVote(doc, 'r1', 'p-bob', '5')
    castVote(doc, 'r1', 'p-charlie', '13')
    const snap = projectDoc(doc)
    expect(isConsensus(snap.rounds[0]!)).toBe(false)
  })

  it('returns true when three identical votes exist', () => {
    const { doc } = seedDoc()
    appendRound(doc, { id: 'r1', createdAt: 1, createdBy: 'p-host' })
    castVote(doc, 'r1', 'p-host', '5')
    castVote(doc, 'r1', 'p-bob', '5')
    castVote(doc, 'r1', 'p-charlie', '5')
    const snap = projectDoc(doc)
    expect(isConsensus(snap.rounds[0]!)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// participant role (ADR-0020)
// ---------------------------------------------------------------------------

describe('participant role projection round-trip', () => {
  it('projects voter role when explicitly set', () => {
    const { doc } = seedDoc()
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice',
      joinedAt: 1_700_000_000_000,
      role: 'voter',
    })
    const snap = projectDoc(doc)
    expect(snap.participants[0]!.role).toBe('voter')
  })

  it('projects viewer role when explicitly set', () => {
    const { doc } = seedDoc()
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice',
      joinedAt: 1_700_000_000_000,
      role: 'viewer',
    })
    const snap = projectDoc(doc)
    expect(snap.participants[0]!.role).toBe('viewer')
  })

  it('omits role field when not provided (backward-compat absent = voter)', () => {
    const { doc } = seedDoc()
    // initDoc does not set role — simulates a pre-ADR-0020 participant.
    const snap = projectDoc(doc)
    expect('role' in snap.participants[0]!).toBe(false)
  })

  it('upsert can change role from viewer to voter', () => {
    const { doc } = seedDoc()
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice',
      joinedAt: 1_700_000_000_000,
      role: 'viewer',
    })
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice',
      joinedAt: 1_700_000_000_000,
      role: 'voter',
    })
    const snap = projectDoc(doc)
    expect(snap.participants[0]!.role).toBe('voter')
  })

  it('new participant with role appears correctly', () => {
    const { doc } = seedDoc()
    upsertParticipant(doc, 'p-observer', {
      displayName: 'Observer',
      joinedAt: 1_700_000_001_000,
      role: 'viewer',
    })
    const snap = projectDoc(doc)
    const observer = snap.participants.find((p) => p.id === 'p-observer')!
    expect(observer.role).toBe('viewer')
  })

  it('updating displayName without role preserves existing viewer role (partial-update)', () => {
    const { doc } = seedDoc()
    // Set viewer role first.
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice',
      joinedAt: 1_700_000_000_000,
      role: 'viewer',
    })
    // Update displayName only — no role field.
    upsertParticipant(doc, 'p-host', {
      displayName: 'Alice (renamed)',
      joinedAt: 1_700_000_000_000,
    })
    const snap = projectDoc(doc)
    expect(snap.participants[0]!.displayName).toBe('Alice (renamed)')
    expect(snap.participants[0]!.role).toBe('viewer')
  })
})

// ---------------------------------------------------------------------------
// endSessionForEveryone
// ---------------------------------------------------------------------------

describe('endSessionForEveryone', () => {
  it('writes sessionEndedAt to meta projection', () => {
    const { doc } = seedDoc()
    const before = Date.now()
    endSessionForEveryone(doc)
    const after = Date.now()
    const snap = projectDoc(doc)
    expect(snap.meta.sessionEndedAt).toBeGreaterThanOrEqual(before)
    expect(snap.meta.sessionEndedAt).toBeLessThanOrEqual(after)
  })

  it('sessionEndedAt is undefined when not set', () => {
    const { doc } = seedDoc()
    const snap = projectDoc(doc)
    expect(snap.meta.sessionEndedAt).toBeUndefined()
  })

  it('is idempotent — second call overwrites with a new timestamp', () => {
    const { doc } = seedDoc()
    endSessionForEveryone(doc)
    const first = projectDoc(doc).meta.sessionEndedAt!
    endSessionForEveryone(doc)
    const second = projectDoc(doc).meta.sessionEndedAt!
    expect(second).toBeGreaterThanOrEqual(first)
  })
})

// ---------------------------------------------------------------------------
// participantRole helper
// ---------------------------------------------------------------------------

describe('participantRole', () => {
  it('returns voter when role is explicitly voter', () => {
    expect(participantRole({ role: 'voter' })).toBe('voter')
  })

  it('returns viewer when role is explicitly viewer', () => {
    expect(participantRole({ role: 'viewer' })).toBe('viewer')
  })

  it('returns voter when role is absent (backward-compat default)', () => {
    expect(participantRole({})).toBe('voter')
  })

  it('returns voter when role is undefined', () => {
    expect(participantRole({ role: undefined })).toBe('voter')
  })
})
