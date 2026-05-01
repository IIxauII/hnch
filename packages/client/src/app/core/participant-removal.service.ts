import { effect, inject, Injectable } from '@angular/core'
import { Router } from '@angular/router'

import { DocService } from './doc/doc.service'
import { LastSessionService } from './last-session.service'
import { ParticipantIdService } from './participant-id.service'
import { ToastService } from '../services/toast.service'

/**
 * Observes the local participant's own record for a kick written by the
 * host (ADR-0036). When `leftAt` is set and `removedBy !== selfId`, the
 * participant was kicked — show a toast, clear the last-session cache, and
 * navigate Home. Mirrors `SessionEndService`'s observer/idempotency pattern.
 *
 * Voluntary leaves (`removedBy === selfId`) are handled by the Leave flow
 * in LobbyPage / EstimatingPage and do not trigger here.
 *
 * Eager-instantiated via `AppComponent`. No-ops when no session is active.
 */
@Injectable({ providedIn: 'root' })
export class ParticipantRemovalService {
  private readonly docService = inject(DocService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly lastSession = inject(LastSessionService)
  private readonly router = inject(Router)
  private readonly toastService = inject(ToastService)

  /** The last `leftAt` value we acted on — prevents double-fire. */
  private handledAt: number | null = null

  /**
   * Previous `leftAt` value from the last effect run, using a sentinel
   * to distinguish "never observed" from "observed as undefined".
   *
   * - `'unset'` — the effect has never run for this session (or reset after endSession).
   * - `undefined` — last emission had `leftAt === undefined` (no kick recorded).
   * - `number` — last emission had `leftAt` set to this timestamp.
   *
   * Only a transition from `undefined` to `number` is treated as a kick.
   * A stale `leftAt` present on the *first* observation (sentinel still
   * `'unset'`) is silently recorded and skipped so IDB-loaded prior-session
   * records don't fire the kick handler.
   */
  private prevLeftAt: number | undefined | 'unset' = 'unset'

  constructor() {
    effect(() => {
      if (!this.docService.hasSession()) {
        this.handledAt = null
        this.prevLeftAt = 'unset'
        return
      }

      const selfId = this.participantIdService.id()
      if (!selfId) return

      const me = this.docService.participants().find((p) => p.id === selfId)
      if (!me) return

      const { leftAt, removedBy } = me

      if (leftAt === undefined) {
        this.prevLeftAt = undefined
        this.handledAt = null
        return
      }

      // Voluntary leave — lobby handles its own teardown.
      if (removedBy === selfId) {
        this.prevLeftAt = leftAt
        return
      }

      // First-sync gate (ADR-0036 §6 rejoin race fix): any `leftAt` observed
      // before the relay's first sync completes arrived via the snapshot apply,
      // not via a live host kick on this connection. Record the value so the
      // transition tracker stays current, but do NOT fire handleKick.
      if (!this.docService.hasFirstSyncCompleted()) {
        this.prevLeftAt = leftAt
        return
      }

      // Stale-rejoin guard: if this is the first observation (prevLeftAt === 'unset')
      // and leftAt is already set, treat it as a pre-existing stale value — record
      // and skip. Only a real undefined → defined transition should fire.
      if (this.prevLeftAt === 'unset') {
        this.prevLeftAt = leftAt
        return
      }

      // If leftAt was already set in the prior emission, don't re-fire.
      if (this.prevLeftAt !== undefined) {
        this.prevLeftAt = leftAt
        return
      }

      // Transition: undefined → defined. This is a genuine kick.
      this.prevLeftAt = leftAt

      // Already handled this kick (double-fire guard).
      if (leftAt === this.handledAt) return

      this.handledAt = leftAt
      void this.handleKick()
    })
  }

  private async handleKick(): Promise<void> {
    if (!this.docService.hasSession()) return

    this.docService.endSession()

    try {
      await this.lastSession.clear()
    } catch (err) {
      console.warn('Failed to clear lastSession cache:', err)
    }

    await this.toastService.info('Removed by host')

    await this.router.navigate(['/home'])
  }
}
