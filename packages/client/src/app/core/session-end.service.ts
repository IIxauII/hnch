import { effect, inject, Injectable } from '@angular/core'
import { Router } from '@angular/router'
import { ToastController } from '@ionic/angular/standalone'

import { DocService } from './doc/doc.service'

/**
 * Observes `meta.sessionEndedAt` and handles both sides of the
 * "End session for everyone" flow (ux.md §4.5):
 *
 * - Local trigger (`endSessionForEveryone()` just called): show "Session
 *   ended." toast, navigate to Home, tear down.
 * - Remote trigger (peer wrote `sessionEndedAt`): show "Session ended by
 *   [name]" toast, navigate to Home, tear down.
 *
 * Eager-instantiated via `AppComponent`. No-ops when no session is live.
 */
@Injectable({ providedIn: 'root' })
export class SessionEndService {
  private readonly docService = inject(DocService)
  private readonly router = inject(Router)
  private readonly toastCtrl = inject(ToastController)

  /** The last `sessionEndedAt` value we acted on — prevents double-fire. */
  private handledAt: number | null = null

  constructor() {
    effect(() => {
      const meta = this.docService.meta()
      const sessionEndedAt = meta?.sessionEndedAt

      if (sessionEndedAt === undefined || sessionEndedAt === null) {
        // Session ended locally (endSession()) or no session — reset tracker.
        this.handledAt = null
        return
      }

      if (sessionEndedAt === this.handledAt) return

      this.handledAt = sessionEndedAt
      void this.handleSessionEnd(meta?.createdBy)
    })
  }

  private async handleSessionEnd(createdBy: string | undefined): Promise<void> {
    // Guard: effect may re-run after endSession() nulls the projection.
    // If the session is already torn down, do nothing.
    if (!this.docService.hasSession()) return

    const isLocal = this.docService.endingSessionLocally()

    let message: string
    if (isLocal) {
      message = 'Session ended.'
    } else {
      // Find host display name from participants
      const participants = this.docService.participants()
      const hostId = this.docService.settings()?.hostParticipantId
      const hostName =
        participants.find((p) => p.id === hostId)?.displayName ??
        participants.find((p) => p.id === createdBy)?.displayName ??
        'Host'
      message = `Session ended by ${hostName}`
    }

    this.docService.endSession()

    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'top',
    })
    await toast.present()

    await this.router.navigate(['/home'])
  }
}
