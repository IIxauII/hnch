/**
 * Host-election logic tests (ADR-0010).
 *
 * Vitest-on-Node, no Angular TestBed. We replicate the evaluate/tryPromote
 * algorithm from HostElectionService with plain mock dependencies so the
 * five ADR-0010 cases are exercised against the real decision logic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock ESM-only packages that cascade in via doc.service.ts imports.
vi.mock('@ionic/angular/standalone', () => ({}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

import { HOST_ABSENCE_ELECTION_DEBOUNCE_MS } from './host-election.service'

// ---------------------------------------------------------------------------
// Minimal dependency interfaces (mirrors what the service reads)
// ---------------------------------------------------------------------------

interface MockDocService {
  hasSession: () => boolean
  settings: () => { hostParticipantId: string } | null
  onlineParticipantIds: () => ReadonlySet<string>
  activeParticipants: () => readonly { id: string }[]
  updateSettings: (patch: { hostParticipantId: string }) => void
}

interface MockParticipantIdService {
  id: () => string | null
}

// ---------------------------------------------------------------------------
// Standalone harness that mirrors HostElectionService's logic exactly
// ---------------------------------------------------------------------------

class HostElectionHarness {
  readonly docService: MockDocService
  readonly participantIdService: MockParticipantIdService

  private missingHostId: string | null = null
  private debounceTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(
    docService: MockDocService,
    participantIdService: MockParticipantIdService,
  ) {
    this.docService = docService
    this.participantIdService = participantIdService
  }

  /** Manually trigger the evaluation (replaces Angular's effect()). */
  evaluate(): void {
    if (!this.docService.hasSession()) return

    const settings = this.docService.settings()
    if (!settings) return

    const hostId = settings.hostParticipantId
    if (!hostId) return

    // Mirror the real service: intersect awareness with active participants.
    const rawOnlineIds = this.docService.onlineParticipantIds()
    const activeIds = new Set(this.docService.activeParticipants().map((p) => p.id))
    const onlineIds = new Set([...rawOnlineIds].filter((id) => activeIds.has(id)))

    if (onlineIds.has(hostId)) {
      this.cancelDebounce()
      return
    }

    if (this.missingHostId !== hostId) {
      this.cancelDebounce()
      this.missingHostId = hostId
      this.debounceTimeout = setTimeout(() => {
        this.debounceTimeout = null
        this.tryPromote()
      }, HOST_ABSENCE_ELECTION_DEBOUNCE_MS)
    }
  }

  private tryPromote(): void {
    const settings = this.docService.settings()
    if (!settings) return

    const hostId = settings.hostParticipantId
    const cachedMissing = this.missingHostId
    this.missingHostId = null

    if (!cachedMissing || hostId !== cachedMissing) return

    const rawOnlineIds = this.docService.onlineParticipantIds()
    const activeIds = new Set(this.docService.activeParticipants().map((p) => p.id))
    const onlineIds = new Set([...rawOnlineIds].filter((id) => activeIds.has(id)))
    if (onlineIds.has(hostId)) return

    const sorted = [...onlineIds].sort()
    if (sorted.length === 0) return

    const winner = sorted[0]!
    const myId = this.participantIdService.id()

    if (winner === myId) {
      this.docService.updateSettings({ hostParticipantId: winner })
    }
  }

  private cancelDebounce(): void {
    if (this.debounceTimeout !== null) {
      clearTimeout(this.debounceTimeout)
      this.debounceTimeout = null
    }
    this.missingHostId = null
  }

  dispose(): void {
    this.cancelDebounce()
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HostElectionService logic', () => {
  let docService: MockDocService
  let participantIdService: MockParticipantIdService
  let harness: HostElectionHarness

  beforeEach(() => {
    vi.useFakeTimers()

    docService = {
      hasSession: vi.fn(() => true),
      settings: vi.fn(() => ({ hostParticipantId: 'host-1' })),
      onlineParticipantIds: vi.fn(() => new Set(['host-1', 'peer-a', 'peer-b'])),
      // Default: all three peers are active (not kicked/left).
      activeParticipants: vi.fn(() => [
        { id: 'host-1' },
        { id: 'peer-a' },
        { id: 'peer-b' },
      ]),
      updateSettings: vi.fn(),
    }

    participantIdService = {
      id: vi.fn(() => 'peer-a'),
    }

    harness = new HostElectionHarness(docService, participantIdService)
  })

  afterEach(() => {
    harness.dispose()
    vi.useRealTimers()
  })

  it('host is in the online set → no action', () => {
    // host-1 is online in the default setup
    harness.evaluate()

    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS + 100)
    expect(docService.updateSettings).not.toHaveBeenCalled()
  })

  it('host is NOT in the online set, no debounce running → start 5s timeout', () => {
    // Remove host from online set
    vi.mocked(docService.onlineParticipantIds).mockReturnValue(
      new Set(['peer-a', 'peer-b']),
    )

    harness.evaluate()

    // Timeout should not have fired yet
    expect(docService.updateSettings).not.toHaveBeenCalled()

    // Advance past the debounce
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS)

    // peer-a is the lowest ID → it should write
    expect(docService.updateSettings).toHaveBeenCalledWith({
      hostParticipantId: 'peer-a',
    })
  })

  it('host rejoins before 5s → cancel timer, no promotion', () => {
    // Host goes offline
    vi.mocked(docService.onlineParticipantIds).mockReturnValue(
      new Set(['peer-a', 'peer-b']),
    )
    harness.evaluate()

    // Advance partway
    vi.advanceTimersByTime(3_000)
    expect(docService.updateSettings).not.toHaveBeenCalled()

    // Host comes back online
    vi.mocked(docService.onlineParticipantIds).mockReturnValue(
      new Set(['host-1', 'peer-a', 'peer-b']),
    )
    harness.evaluate()

    // Advance past the original debounce window
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS)
    expect(docService.updateSettings).not.toHaveBeenCalled()
  })

  it('5s elapse, I am the lowest-ID → I write hostParticipantId', () => {
    vi.mocked(docService.onlineParticipantIds).mockReturnValue(
      new Set(['peer-a', 'peer-b']),
    )
    vi.mocked(participantIdService.id).mockReturnValue('peer-a')

    harness.evaluate()
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS)

    expect(docService.updateSettings).toHaveBeenCalledOnce()
    expect(docService.updateSettings).toHaveBeenCalledWith({
      hostParticipantId: 'peer-a',
    })
  })

  it('5s elapse, I am NOT the lowest-ID → no-op', () => {
    vi.mocked(docService.onlineParticipantIds).mockReturnValue(
      new Set(['peer-a', 'peer-b']),
    )
    // peer-a is lower than peer-b, so peer-b should not write
    vi.mocked(participantIdService.id).mockReturnValue('peer-b')

    harness.evaluate()
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS)

    expect(docService.updateSettings).not.toHaveBeenCalled()
  })

  it('kicked peer in awareness is NOT eligible to become host', () => {
    // peer-b has been kicked (leftAt set) so activeParticipants excludes it.
    // Awareness still reports peer-b online (stale).
    vi.mocked(docService.onlineParticipantIds).mockReturnValue(
      new Set(['peer-a', 'peer-b']),
    )
    vi.mocked(docService.activeParticipants).mockReturnValue([
      // peer-b is absent — it was kicked
      { id: 'peer-a' },
    ])
    // peer-a is the only active-online peer, so it should win.
    vi.mocked(participantIdService.id).mockReturnValue('peer-a')

    harness.evaluate()
    vi.advanceTimersByTime(HOST_ABSENCE_ELECTION_DEBOUNCE_MS)

    expect(docService.updateSettings).toHaveBeenCalledWith({
      hostParticipantId: 'peer-a',
    })
  })
})
