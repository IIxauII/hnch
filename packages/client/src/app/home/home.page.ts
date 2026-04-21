import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core'
import { Router } from '@angular/router'
import { FIBONACCI_SCALE } from '@hnch/shared'
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import {
  addOutline,
  arrowForwardOutline,
  ellipsisHorizontalCircle,
  returnUpBackOutline,
} from 'ionicons/icons'

import { environment } from '../../environments/environment'
import { DisplayNameService } from '../core/display-name.service'
import { DocService } from '../core/doc/doc.service'
import { ParticipantIdService } from '../core/participant-id.service'
import { mintRoom } from '../core/relay/relay-api'
import {
  JumpBackInBannerComponent,
  type JumpBackInSummary,
} from './jump-back-in-banner.component'

/**
 * Home launchpad — ux.md §5.2.
 *
 * Two primary entry points (Create, Join) and a ⋯ action sheet that
 * currently only exposes Settings. The JumpBackInBanner shell is
 * rendered iff `jumpBackInSummary()` is non-null; Phase 3 will wire
 * that signal to the local session cache. Until then the banner
 * stays hidden — its DOM is loaded and ready to accept state
 * without further template churn.
 *
 * "Create Room" mints a fresh room on the relay (`POST /rooms`,
 * ADR-0016), seeds a `Y.Doc` with the returned UUID via DocService,
 * opens the y-websocket connection, then navigates to `/lobby`. The
 * participantId → deviceId swap lands later in Phase 3 alongside the
 * Capacitor-Device plumbing.
 */
@Component({
  selector: 'app-home',
  imports: [
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
    JumpBackInBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>hnch</ion-title>
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
      @if (jumpBackInSummary(); as summary) {
        <app-jump-back-in-banner
          [summary]="summary"
          (resumeRequested)="onResumeJumpBack()"
        />
      }

      <ion-card button (click)="onCreateRoom()">
        <ion-card-content>
          <div class="row">
            <ion-icon name="add-outline" aria-hidden="true"></ion-icon>
            <div class="text">
              <strong>Create Room</strong>
              <span>Start a new session</span>
            </div>
          </div>
        </ion-card-content>
      </ion-card>

      <ion-card button (click)="onJoinRoom()">
        <ion-card-content>
          <div class="row">
            <ion-icon name="arrow-forward-outline" aria-hidden="true"></ion-icon>
            <div class="text">
              <strong>Join Room</strong>
              <span>Enter a code or scan QR</span>
            </div>
          </div>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      ion-icon {
        font-size: 1.5rem;
        color: var(--ion-color-primary);
      }
      .text {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
    `,
  ],
})
export class HomePage {
  private readonly router = inject(Router)
  private readonly actionSheetCtrl = inject(ActionSheetController)
  private readonly displayNameService = inject(DisplayNameService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly docService = inject(DocService)

  /**
   * Backed-out-session summary for the Jump-back-in banner. Null in
   * Phase 1 — wired to the local session cache in Phase 3.
   */
  protected readonly jumpBackInSummary = signal<JumpBackInSummary | null>(null)

  /**
   * Guards the Create Room button against double-tap while the
   * displayName + participantId reads are in flight. Pure in-memory
   * re-entrancy flag; no view binding.
   */
  private creating = false

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'arrow-forward-outline': arrowForwardOutline,
      'ellipsis-horizontal-circle': ellipsisHorizontalCircle,
      'return-up-back-outline': returnUpBackOutline,
    })
  }

  protected async onCreateRoom(): Promise<void> {
    // Guard against double-tap; both Preferences reads are async.
    if (this.creating) return
    this.creating = true

    try {
      // The displayNameGuard has already ensured this is non-null
      // before we ever rendered, so the `?? ''` fallback is defense
      // in depth rather than an expected branch.
      const [displayName, participantId, minted] = await Promise.all([
        this.displayNameService.getDisplayName(),
        this.participantIdService.getOrCreateId(),
        // Mint the room on the relay (ADR-0016 `POST /rooms`). Until
        // we introduce a local-session cache we do this eagerly; if
        // the relay is unreachable the promise rejects and we bail.
        mintRoom(environment.relayHttpUrl),
      ])

      // Tear down any leftover session (e.g. back-nav from a prior
      // flow that bailed early) so createSession's single-session
      // invariant holds.
      this.docService.endSession()
      this.docService.createSession({
        participantId,
        displayName: displayName ?? '',
        defaultScale: FIBONACCI_SCALE,
        revealMode: 'manual',
        roomUuid: minted.uuid,
        roomCode: minted.code,
      })

      // Open the sync connection so our own writes propagate and the
      // UI's status chip starts reflecting live state. ADR-0005's
      // deviceId slot is filled from `participantId` until the
      // Capacitor-Device swap in a later P3 commit.
      this.docService.connect({
        roomCode: minted.code,
        deviceId: participantId,
      })

      await this.router.navigate(['/lobby'])
    } finally {
      this.creating = false
    }
  }

  protected async onJoinRoom(): Promise<void> {
    await this.router.navigate(['/join'])
  }

  protected onResumeJumpBack(): void {
    // Phase 3: reconnect the cached session and push the recorded
    // screen. No-op while the summary signal is null.
    console.debug('resume jump-back — phase 3')
  }

  protected async openActionSheet(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'hnch',
      buttons: [
        {
          text: 'Settings',
          handler: () => {
            void this.router.navigate(['/settings'])
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
}
