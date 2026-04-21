import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core'
import { Router } from '@angular/router'
import {
  ActionSheetController,
  AlertController,
  IonAvatar,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import {
  chevronBackOutline,
  ellipsisHorizontalCircle,
  personCircleOutline,
  qrCodeOutline,
  shareOutline,
} from 'ionicons/icons'

import { DocService } from '../core/doc/doc.service'
import { ParticipantIdService } from '../core/participant-id.service'
import {
  RoundStartSheetComponent,
  type RoundStartSubmission,
} from '../round-start/round-start.sheet'
import { SessionSettingsSheetComponent } from '../session-settings/session-settings.sheet'

/**
 * Lobby — ux.md §5.4 host variant.
 *
 * Phase 2 only renders the host view because there are no joiners
 * without a relay. Phase 3 will split this into host + joiner
 * subtemplates driven by `settings.hostParticipantId ===
 * myParticipantId`.
 *
 * Session-settings sheet is wired through the ⋯ menu and the
 * subtitle tap. The Share / QR invite rows are stubbed because
 * relay-minted codes and universal links are Phase 5.
 *
 * The Lobby owns the session's lifetime (plan §3.10): leaving here
 * — either via the top-left back control or the ⋯ → "Leave
 * session" entry — prompts an `ion-alert` confirmation per ux.md
 * §2 "Destructive actions" and calls `docService.endSession()`
 * before popping to Home. The native `ion-back-button` would pop
 * without running our confirmation, so we render a custom back
 * chevron that routes through the same handler.
 */
@Component({
  selector: 'app-lobby',
  imports: [
    IonAvatar,
    IonBadge,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonModal,
    IonTitle,
    IonToolbar,
    RoundStartSheetComponent,
    SessionSettingsSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button
            aria-label="Back"
            (click)="confirmLeave()"
          >
            <ion-icon
              slot="icon-only"
              name="chevron-back-outline"
            ></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>Lobby</ion-title>
        <ion-buttons slot="end">
          <ion-button
            aria-label="More options"
            (click)="openActionSheet()"
          >
            <ion-icon
              slot="icon-only"
              name="ellipsis-horizontal-circle"
            ></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (roomCode(); as code) {
        <h1 class="room-code">{{ code }}</h1>
        <button
          type="button"
          class="subtitle"
          (click)="openSessionSettings()"
        >
          {{ subtitle() }}
        </button>
      }

      <ion-list lines="inset" class="actions">
        <ion-item button (click)="onShareInvite()">
          <ion-icon
            slot="start"
            name="share-outline"
            aria-hidden="true"
          ></ion-icon>
          <ion-label>Share invite</ion-label>
        </ion-item>
        <ion-item button (click)="onShowQr()">
          <ion-icon
            slot="start"
            name="qr-code-outline"
            aria-hidden="true"
          ></ion-icon>
          <ion-label>Show QR code</ion-label>
        </ion-item>
      </ion-list>

      <ion-list lines="inset" class="participants">
        <ion-list-header>
          <ion-label>Participants ({{ participants().length }})</ion-label>
        </ion-list-header>
        @for (p of participants(); track p.id) {
          <ion-item [class.offline]="!onlineIds().has(p.id)">
            <ion-avatar slot="start" aria-hidden="true">
              <ion-icon name="person-circle-outline"></ion-icon>
            </ion-avatar>
            <ion-label>
              {{ p.id === myId() ? 'You (' + p.displayName + ')' : p.displayName }}
            </ion-label>
            @if (p.id === hostId()) {
              <ion-badge slot="end" color="primary">Host</ion-badge>
            }
          </ion-item>
        }
      </ion-list>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-button
          expand="block"
          color="primary"
          [disabled]="!hasSession()"
          (click)="openRoundStart()"
        >
          Start Round {{ nextRoundNumber() }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>

    <ion-modal
      #roundStartModal
      [isOpen]="roundStartOpen()"
      [breakpoints]="[0, 0.6, 0.95]"
      [initialBreakpoint]="0.6"
      (didDismiss)="roundStartOpen.set(false)"
    >
      <ng-template>
        <app-round-start-sheet
          [roundNumber]="nextRoundNumber()"
          (submitted)="onRoundStart($event)"
        />
      </ng-template>
    </ion-modal>

    <ion-modal
      #sessionSettingsModal
      [isOpen]="sessionSettingsOpen()"
      [breakpoints]="[0, 0.6, 0.95]"
      [initialBreakpoint]="0.6"
      (didDismiss)="sessionSettingsOpen.set(false)"
    >
      <ng-template>
        <app-session-settings-sheet
          (closeRequested)="closeSessionSettings()"
        />
      </ng-template>
    </ion-modal>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .room-code {
        font-size: 2.5rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        margin: 0.5rem 0 0.25rem;
      }
      .subtitle {
        appearance: none;
        background: transparent;
        border: none;
        padding: 0;
        color: var(--ion-color-medium);
        font: inherit;
        cursor: pointer;
        text-align: left;
      }
      .subtitle:focus-visible {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: 2px;
        border-radius: 4px;
      }
      .actions,
      .participants {
        margin-top: 1.25rem;
      }
      ion-avatar ion-icon {
        font-size: 2rem;
        color: var(--ion-color-medium);
      }
      ion-item.offline {
        opacity: 0.5;
      }
    `,
  ],
})
export class LobbyPage {
  private readonly router = inject(Router)
  private readonly docService = inject(DocService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly actionSheetCtrl = inject(ActionSheetController)
  private readonly alertCtrl = inject(AlertController)
  private readonly toastCtrl = inject(ToastController)

  protected readonly hasSession = this.docService.hasSession
  protected readonly participants = this.docService.participants
  protected readonly onlineIds = this.docService.onlineParticipantIds
  protected readonly rounds = this.docService.rounds

  /** Round-start modal visibility. Two-way bound to `ion-modal`. */
  protected readonly roundStartOpen = signal(false)

  /** Session-settings modal visibility. Two-way bound to `ion-modal`. */
  protected readonly sessionSettingsOpen = signal(false)

  protected readonly myId = this.participantIdService.id

  protected readonly hostId = computed(
    () => this.docService.settings()?.hostParticipantId ?? null,
  )

  /**
   * Relay-assigned 6-character room code (ADR-0008). The code is
   * plumbed through `DocService` after `POST /rooms` resolves; schema.md
   * is explicit that codes do not live in the Yjs doc, so we read it
   * from the service's dedicated signal rather than `meta()`.
   */
  protected readonly roomCode = this.docService.roomCode

  /** 1-based index for the "Start Round N" label. */
  protected readonly nextRoundNumber = computed(() => this.rounds().length + 1)

  protected readonly subtitle = computed(() => {
    const settings = this.docService.settings()
    if (!settings) return ''
    const round = this.nextRoundNumber()
    const scaleName = formatScaleId(settings.defaultScale.id)
    const timer =
      settings.revealMode === 'timer' && settings.timerDurationMs
        ? formatTimerMs(settings.timerDurationMs)
        : 'No timer'
    return `Round ${round} • ${scaleName} • ${timer}`
  })

  private readonly modalRef = viewChild<IonModal>('roundStartModal')
  private readonly sessionSettingsModalRef = viewChild<IonModal>(
    'sessionSettingsModal',
  )

  constructor() {
    addIcons({
      'chevron-back-outline': chevronBackOutline,
      'ellipsis-horizontal-circle': ellipsisHorizontalCircle,
      'person-circle-outline': personCircleOutline,
      'qr-code-outline': qrCodeOutline,
      'share-outline': shareOutline,
    })
  }

  protected openRoundStart(): void {
    this.roundStartOpen.set(true)
  }

  protected async onRoundStart(submission: RoundStartSubmission): Promise<void> {
    this.docService.startRound({
      ...(submission.title !== null && { title: submission.title }),
    })
    await this.modalRef()?.dismiss()
    this.roundStartOpen.set(false)
    await this.router.navigate(['/estimating'])
  }

  protected async openActionSheet(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Session',
      buttons: [
        {
          text: 'Session settings',
          handler: () => {
            this.openSessionSettings()
          },
        },
        {
          text: 'Leave session',
          role: 'destructive',
          handler: () => {
            void this.confirmLeave()
          },
        },
        {
          text: 'Cancel',
          role: 'cancel',
        },
      ],
    })
    await sheet.present()
  }

  protected openSessionSettings(): void {
    this.sessionSettingsOpen.set(true)
  }

  protected async closeSessionSettings(): Promise<void> {
    await this.sessionSettingsModalRef()?.dismiss()
    this.sessionSettingsOpen.set(false)
  }

  protected async onShareInvite(): Promise<void> {
    // Phase 5: Capacitor Share plugin + relay-minted invite URL.
    await this.toast('Share invite lands in Phase 5')
  }

  protected async onShowQr(): Promise<void> {
    // Phase 5: full-screen QR modal (ux.md §5.8).
    await this.toast('QR code lands in Phase 5')
  }

  /**
   * Destructive-action confirmation (ux.md §2). Both entry points —
   * the top-left back chevron and the ⋯ → "Leave session" row — go
   * through here, so the session is never torn down without an
   * explicit user confirmation.
   */
  protected async confirmLeave(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Leave session?',
      message: 'Your session will be discarded.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Leave',
          role: 'destructive',
          handler: () => {
            void this.leaveSession()
          },
        },
      ],
    })
    await alert.present()
  }

  private async leaveSession(): Promise<void> {
    this.docService.endSession()
    await this.router.navigate(['/home'])
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 1800,
      position: 'bottom',
    })
    await t.present()
  }
}

// ---------------------------------------------------------------------------
// Module-private formatters
// ---------------------------------------------------------------------------

/**
 * Format a scale id for display. Capitalizes the first character so
 * `'fibonacci'` reads as "Fibonacci" and `'t-shirt'` reads as
 * "T-shirt". Custom scale ids (`'custom-<uuid>'`) get the same
 * treatment — acceptable per ux.md because custom-scale display is a
 * Phase 6 concern.
 */
function formatScaleId(id: string): string {
  if (id.length === 0) return id
  return id.charAt(0).toUpperCase() + id.slice(1)
}

/**
 * Format the session timer duration as it reads in the Lobby subtitle.
 * Matches the timer picker's preset values (30s / 1min / 2min / 3min /
 * 5min); non-preset values round down to the nearest second.
 */
function formatTimerMs(ms: number): string {
  if (ms < 60_000) {
    return `${Math.floor(ms / 1000)}s`
  }
  const mins = ms / 60_000
  return Number.isInteger(mins) ? `${mins}min` : `${mins.toFixed(1)}min`
}
