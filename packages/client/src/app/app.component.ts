import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core'
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone'

import { DocService } from './core/doc/doc.service'
import { HapticService } from './core/haptic.service'
import { HostElectionService } from './core/host-election.service'
import { ParticipantIdService } from './core/participant-id.service'
import { SessionEndService } from './core/session-end.service'
import { ThemeService } from './core/theme.service'
import { ToastService } from './services/toast.service'

/**
 * Root shell. Provides the `ion-app` container and the single nav stack
 * (`ion-router-outlet`). Per ux.md §2 the app uses a single nav stack —
 * no tabs, no side menu — so this shell stays deliberately minimal.
 *
 * Services that run global effects (host election, host-change toast)
 * are injected here so Angular instantiates them at app start. Each
 * service no-ops internally when no session is active.
 */
@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent {
  private readonly docService = inject(DocService)
  private readonly haptic = inject(HapticService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly toastService = inject(ToastService)

  // Eager-instantiate global effect services. The inject() calls
  // ensure Angular creates these singletons; each service's effect
  // self-gates on `docService.hasSession()`.
  private readonly _hostElection = inject(HostElectionService)
  private readonly _sessionEnd = inject(SessionEndService)
  private readonly _theme = inject(ThemeService)

  /**
   * Scratch signal tracking the previous `hostParticipantId` so we can
   * detect transitions without comparing against `undefined` at boot.
   * `null` means "no previous value observed yet" — suppress the toast
   * on first render / session creation.
   */
  private readonly previousHostId = signal<string | null>(null)

  constructor() {
    effect(() => {
      const hostId = this.docService.settings()?.hostParticipantId ?? null
      const prev = this.previousHostId()

      if (hostId === null) {
        // No session or no host yet — reset tracking.
        if (prev !== null) this.previousHostId.set(null)
        return
      }

      if (prev === null) {
        // First observation (session just started) — seed without toast.
        this.previousHostId.set(hostId)
        return
      }

      if (hostId !== prev) {
        this.previousHostId.set(hostId)
        void this.showHostChangeToast(hostId)
      }
    })
  }

  private async showHostChangeToast(newHostId: string): Promise<void> {
    const myId = this.participantIdService.id()
    let message: string
    if (newHostId === myId) {
      message = 'You are now the host'
    } else {
      const participant = this.docService
        .participants()
        .find((p) => p.id === newHostId)
      const name = participant?.displayName ?? newHostId
      message = `${name} is now the host`
    }
    this.haptic.notificationWarning()
    await this.toastService.info(message)
  }
}
