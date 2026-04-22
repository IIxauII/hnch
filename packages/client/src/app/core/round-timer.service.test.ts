/**
 * Round-timer logic tests (ADR-0011, ADR-0015).
 *
 * Vitest-on-Node, no Angular TestBed. We replicate the evaluate logic
 * from RoundTimerService with plain mock dependencies. Exercises:
 *   - Host writes revealedAt at expiry
 *   - Non-host fallback writes after HOST_EXPIRY_FALLBACK_GRACE_MS
 *   - Concurrent writes merge (both write, one value sticks)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HOST_EXPIRY_FALLBACK_GRACE_MS } from './round-timer.service'

// ---------------------------------------------------------------------------
// Minimal dependency interfaces
// ---------------------------------------------------------------------------

interface MockRound {
  id: string
  timerStartedAt?: number
  revealedAt?: number
}

interface MockSettings {
  revealMode: string
  timerDurationMs?: number
  hostParticipantId?: string
}

interface MockDocService {
  hasSession: () => boolean
  settings: () => MockSettings | null
  currentRound: () => MockRound | null
  revealRound: (roundId: string) => void
}

interface MockParticipantIdService {
  id: () => string | null
}

interface MockTimerTick {
  now: () => number
}

// ---------------------------------------------------------------------------
// Standalone harness that mirrors RoundTimerService's logic exactly
// ---------------------------------------------------------------------------

class RoundTimerHarness {
  readonly docService: MockDocService
  readonly participantIdService: MockParticipantIdService
  readonly timerTick: MockTimerTick

  private readonly revealedRoundIds = new Set<string>()
  private fallbackTimeout: ReturnType<typeof setTimeout> | null = null
  private fallbackRoundId: string | null = null

  constructor(
    docService: MockDocService,
    participantIdService: MockParticipantIdService,
    timerTick: MockTimerTick,
  ) {
    this.docService = docService
    this.participantIdService = participantIdService
    this.timerTick = timerTick
  }

  private get isHost(): boolean {
    const myId = this.participantIdService.id()
    const hostId = this.docService.settings()?.hostParticipantId
    return !!myId && !!hostId && myId === hostId
  }

  evaluate(): void {
    if (!this.docService.hasSession()) return

    const settings = this.docService.settings()
    if (!settings || settings.revealMode !== 'timer') return

    const round = this.docService.currentRound()
    if (!round || round.timerStartedAt === undefined) return
    if (round.revealedAt !== undefined) return

    const duration = settings.timerDurationMs
    if (duration === undefined || duration <= 0) return

    if (this.revealedRoundIds.has(round.id)) return

    const now = this.timerTick.now()
    const remaining = round.timerStartedAt + duration - now

    if (remaining > 0) {
      this.cancelFallback()
      return
    }

    if (this.isHost) {
      this.revealedRoundIds.add(round.id)
      this.cancelFallback()
      this.docService.revealRound(round.id)
      return
    }

    if (this.fallbackRoundId !== round.id) {
      this.cancelFallback()
      this.fallbackRoundId = round.id
      this.fallbackTimeout = setTimeout(() => {
        this.fallbackTimeout = null
        this.fallbackRoundId = null
        const currentRound = this.docService.currentRound()
        if (
          currentRound &&
          currentRound.id === round.id &&
          currentRound.revealedAt === undefined &&
          !this.revealedRoundIds.has(round.id)
        ) {
          this.revealedRoundIds.add(round.id)
          this.docService.revealRound(round.id)
        }
      }, HOST_EXPIRY_FALLBACK_GRACE_MS)
    }
  }

  private cancelFallback(): void {
    if (this.fallbackTimeout !== null) {
      clearTimeout(this.fallbackTimeout)
      this.fallbackTimeout = null
      this.fallbackRoundId = null
    }
  }

  dispose(): void {
    this.cancelFallback()
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoundTimerService logic', () => {
  const TIMER_DURATION = 30_000
  const TIMER_START = 1_000_000

  let docService: MockDocService
  let participantIdService: MockParticipantIdService
  let timerTick: MockTimerTick
  let harness: RoundTimerHarness

  beforeEach(() => {
    vi.useFakeTimers()

    docService = {
      hasSession: vi.fn(() => true),
      settings: vi.fn(() => ({
        revealMode: 'timer',
        timerDurationMs: TIMER_DURATION,
        hostParticipantId: 'host-1',
      })),
      currentRound: vi.fn(() => ({
        id: 'round-1',
        timerStartedAt: TIMER_START,
      })),
      revealRound: vi.fn(),
    }

    participantIdService = {
      id: vi.fn(() => 'host-1'), // default: this client is the host
    }

    timerTick = {
      now: vi.fn(() => TIMER_START), // timer just started
    }

    harness = new RoundTimerHarness(docService, participantIdService, timerTick)
  })

  afterEach(() => {
    harness.dispose()
    vi.useRealTimers()
  })

  it('host writes revealedAt immediately at expiry', () => {
    // Timer still running → no reveal
    vi.mocked(timerTick.now).mockReturnValue(TIMER_START + TIMER_DURATION - 1)
    harness.evaluate()
    expect(docService.revealRound).not.toHaveBeenCalled()

    // Timer just expired → host reveals
    vi.mocked(timerTick.now).mockReturnValue(TIMER_START + TIMER_DURATION)
    harness.evaluate()
    expect(docService.revealRound).toHaveBeenCalledOnce()
    expect(docService.revealRound).toHaveBeenCalledWith('round-1')
  })

  it('non-host writes revealedAt after HOST_EXPIRY_FALLBACK_GRACE_MS fallback', () => {
    // This client is NOT the host
    vi.mocked(participantIdService.id).mockReturnValue('peer-a')

    // Timer expired
    vi.mocked(timerTick.now).mockReturnValue(TIMER_START + TIMER_DURATION)
    harness.evaluate()

    // Not yet — still in fallback grace period
    expect(docService.revealRound).not.toHaveBeenCalled()

    // Advance past the grace period
    vi.advanceTimersByTime(HOST_EXPIRY_FALLBACK_GRACE_MS)

    expect(docService.revealRound).toHaveBeenCalledOnce()
    expect(docService.revealRound).toHaveBeenCalledWith('round-1')
  })

  it('non-host fallback is suppressed if host reveals during grace period', () => {
    // This client is NOT the host
    vi.mocked(participantIdService.id).mockReturnValue('peer-a')

    // Timer expired
    vi.mocked(timerTick.now).mockReturnValue(TIMER_START + TIMER_DURATION)
    harness.evaluate()

    expect(docService.revealRound).not.toHaveBeenCalled()

    // Simulate host having written revealedAt during the grace period
    vi.mocked(docService.currentRound).mockReturnValue({
      id: 'round-1',
      timerStartedAt: TIMER_START,
      revealedAt: TIMER_START + TIMER_DURATION + 100,
    })

    // Advance past the grace period
    vi.advanceTimersByTime(HOST_EXPIRY_FALLBACK_GRACE_MS)

    // The fallback check re-reads currentRound and sees revealedAt is set
    expect(docService.revealRound).not.toHaveBeenCalled()
  })

  it('concurrent writes: both host and non-host fire, only one call matters', () => {
    // Scenario: two separate harnesses (host + non-host) both evaluate
    // after timer expiry. The host writes immediately; the non-host
    // writes after the grace period. In the real system, Yjs merges
    // them; here we verify both code paths fire.

    // Host harness
    vi.mocked(participantIdService.id).mockReturnValue('host-1')
    vi.mocked(timerTick.now).mockReturnValue(TIMER_START + TIMER_DURATION)

    const hostHarness = new RoundTimerHarness(
      docService,
      participantIdService,
      timerTick,
    )
    hostHarness.evaluate()
    expect(docService.revealRound).toHaveBeenCalledOnce()

    // Non-host harness (separate instance, separate revealedRoundIds)
    const nonHostParticipant: MockParticipantIdService = {
      id: vi.fn(() => 'peer-a'),
    }
    const nonHostHarness = new RoundTimerHarness(
      docService,
      nonHostParticipant,
      timerTick,
    )
    nonHostHarness.evaluate()

    // Grace period elapses — non-host also fires (round not yet marked
    // revealed in its local view; in production Yjs merges idempotently)
    vi.advanceTimersByTime(HOST_EXPIRY_FALLBACK_GRACE_MS)
    expect(docService.revealRound).toHaveBeenCalledTimes(2)

    hostHarness.dispose()
    nonHostHarness.dispose()
  })

  it('does not double-reveal the same round', () => {
    vi.mocked(timerTick.now).mockReturnValue(TIMER_START + TIMER_DURATION)

    harness.evaluate()
    expect(docService.revealRound).toHaveBeenCalledOnce()

    // Evaluate again for the same round
    harness.evaluate()
    expect(docService.revealRound).toHaveBeenCalledOnce()
  })

  it('no-ops when revealMode is not timer', () => {
    vi.mocked(docService.settings).mockReturnValue({
      revealMode: 'manual',
      timerDurationMs: TIMER_DURATION,
      hostParticipantId: 'host-1',
    })
    vi.mocked(timerTick.now).mockReturnValue(TIMER_START + TIMER_DURATION)

    harness.evaluate()
    expect(docService.revealRound).not.toHaveBeenCalled()
  })
})
