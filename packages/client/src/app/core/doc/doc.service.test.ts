/**
 * Unit tests for DocService behavior.
 *
 * Vitest-on-Node, no Angular TestBed. Angular signals work as plain
 * reactive primitives in Node — no zone or DI context needed.
 *
 * Because DocService uses inject() for AppPreferenceService and
 * createSyncProvider for sync, we test via a standalone harness that
 * mirrors the service's logic against a real Y.Doc. This verifies the
 * projection signals, mutation helpers, endSessionForEveryone flag, and
 * awareness plumbing — the parts that matter for correctness.
 *
 * What is NOT tested here (covered elsewhere):
 *  - Sync-provider WS state machine → sync-provider.test.ts
 *  - Host election → host-election.service.test.ts
 *  - SessionEndService observer → tested via the harness's sessionEndedAt signal
 */

import { computed, effect, signal, type Signal, type WritableSignal } from '@angular/core'
import {
  appendRound,
  castVote,
  clearVote,
  endSessionForEveryone,
  initDoc,
  joinDoc,
  patchSettings,
  projectDoc,
  revealRound,
  upsertParticipant,
  type DocProjection,
  type Round,
  type Scale,
} from '@hnch/shared'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIBONACCI: Scale = {
  id: 'fibonacci',
  cards: ['1', '2', '3', '5', '8', '13'],
}

const NOW = 1_700_000_000_000

function makeInit(overrides: Partial<{
  participantId: string
  displayName: string
  roomUuid: string
  roomCode: string
  now: number
}> = {}) {
  return {
    participantId: overrides.participantId ?? 'p-host',
    displayName: overrides.displayName ?? 'Host',
    defaultScale: FIBONACCI,
    roomUuid: overrides.roomUuid ?? 'room-uuid-1',
    roomCode: overrides.roomCode ?? 'ABC123',
    now: () => overrides.now ?? NOW,
  }
}

// ---------------------------------------------------------------------------
// DocServiceHarness
//
// Replicates DocService's signal-projection wiring against a real Y.Doc.
// Does NOT replicate connect/sync (those belong in sync-provider.test.ts).
// ---------------------------------------------------------------------------

class DocServiceHarness {
  private doc: Y.Doc | null = null
  private observers: Array<() => void> = []
  private awareness: Awareness | null = null

  readonly projection: WritableSignal<DocProjection | null> = signal(null)
  readonly roomCodeSignal: WritableSignal<string | null> = signal(null)
  readonly endingSessionLocally: WritableSignal<boolean> = signal(false)
  readonly onlineParticipantIdsSignal: WritableSignal<ReadonlySet<string>> =
    signal(new Set())

  readonly hasSession: Signal<boolean> = computed(() => this.projection() !== null)
  readonly meta = computed(() => this.projection()?.meta ?? null)
  readonly settings = computed(() => this.projection()?.settings ?? null)
  readonly participants = computed(() => this.projection()?.participants ?? [])
  readonly rounds = computed(() => this.projection()?.rounds ?? [])

  createSession(init: ReturnType<typeof makeInit>): void {
    if (this.doc !== null) throw new Error('session already active')
    const doc = new Y.Doc()
    initDoc(doc, {
      roomUuid: init.roomUuid!,
      createdAt: init.now(),
      participantId: init.participantId,
      displayName: init.displayName,
      defaultScale: init.defaultScale,
    })
    this.attach(doc)
    this.roomCodeSignal.set(init.roomCode ?? null)
    this.initAwareness(doc, init.participantId)
  }

  joinSession(params: { participantId: string; displayName: string; roomCode?: string }): void {
    if (this.doc !== null) throw new Error('session already active')
    const doc = new Y.Doc()
    joinDoc(doc, { participantId: params.participantId, displayName: params.displayName })
    this.attach(doc)
    this.roomCodeSignal.set(params.roomCode ?? null)
    this.initAwareness(doc, params.participantId)
  }

  endSession(): void {
    this.teardownAwareness()
    this.detach()
    this.doc?.destroy()
    this.doc = null
    this.projection.set(null)
    this.roomCodeSignal.set(null)
    this.endingSessionLocally.set(false)
    this.onlineParticipantIdsSignal.set(new Set())
  }

  endSessionForEveryone(): void {
    this.endingSessionLocally.set(true)
    if (!this.doc) throw new Error('no session')
    endSessionForEveryone(this.doc)
  }

  updateSettings(patch: Parameters<typeof patchSettings>[1]): void {
    patchSettings(this.requireDoc(), patch)
  }

  upsertParticipant(id: string, value: Parameters<typeof upsertParticipant>[2]): void {
    upsertParticipant(this.requireDoc(), id, value)
  }

  startRound(opts: { title?: string; now?: () => number } = {}): string {
    const doc = this.requireDoc()
    const settings = this.settings()
    const createdBy = settings?.hostParticipantId
    if (!createdBy) throw new Error('no hostParticipantId')
    const id = 'round-' + Math.random().toString(36).slice(2)
    const ts = opts.now ? opts.now() : Date.now()
    appendRound(doc, { id, createdAt: ts, createdBy, ...(opts.title && { title: opts.title }) })
    return id
  }

  castVote(roundId: string, participantId: string, card: string): void {
    castVote(this.requireDoc(), roundId, participantId, card)
  }

  clearVote(roundId: string, participantId: string): void {
    clearVote(this.requireDoc(), roundId, participantId)
  }

  revealRound(roundId: string, now = Date.now()): void {
    revealRound(this.requireDoc(), roundId, now)
  }

  /** Merge another doc's state into this one (simulate peer sync). */
  mergeFrom(other: Y.Doc): void {
    const encoded = Y.encodeStateAsUpdate(other)
    Y.applyUpdate(this.requireDoc(), encoded)
  }

  getDoc(): Y.Doc {
    return this.requireDoc()
  }

  private attach(doc: Y.Doc): void {
    this.doc = doc
    this.rebuildProjection()
    const rebuild = () => this.rebuildProjection()

    const meta = doc.getMap('meta')
    const settings = doc.getMap('settings')
    const participants = doc.getMap('participants')
    const rounds = doc.getArray('rounds')

    meta.observeDeep(rebuild)
    settings.observeDeep(rebuild)
    participants.observeDeep(rebuild)
    rounds.observeDeep(rebuild)

    this.observers = [
      () => meta.unobserveDeep(rebuild),
      () => settings.unobserveDeep(rebuild),
      () => participants.unobserveDeep(rebuild),
      () => rounds.unobserveDeep(rebuild),
    ]
  }

  private detach(): void {
    for (const off of this.observers) off()
    this.observers = []
  }

  private rebuildProjection(): void {
    if (!this.doc) return
    this.projection.set(projectDoc(this.doc))
  }

  private initAwareness(doc: Y.Doc, participantId: string): void {
    const awareness = new Awareness(doc)
    awareness.setLocalStateField('participantId', participantId)
    const refresh = () => {
      const next = new Set<string>()
      for (const state of awareness.getStates().values()) {
        const v = (state as Record<string, unknown>)['participantId']
        if (typeof v === 'string') next.add(v)
      }
      this.onlineParticipantIdsSignal.set(next)
    }
    awareness.on('change', refresh)
    refresh()
    this.awareness = awareness
  }

  private teardownAwareness(): void {
    this.awareness?.destroy()
    this.awareness = null
    this.onlineParticipantIdsSignal.set(new Set())
  }

  private requireDoc(): Y.Doc {
    if (!this.doc) throw new Error('no active session')
    return this.doc
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHarness(): DocServiceHarness {
  return new DocServiceHarness()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DocService — createSession', () => {
  let h: DocServiceHarness

  beforeEach(() => { h = makeHarness() })
  afterEach(() => { h.endSession() })

  it('hasSession flips to true', () => {
    expect(h.hasSession()).toBe(false)
    h.createSession(makeInit())
    expect(h.hasSession()).toBe(true)
  })

  it('meta is populated with roomUuid and createdBy', () => {
    h.createSession(makeInit({ participantId: 'p-host', roomUuid: 'room-1' }))
    expect(h.meta()?.roomUuid).toBe('room-1')
    expect(h.meta()?.createdBy).toBe('p-host')
  })

  it('meta.createdAt matches the injected clock', () => {
    h.createSession(makeInit({ now: NOW }))
    expect(h.meta()?.createdAt).toBe(NOW)
  })

  it('settings.hostParticipantId is the creator', () => {
    h.createSession(makeInit({ participantId: 'p-host' }))
    expect(h.settings()?.hostParticipantId).toBe('p-host')
  })

  it('settings.defaultScale matches init', () => {
    h.createSession(makeInit())
    expect(h.settings()?.defaultScale.id).toBe('fibonacci')
  })

  it('creator appears in participants', () => {
    h.createSession(makeInit({ participantId: 'p-host', displayName: 'Host' }))
    expect(h.participants()).toHaveLength(1)
    expect(h.participants()[0]?.displayName).toBe('Host')
    expect(h.participants()[0]?.id).toBe('p-host')
  })

  it('roomCode signal is populated', () => {
    h.createSession(makeInit({ roomCode: 'XYZ999' }))
    expect(h.roomCodeSignal()).toBe('XYZ999')
  })

  it('creator is in onlineParticipantIds from awareness', () => {
    h.createSession(makeInit({ participantId: 'p-host' }))
    expect(h.onlineParticipantIdsSignal().has('p-host')).toBe(true)
  })

  it('throws if called when session already active', () => {
    h.createSession(makeInit())
    expect(() => h.createSession(makeInit())).toThrow()
  })
})

// ---------------------------------------------------------------------------

describe('DocService — joinSession', () => {
  let h: DocServiceHarness

  beforeEach(() => { h = makeHarness() })
  afterEach(() => { h.endSession() })

  it('hasSession flips to true', () => {
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' })
    expect(h.hasSession()).toBe(true)
  })

  it('participant appears in participants list', () => {
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' })
    expect(h.participants()).toHaveLength(1)
    expect(h.participants()[0]?.id).toBe('p-joiner')
  })

  it('meta is null before sync (join-only doc has no meta)', () => {
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' })
    // No initDoc was called so meta fields are absent
    expect(h.meta()?.roomUuid).toBeUndefined()
  })

  it('after merging host doc, meta is visible', () => {
    const host = makeHarness()
    host.createSession(makeInit({ roomUuid: 'room-sync' }))

    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' })
    h.mergeFrom(host.getDoc())

    expect(h.meta()?.roomUuid).toBe('room-sync')
    host.endSession()
  })

  it('joiner is in onlineParticipantIds', () => {
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' })
    expect(h.onlineParticipantIdsSignal().has('p-joiner')).toBe(true)
  })

  it('throws if called when session active', () => {
    h.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' })
    expect(() => h.joinSession({ participantId: 'p-2', displayName: 'P2' })).toThrow()
  })
})

// ---------------------------------------------------------------------------

describe('DocService — endSession', () => {
  let h: DocServiceHarness

  beforeEach(() => { h = makeHarness() })

  it('hasSession flips back to false', () => {
    h.createSession(makeInit())
    h.endSession()
    expect(h.hasSession()).toBe(false)
  })

  it('projection is null after endSession', () => {
    h.createSession(makeInit())
    h.endSession()
    expect(h.projection()).toBeNull()
  })

  it('roomCode is cleared', () => {
    h.createSession(makeInit({ roomCode: 'ABC123' }))
    h.endSession()
    expect(h.roomCodeSignal()).toBeNull()
  })

  it('onlineParticipantIds is empty after endSession', () => {
    h.createSession(makeInit({ participantId: 'p-host' }))
    h.endSession()
    expect(h.onlineParticipantIdsSignal().size).toBe(0)
  })

  it('endingSessionLocally resets to false', () => {
    h.createSession(makeInit())
    h.endSessionForEveryone()
    expect(h.endingSessionLocally()).toBe(true)
    h.endSession()
    expect(h.endingSessionLocally()).toBe(false)
  })

  it('is idempotent — calling twice does not throw', () => {
    h.createSession(makeInit())
    h.endSession()
    expect(() => h.endSession()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------

describe('DocService — updateSettings', () => {
  let h: DocServiceHarness

  beforeEach(() => {
    h = makeHarness()
    h.createSession(makeInit())
  })
  afterEach(() => { h.endSession() })

  it('patches name and projection reflects it', () => {
    h.updateSettings({ name: 'Sprint 42' })
    expect(h.settings()?.name).toBe('Sprint 42')
  })

  it('patches defaultScale and projection reflects it', () => {
    const tShirt: Scale = { id: 't-shirt', cards: ['XS', 'S', 'M', 'L', 'XL'] }
    h.updateSettings({ defaultScale: tShirt })
    expect(h.settings()?.defaultScale.id).toBe('t-shirt')
  })

  it('patches hostParticipantId', () => {
    h.updateSettings({ hostParticipantId: 'p-joiner' })
    expect(h.settings()?.hostParticipantId).toBe('p-joiner')
  })
})

// ---------------------------------------------------------------------------

describe('DocService — upsertParticipant', () => {
  let h: DocServiceHarness

  beforeEach(() => {
    h = makeHarness()
    h.createSession(makeInit({ participantId: 'p-host', displayName: 'Host' }))
  })
  afterEach(() => { h.endSession() })

  it('adds a second participant', () => {
    h.upsertParticipant('p-joiner', { displayName: 'Joiner', joinedAt: NOW + 1 })
    expect(h.participants()).toHaveLength(2)
  })

  it('updates displayName of existing participant', () => {
    h.upsertParticipant('p-host', { displayName: 'New Name', joinedAt: NOW })
    const me = h.participants().find((p) => p.id === 'p-host')
    expect(me?.displayName).toBe('New Name')
  })

  it('sets role on participant', () => {
    h.upsertParticipant('p-joiner', { displayName: 'Joiner', joinedAt: NOW + 1, role: 'viewer' })
    const joiner = h.participants().find((p) => p.id === 'p-joiner')
    expect(joiner?.role).toBe('viewer')
  })

  it('participants sorted by joinedAt', () => {
    h.upsertParticipant('p-late', { displayName: 'Late', joinedAt: NOW + 1000 })
    h.upsertParticipant('p-early', { displayName: 'Early', joinedAt: NOW - 1 })
    const ids = h.participants().map((p) => p.id)
    expect(ids.indexOf('p-early')).toBeLessThan(ids.indexOf('p-host'))
  })
})

// ---------------------------------------------------------------------------

describe('DocService — startRound / castVote / clearVote / revealRound', () => {
  let h: DocServiceHarness
  let roundId: string

  beforeEach(() => {
    h = makeHarness()
    h.createSession(makeInit({ participantId: 'p-host' }))
    roundId = h.startRound({ now: () => NOW })
  })
  afterEach(() => { h.endSession() })

  it('round appears in rounds signal', () => {
    expect(h.rounds()).toHaveLength(1)
    expect(h.rounds()[0]?.id).toBe(roundId)
  })

  it('round has the correct scale', () => {
    expect(h.rounds()[0]?.scale.id).toBe('fibonacci')
  })

  it('round has timerStartedAt = createdAt', () => {
    const r = h.rounds()[0]!
    expect(r.timerStartedAt).toBe(NOW)
    expect(r.createdAt).toBe(NOW)
  })

  it('castVote adds vote to round', () => {
    h.castVote(roundId, 'p-host', '5')
    const votes = h.rounds()[0]?.votes
    expect(votes?.['p-host']).toBe('5')
  })

  it('castVote overwrites prior vote', () => {
    h.castVote(roundId, 'p-host', '5')
    h.castVote(roundId, 'p-host', '8')
    expect(h.rounds()[0]?.votes['p-host']).toBe('8')
  })

  it('clearVote removes the vote', () => {
    h.castVote(roundId, 'p-host', '5')
    h.clearVote(roundId, 'p-host')
    expect(h.rounds()[0]?.votes['p-host']).toBeUndefined()
  })

  it('revealRound sets revealedAt', () => {
    h.revealRound(roundId, NOW + 5000)
    expect(h.rounds()[0]?.revealedAt).toBe(NOW + 5000)
  })

  it('castVote is no-op after reveal', () => {
    h.revealRound(roundId, NOW + 5000)
    h.castVote(roundId, 'p-host', '13')
    // Vote must not appear after reveal
    expect(h.rounds()[0]?.votes['p-host']).toBeUndefined()
  })

  it('multiple rounds: startRound appends', () => {
    const r2 = h.startRound({ now: () => NOW + 1000 })
    expect(h.rounds()).toHaveLength(2)
    expect(h.rounds()[1]?.id).toBe(r2)
  })

  it('round with title stores it in projection', () => {
    const r2 = h.startRound({ title: 'Auth epic', now: () => NOW + 1000 })
    const found = h.rounds().find((r) => r.id === r2)
    expect(found?.title).toBe('Auth epic')
  })
})

// ---------------------------------------------------------------------------

describe('DocService — endSessionForEveryone', () => {
  let h: DocServiceHarness

  beforeEach(() => {
    h = makeHarness()
    h.createSession(makeInit())
  })
  afterEach(() => { if (h.hasSession()) h.endSession() })

  it('sets endingSessionLocally to true', () => {
    expect(h.endingSessionLocally()).toBe(false)
    h.endSessionForEveryone()
    expect(h.endingSessionLocally()).toBe(true)
  })

  it('writes sessionEndedAt to meta', () => {
    h.endSessionForEveryone()
    expect(h.meta()?.sessionEndedAt).toBeDefined()
    expect(typeof h.meta()?.sessionEndedAt).toBe('number')
  })

  it('sessionEndedAt is a recent timestamp', () => {
    const before = Date.now()
    h.endSessionForEveryone()
    const after = Date.now()
    const ts = h.meta()?.sessionEndedAt!
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('calling endSessionForEveryone twice produces valid timestamps', () => {
    h.endSessionForEveryone()
    const first = h.meta()?.sessionEndedAt
    h.endSessionForEveryone()
    // Second call updates the timestamp (LWW merge); both values are valid numbers
    expect(typeof h.meta()?.sessionEndedAt).toBe('number')
    // Value may equal or exceed first
    expect(h.meta()?.sessionEndedAt!).toBeGreaterThanOrEqual(first!)
  })

  it('remote peer sees sessionEndedAt after merge', () => {
    const remote = makeHarness()
    remote.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' })

    // Sync host doc into remote
    remote.mergeFrom(h.getDoc())

    // Host ends session
    h.endSessionForEveryone()

    // Merge host update into remote
    remote.mergeFrom(h.getDoc())

    expect(remote.meta()?.sessionEndedAt).toBeDefined()
    remote.endSession()
  })

  it('remote endingSessionLocally stays false when remote peer receives the update', () => {
    const remote = makeHarness()
    remote.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' })
    remote.mergeFrom(h.getDoc())

    // Remote harness did NOT call endSessionForEveryone() itself
    h.endSessionForEveryone()
    remote.mergeFrom(h.getDoc())

    expect(remote.endingSessionLocally()).toBe(false)
    remote.endSession()
  })
})

// ---------------------------------------------------------------------------

describe('DocService — projection signal updates reactively', () => {
  let h: DocServiceHarness

  beforeEach(() => {
    h = makeHarness()
    h.createSession(makeInit({ participantId: 'p-host', displayName: 'Host' }))
  })
  afterEach(() => { h.endSession() })

  it('computed participants() reflects upsert without manual rebuild', () => {
    expect(h.participants()).toHaveLength(1)
    h.upsertParticipant('p-2', { displayName: 'P2', joinedAt: NOW + 1 })
    expect(h.participants()).toHaveLength(2)
  })

  it('computed rounds() reflects startRound without manual rebuild', () => {
    expect(h.rounds()).toHaveLength(0)
    h.startRound({ now: () => NOW })
    expect(h.rounds()).toHaveLength(1)
  })

  it('computed settings() reflects patchSettings without manual rebuild', () => {
    h.updateSettings({ name: 'My Session' })
    expect(h.settings()?.name).toBe('My Session')
  })

  it('rounds() signal value updates synchronously after each startRound', () => {
    expect(h.rounds().length).toBe(0)
    h.startRound({ now: () => NOW })
    expect(h.rounds().length).toBe(1)
    h.startRound({ now: () => NOW + 1 })
    expect(h.rounds().length).toBe(2)
  })
})

// ---------------------------------------------------------------------------

describe('DocService — multi-peer merge via Y.Doc', () => {
  let host: DocServiceHarness
  let joiner: DocServiceHarness

  beforeEach(() => {
    host = makeHarness()
    joiner = makeHarness()
    host.createSession(makeInit({ participantId: 'p-host', roomUuid: 'room-peer' }))
    joiner.joinSession({ participantId: 'p-joiner', displayName: 'Joiner' })
    // Sync initial state
    joiner.mergeFrom(host.getDoc())
    host.mergeFrom(joiner.getDoc())
  })

  afterEach(() => {
    host.endSession()
    joiner.endSession()
  })

  it('joiner sees host meta after merge', () => {
    expect(joiner.meta()?.roomUuid).toBe('room-peer')
  })

  it('joiner sees host participant', () => {
    const ids = joiner.participants().map((p) => p.id)
    expect(ids).toContain('p-host')
  })

  it('host sees joiner participant after merge', () => {
    const ids = host.participants().map((p) => p.id)
    expect(ids).toContain('p-joiner')
  })

  it('vote from host propagates to joiner', () => {
    const roundId = host.startRound({ now: () => NOW })
    joiner.mergeFrom(host.getDoc())

    host.castVote(roundId, 'p-host', '5')
    joiner.mergeFrom(host.getDoc())

    const r = joiner.rounds().find((r: Round) => r.id === roundId)
    expect(r?.votes['p-host']).toBe('5')
  })

  it('reveal from host propagates to joiner', () => {
    const roundId = host.startRound({ now: () => NOW })
    joiner.mergeFrom(host.getDoc())

    host.revealRound(roundId, NOW + 2000)
    joiner.mergeFrom(host.getDoc())

    const r = joiner.rounds().find((r: Round) => r.id === roundId)
    expect(r?.revealedAt).toBe(NOW + 2000)
  })
})
