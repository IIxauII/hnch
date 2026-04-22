import { effect, inject, Injectable } from '@angular/core'

import { DocService } from './doc/doc.service'
import { ParticipantIdService } from './participant-id.service'

/**
 * Debounce before promoting a new host after the current one drops from
 * awareness. Matches ADR-0010's 5-second window — long enough to absorb
 * transient WebSocket reconnects, short enough that the session doesn't
 * feel leaderless.
 *
 * Intentionally separate from `DISCONNECTED_WARNING_DELAY_MS` in the
 * connection chip — they're semantically different timers that happen
 * to share a value.
 */
export const HOST_ABSENCE_ELECTION_DEBOUNCE_MS = 5_000

/**
 * Host-election state machine (ADR-0010).
 *
 * When the current `settings.hostParticipantId` vanishes from awareness,
 * this service starts a 5 s debounce. If the host is still absent after
 * the debounce, the lexicographically-lowest online participantId wins.
 * If the winner is *this* client, it writes the promotion to the doc;
 * otherwise it no-ops (the winning peer handles it).
 *
 * Reconnection by the prior host does **not** reclaim the role — the
 * algorithm only ever writes forward, never restores.
 *
 * The service is `providedIn: 'root'` and no-ops when no session is
 * live. Eager-instantiated via `AppComponent`.
 */
@Injectable({ providedIn: 'root' })
export class HostElectionService {
  private readonly docService = inject(DocService)
  private readonly participantIdService = inject(ParticipantIdService)

  /** The host ID that triggered the current debounce, or `null`. */
  private missingHostId: string | null = null
  private debounceTimeout: ReturnType<typeof setTimeout> | null = null

  constructor() {
    effect(() => {
      this.evaluate()
    })
  }

  private evaluate(): void {
    if (!this.docService.hasSession()) return

    const settings = this.docService.settings()
    if (!settings) return

    const hostId = settings.hostParticipantId
    if (!hostId) return

    const onlineIds = this.docService.onlineParticipantIds()
    const myId = this.participantIdService.id()

    // 1. Host is online → no action, cancel any pending debounce.
    if (onlineIds.has(hostId)) {
      this.cancelDebounce()
      return
    }

    // 2. Host is offline and no debounce is running → start one.
    //    Also restart if a *different* host went missing (edge case:
    //    host changed while the previous debounce was in flight).
    if (this.missingHostId !== hostId) {
      this.cancelDebounce()
      this.missingHostId = hostId
      this.debounceTimeout = setTimeout(() => {
        this.debounceTimeout = null
        this.tryPromote()
      }, HOST_ABSENCE_ELECTION_DEBOUNCE_MS)
    }
    // 3. If the same missing host is already being debounced, let the
    //    timeout run — nothing to do here.
  }

  private tryPromote(): void {
    const settings = this.docService.settings()
    if (!settings) return

    const hostId = settings.hostParticipantId
    const cachedMissing = this.missingHostId
    this.missingHostId = null

    // Guard: the host we started debouncing for must still be the
    // current host and must still be offline.
    if (!cachedMissing || hostId !== cachedMissing) return

    const onlineIds = this.docService.onlineParticipantIds()
    if (onlineIds.has(hostId)) return

    // Compute the winner: lexicographically lowest online participantId.
    const sorted = [...onlineIds].sort()
    if (sorted.length === 0) return

    const winner = sorted[0]!
    const myId = this.participantIdService.id()

    // Only the winner writes — other clients see the doc update and
    // stand down. If two clients compute different winners (awareness
    // drift), Yjs merges deterministically; the loser re-reads and
    // stands down (ADR-0010 §Consequences).
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
}
