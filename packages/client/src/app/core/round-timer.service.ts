import { effect, inject, Injectable, type Signal, computed } from '@angular/core'

import { DocService } from './doc/doc.service'
import { ParticipantIdService } from './participant-id.service'
import { TimerTickService } from './timer-tick.service'

/**
 * Grace period before a non-host client writes `revealedAt` as an
 * idempotent fallback. Gives the host's tick a chance to fire first;
 * Yjs merges concurrent writes harmlessly if both happen.
 */
export const HOST_EXPIRY_FALLBACK_GRACE_MS = 2_000

/**
 * Watches the current round's timer and writes `revealedAt` at expiry.
 *
 * - If the local client is the host, it writes immediately when
 *   `remaining <= 0`.
 * - If the local client is *not* the host, it waits an additional
 *   {@link HOST_EXPIRY_FALLBACK_GRACE_MS} before writing as a fallback
 *   (in case the host was offline or backgrounded at expiry).
 *
 * The service no-ops when no session is live or when `revealMode` is
 * not `'timer'`. A `Set<string>` of already-processed round ids
 * prevents re-firing across ticks.
 */
@Injectable({ providedIn: 'root' })
export class RoundTimerService {
  private readonly docService = inject(DocService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly timerTick = inject(TimerTickService)

  /** Round ids for which we've already requested a reveal. */
  private readonly revealedRoundIds = new Set<string>()

  /** Pending fallback timeout handle for non-host clients. */
  private fallbackTimeout: ReturnType<typeof setTimeout> | null = null
  private fallbackRoundId: string | null = null

  private readonly isHost: Signal<boolean> = computed(() => {
    const myId = this.participantIdService.id()
    const hostId = this.docService.settings()?.hostParticipantId
    return !!myId && !!hostId && myId === hostId
  })

  constructor() {
    effect(() => {
      this.evaluate()
    })
  }

  private evaluate(): void {
    if (!this.docService.hasSession()) return

    const settings = this.docService.settings()
    if (!settings || settings.revealMode !== 'timer') return

    const round = this.docService.currentRound()
    if (!round || round.timerStartedAt === undefined) return
    if (round.revealedAt !== undefined) return

    const duration = settings.timerDurationMs
    if (duration === undefined || duration <= 0) return

    // Already handled this round.
    if (this.revealedRoundIds.has(round.id)) return

    const now = this.timerTick.now()
    const remaining = round.timerStartedAt + duration - now

    if (remaining > 0) {
      // Timer still running — cancel any stale fallback from a
      // previous round.
      this.cancelFallback()
      return
    }

    // Timer has expired and revealedAt is not yet set.
    if (this.isHost()) {
      this.revealedRoundIds.add(round.id)
      this.cancelFallback()
      this.docService.revealRound(round.id)
      return
    }

    // Non-host: schedule a fallback reveal after the grace period.
    if (this.fallbackRoundId !== round.id) {
      this.cancelFallback()
      this.fallbackRoundId = round.id
      this.fallbackTimeout = setTimeout(() => {
        this.fallbackTimeout = null
        this.fallbackRoundId = null
        // Re-check: the host may have written revealedAt during grace.
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
}
