/**
 * ParticipantRemovalService unit tests (ADR-0036).
 *
 * Uses Angular TestBed so the real service (including its effect() wiring)
 * is exercised. Each scenario mutates the DocService signal mock and then
 * flushes effects + microtasks to observe the side-effects.
 */

import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { signal } from '@angular/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ionic/angular/standalone', () => ({}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

import { ParticipantRemovalService } from './participant-removal.service'
import { DocService } from './doc/doc.service'
import { LastSessionService } from './last-session.service'
import { ParticipantIdService } from './participant-id.service'
import { ToastService } from '../services/toast.service'

// ---------------------------------------------------------------------------
// Types + helpers
// ---------------------------------------------------------------------------

interface ParticipantLike {
  id: string
  displayName: string
  joinedAt: number
  leftAt?: number
  removedBy?: string
}

function makeDocMock(selfId: string) {
  const participantsSignal = signal<ParticipantLike[]>([])
  const hasSessionSignal = signal(true)
  const hasFirstSyncCompletedSignal = signal(true)

  return {
    participants: participantsSignal.asReadonly(),
    _participantsSignal: participantsSignal,
    hasSession: hasSessionSignal.asReadonly(),
    _hasSessionSignal: hasSessionSignal,
    hasFirstSyncCompleted: hasFirstSyncCompletedSignal.asReadonly(),
    _hasFirstSyncCompletedSignal: hasFirstSyncCompletedSignal,
    endSession: vi.fn(),
  }
}

/** Flush Angular effects and drain the microtask queue. */
async function flushAll(): Promise<void> {
  TestBed.flushEffects()
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
  }
}

const SELF_ID = 'device-self'
const NOW = 1_700_000_000_000

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ParticipantRemovalService', () => {
  let docMock: ReturnType<typeof makeDocMock>
  let lastSessionMock: { clear: ReturnType<typeof vi.fn> }
  let toastMock: { info: ReturnType<typeof vi.fn> }
  let routerMock: { navigate: ReturnType<typeof vi.fn> }

  function setup() {
    TestBed.inject(ParticipantRemovalService)
    // ensure the initial effect run with no record sees nothing
    docMock._participantsSignal.set([
      { id: SELF_ID, displayName: 'Me', joinedAt: NOW },
    ])
    TestBed.flushEffects()
  }

  beforeEach(() => {
    docMock = makeDocMock(SELF_ID)
    lastSessionMock = { clear: vi.fn(async () => {}) }
    toastMock = { info: vi.fn(async () => {}) }
    routerMock = { navigate: vi.fn(async () => true) }

    TestBed.configureTestingModule({
      providers: [
        ParticipantRemovalService,
        { provide: DocService, useValue: docMock },
        { provide: LastSessionService, useValue: lastSessionMock },
        {
          provide: ParticipantIdService,
          useValue: { id: () => SELF_ID },
        },
        { provide: ToastService, useValue: toastMock },
        { provide: Router, useValue: routerMock },
      ],
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    vi.clearAllMocks()
  })

  it('kick (leftAt set, removedBy !== self) triggers toast + nav + endSession exactly once', async () => {
    setup()

    // Host kicks us
    docMock._participantsSignal.set([
      { id: SELF_ID, displayName: 'Me', joinedAt: NOW, leftAt: NOW + 1, removedBy: 'host-1' },
    ])

    await flushAll()

    expect(docMock.endSession).toHaveBeenCalledOnce()
    expect(lastSessionMock.clear).toHaveBeenCalledOnce()
    expect(toastMock.info).toHaveBeenCalledOnce()
    expect(toastMock.info).toHaveBeenCalledWith('Removed by host')
    expect(routerMock.navigate).toHaveBeenCalledOnce()
    expect(routerMock.navigate).toHaveBeenCalledWith(['/home'])
  })

  it('voluntary leave (removedBy === self) does NOT trigger kick handler', async () => {
    setup()

    docMock._participantsSignal.set([
      { id: SELF_ID, displayName: 'Me', joinedAt: NOW, leftAt: NOW + 1, removedBy: SELF_ID },
    ])

    await flushAll()

    expect(docMock.endSession).not.toHaveBeenCalled()
    expect(toastMock.info).not.toHaveBeenCalled()
    expect(routerMock.navigate).not.toHaveBeenCalled()
  })

  it('double-fire guard: same leftAt value observed twice fires handler once', async () => {
    setup()

    const kicked: ParticipantLike = {
      id: SELF_ID, displayName: 'Me', joinedAt: NOW, leftAt: NOW + 1, removedBy: 'host-1',
    }

    docMock._participantsSignal.set([kicked])
    await flushAll()

    // Same signal value again (simulate spurious re-emission)
    docMock._participantsSignal.set([{ ...kicked }])
    await flushAll()

    expect(docMock.endSession).toHaveBeenCalledOnce()
    expect(toastMock.info).toHaveBeenCalledOnce()
  })

  it('stale-rejoin guard: leftAt already set at subscription time does NOT fire', async () => {
    // Simulate IDB loading a prior-session record that already has leftAt set
    // when the service first sees it — must not trigger the kick handler.
    docMock._participantsSignal.set([
      { id: SELF_ID, displayName: 'Me', joinedAt: NOW, leftAt: NOW - 1000, removedBy: 'host-1' },
    ])

    // Instantiate the service — effect runs immediately with leftAt already set
    TestBed.inject(ParticipantRemovalService)
    await flushAll()

    expect(docMock.endSession).not.toHaveBeenCalled()
    expect(toastMock.info).not.toHaveBeenCalled()
    expect(routerMock.navigate).not.toHaveBeenCalled()
  })

  it('no-op when hasSession is false', async () => {
    docMock._hasSessionSignal.set(false)
    TestBed.inject(ParticipantRemovalService)
    await flushAll()

    expect(docMock.endSession).not.toHaveBeenCalled()
    expect(toastMock.info).not.toHaveBeenCalled()
  })

  it('first-sync gate: leftAt transition before sync completes does NOT fire kick handler', async () => {
    // Simulate the rejoin race: hasFirstSyncCompleted is false (snapshot still applying)
    docMock._hasFirstSyncCompletedSignal.set(false)
    setup()

    // Snapshot apply brings in a prior-kick leftAt
    docMock._participantsSignal.set([
      { id: SELF_ID, displayName: 'Me', joinedAt: NOW, leftAt: NOW + 1, removedBy: 'host-1' },
    ])

    await flushAll()

    expect(docMock.endSession).not.toHaveBeenCalled()
    expect(toastMock.info).not.toHaveBeenCalled()
    expect(routerMock.navigate).not.toHaveBeenCalled()
  })

  it('first-sync gate: kick fires after sync completes and a fresh undefined→number transition', async () => {
    // Start with sync not yet complete
    docMock._hasFirstSyncCompletedSignal.set(false)
    setup()

    // Snapshot apply — stale leftAt arrives; gate suppresses it
    docMock._participantsSignal.set([
      { id: SELF_ID, displayName: 'Me', joinedAt: NOW, leftAt: NOW - 500, removedBy: 'host-1' },
    ])
    await flushAll()

    // clearOwnLeftStatus fires — participant is now active again
    docMock._participantsSignal.set([
      { id: SELF_ID, displayName: 'Me', joinedAt: NOW },
    ])
    await flushAll()

    // Sync complete — gate opens
    docMock._hasFirstSyncCompletedSignal.set(true)
    await flushAll()

    // Live kick arrives now (undefined → defined after sync)
    docMock._participantsSignal.set([
      { id: SELF_ID, displayName: 'Me', joinedAt: NOW, leftAt: NOW + 1000, removedBy: 'host-1' },
    ])
    await flushAll()

    expect(docMock.endSession).toHaveBeenCalledOnce()
    expect(toastMock.info).toHaveBeenCalledWith('Removed by host')
    expect(routerMock.navigate).toHaveBeenCalledWith(['/home'])
  })
})
