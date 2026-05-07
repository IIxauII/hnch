import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  viewChild,
} from '@angular/core'
import { Router } from '@angular/router'
import { hashPassword, type JoinRejectionReason } from '@hnch/shared'
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonRow,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import {
  addOutline,
  arrowForwardOutline,
  ellipsisHorizontalOutline,
  returnUpBackOutline,
} from 'ionicons/icons'

import { environment } from '../../environments/environment'
import { AppPreferenceService } from '../core/app-preference.service'
import { ToastService } from '../services/toast.service'
import { DisplayNameService } from '../core/display-name.service'
import { DocService } from '../core/doc/doc.service'
import {
  LastSessionService,
  type LastSessionCache,
  type LastSessionScreen,
} from '../core/last-session.service'
import { ParticipantIdService } from '../core/participant-id.service'
import { ScalePreferenceService } from '../core/scale-preference.service'
import { mintRoom, patchRoomAccess } from '../core/relay/relay-api'
import { assertRoomCode, RoomJoinService } from '../core/room-join.service'
import {
  JumpBackInBannerComponent,
  type JumpBackInSummary,
} from './jump-back-in-banner.component'
import { PasswordPromptSheetComponent } from './password-prompt.sheet'
import { presentSheet } from '../utils/present-sheet'

/**
 * Home launchpad — ux.md §5.2.
 *
 * Two primary entry points (Create, Join), an optional Jump-back-in
 * banner above them, and a ⋯ action sheet that currently only
 * exposes Settings. The banner renders iff `lastSessionService.get()`
 * resolves a non-expired cache entry; tapping it fast-path-rejoins
 * using the cached `roomUuid` so we skip `GET /rooms/:code`.
 *
 * Rejoin outcome handling (plan §3.8): we open the socket while still
 * mounted on Home, then race a `syncStatus === 'connected'` transition
 * against a relay rejection. On `unknown-room` we tear the session
 * down, clear the cache, toast, and stay put; any other outcome
 * navigates to the cached `lastScreen`.
 *
 * "Create Room" mints a fresh room on the relay (`POST /rooms`,
 * ADR-0016), seeds a `Y.Doc` with the returned UUID via DocService,
 * opens the y-websocket connection, then navigates to `/lobby`.
 */
@Component({
  selector: 'app-home',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonCol,
    IonContent,
    IonGrid,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonRow,
    IonTitle,
    IonToolbar,
    JumpBackInBannerComponent,
    PasswordPromptSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-title size="large">hnch</ion-title>
        <ion-buttons slot="end" class="ion-hide-lg-up">
          <ion-button
            aria-label="More options"
            (click)="openActionSheet()"
          >
            <ion-icon
              slot="icon-only"
              name="ellipsis-horizontal-outline"
            ></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <ion-grid fixed class="page-grid">
        <ion-row>
          <ion-col size="12" sizeMd="10" offsetMd="1" sizeLg="8" offsetLg="2">
            <ion-list inset="true" class="actions">
              @if (jumpBackInSummary(); as summary) {
                <app-jump-back-in-banner
                  [summary]="summary"
                  [stale]="jumpBackInStale()"
                  [resuming]="resuming()"
                  (resumeRequested)="onResumeJumpBack()"
                />
              }
              <ion-item button="true" detail="true" (click)="onCreateRoom()">
                <div class="icon-tile icon-tile--accent" slot="start" aria-hidden="true">
                  <ion-icon name="add-outline"></ion-icon>
                </div>
                <ion-label>
                  <h2>Create Room</h2>
                  <p>Start a new session</p>
                </ion-label>
              </ion-item>
              <ion-item button="true" detail="true" (click)="onJoinRoom()">
                <div class="icon-tile icon-tile--neutral" slot="start" aria-hidden="true">
                  <ion-icon name="arrow-forward-outline"></ion-icon>
                </div>
                <ion-label>
                  <h2>Join Room</h2>
                  <p>Enter a code or scan QR</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>

    <!-- Password prompt half-sheet — outside grid so overlay portal is unaffected -->
    <ion-modal
      #passwordModal
      [isOpen]="passwordPromptOpen()"
      [breakpoints]="[0, 0.6, 0.95]"
      [initialBreakpoint]="0.6"
      (didDismiss)="passwordPromptOpen.set(false)"
    >
      <ng-template>
        <app-password-prompt-sheet
          (passwordSubmitted)="onPasswordSubmitted($event)"
          (closeRequested)="onPasswordPromptClosed()"
        />
      </ng-template>
    </ion-modal>
  `,
  styles: [
    `
      ion-content {
        --background: var(--ion-background-color);
      }
      ion-list.actions {
        background: transparent;
        margin-block-start: 8px;
      }
      ion-item {
        --inner-padding-top: 12px;
        --inner-padding-bottom: 12px;
        --padding-start: 16px;
      }
      ion-item h2 {
        font-size: 17px;
        font-weight: 600;
        color: var(--ion-text-color);
        margin: 0 0 2px;
      }
      ion-item p {
        font-size: 14px;
        color: var(--ion-color-step-600);
        margin: 0;
      }
      .icon-tile {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-inline-end: 12px;
      }
      .icon-tile--accent {
        background: var(--ion-color-primary);
        color: var(--ion-color-primary-contrast);
      }
      .icon-tile--neutral {
        background: var(--ion-background-color-step-100);
        color: var(--ion-text-color);
      }
      .icon-tile ion-icon {
        font-size: 20px;
      }
    `,
  ],
})
export class HomePage {
  private readonly router = inject(Router)
  private readonly actionSheetCtrl = inject(ActionSheetController)
  private readonly toastService = inject(ToastService)
  private readonly appPrefs = inject(AppPreferenceService)
  private readonly displayNameService = inject(DisplayNameService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly scalePrefs = inject(ScalePreferenceService)
  private readonly lastSessionService = inject(LastSessionService)
  private readonly docService = inject(DocService)
  private readonly roomJoinService = inject(RoomJoinService)

  /**
   * Summary passed into the banner. `null` means "no banner" — either
   * no cache entry, entry past TTL, or we just cleared after an
   * `unknown-room` bounce. Populated once async from
   * `lastSessionService.get()` in the constructor.
   */
  protected readonly jumpBackInSummary = signal<JumpBackInSummary | null>(null)

  /**
   * True when the cached session is stale (relay reported unknown-room).
   * Banner remains visible but dimmed; tapping it shows the expired toast
   * and clears the entry.
   */
  protected readonly jumpBackInStale = signal(false)

  /**
   * `true` while a rejoin is in flight. Bound to the banner's
   * `disabled` state so double-taps are swallowed, and guards the
   * `onResumeJumpBack` handler against re-entry.
   */
  protected readonly resuming = signal(false)

  /**
   * Guards the Create Room button against double-tap while the
   * displayName + participantId reads are in flight. Pure in-memory
   * re-entrancy flag; no view binding.
   */
  private creating = false

  /**
   * State for the password prompt half-sheet. Opened after room is
   * minted if appPrefs.defaultPassword() is true.
   */
  protected readonly passwordPromptOpen = signal(false)

  /**
   * Cached room UUID from the successful mintRoom call, used to
   * patchRoomAccess if user sets a password.
   */
  private pendingRoomUuid: string | null = null

  private readonly passwordModalRef = viewChild<IonModal>('passwordModal')

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'arrow-forward-outline': arrowForwardOutline,
      'ellipsis-horizontal-outline': ellipsisHorizontalOutline,
      'return-up-back-outline': returnUpBackOutline,
    })
    void this.loadBannerFromCache()
  }

  ionViewWillEnter(): void {
    void this.loadBannerFromCache()
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
        // Use AppPreferenceService relay URL override, fallback to environment default.
        mintRoom(
          this.appPrefs.relayHttpUrl() ?? environment.relayHttpUrl,
        ),
      ])

      // Tear down any leftover session (e.g. back-nav from a prior
      // flow that bailed early) so createSession's single-session
      // invariant holds.
      this.docService.endSession()
      this.docService.createSession({
        participantId,
        displayName: displayName ?? '',
        defaultScale: this.scalePrefs.defaultScale(),
        sessionName: this.appPrefs.defaultSessionName() || undefined,
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

      // If defaultPassword is enabled, show password prompt; otherwise
      // navigate to lobby directly.
      if (this.appPrefs.defaultPassword()) {
        this.pendingRoomUuid = minted.uuid
        const modal = this.passwordModalRef()
        if (modal) void presentSheet({ modal })
      } else {
        await this.router.navigate(['/lobby', minted.code])
      }
    } finally {
      this.creating = false
    }
  }

  protected async onJoinRoom(): Promise<void> {
    await this.router.navigate(['/join'])
  }

  /**
   * Fast-path rejoin per plan §3.8.
   *
   * Prechecks via `GET /rooms/:code` to detect `unknown-room` (relay
   * denies pre-upgrade with HTTP 404, not a WS close code), then opens
   * the socket; any post-upgrade rejection is handled by the existing
   * `waitForJoinOutcome` race.
   */
  protected async onResumeJumpBack(): Promise<void> {
    // Stale-clear is idempotent and doesn't need the resuming guard: the
    // first tap may still be in-flight (awaiting toast.present) when the
    // user taps again, so checking stale *before* the resuming guard lets
    // the second tap reliably clear the banner even if resuming() is still
    // true from the first tap's finally block not having run yet.
    if (this.jumpBackInStale()) {
      await this.lastSessionService.clear()
      this.jumpBackInSummary.set(null)
      this.jumpBackInStale.set(false)
      return
    }
    if (this.resuming()) return
    this.resuming.set(true)
    try {
      // Re-read the cache at tap time rather than trusting the signal:
      // the entry may have aged past TTL since the banner first
      // rendered (cold-start banners that idle for 24 h), and re-reading
      // sweeps stale entries in one place.
      const cache = await this.lastSessionService.get()
      if (!cache) {
        this.jumpBackInSummary.set(null)
        this.jumpBackInStale.set(false)
        return
      }

      const outcome = await this.roomJoinService.rejoin(
        cache.roomCode,
      )

      if (outcome.type === 'unknown-room') {
        // Relay has forgotten this room (ADR-0012's TTL lapsed or the
        // server restarted). Mark banner as stale instead of immediately
        // clearing — it renders dimmed and a second tap clears it.
        this.docService.endSession()
        this.jumpBackInStale.set(true)
        await this.toast(
          "That session isn't active anymore. Start a new one or join a fresh code.",
        )
        return
      }

      if (outcome.type === 'password-required') {
        // Cache entry exists but room was later password-protected; redirect
        // to Join page which auto-fills the code and shows the password field.
        await this.router.navigate(['/join'], {
          queryParams: { code: cache.roomCode },
        })
        return
      }

      if (outcome.type === 'rejected') {
        // Phase-5 rejection reasons land here once enforcement is on.
        this.docService.endSession()
        await this.toast(rejectionCopy(outcome.reason))
        return
      }

      if (outcome.type === 'network-error') {
        // Network down — let user retry; don't clear the banner.
        await this.toast(
          "Couldn't reach the relay. Check your connection and try again.",
        )
        return
      }

      // 'connected' or 'timeout' — navigate into the session
      const code = this.docService.roomCode()
      assertRoomCode(code, 'home.onResumeJumpBack')
      await this.router.navigate([routeForScreen(cache.lastScreen, code)], {
        replaceUrl: true,
      })
    } finally {
      this.resuming.set(false)
    }
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

  private async loadBannerFromCache(): Promise<void> {
    const cache = await this.lastSessionService.get()
    if (!cache) {
      this.jumpBackInSummary.set(null)
      this.jumpBackInStale.set(false)
      return
    }
    // Reset stale flag so returning from another screen doesn't keep a stale
    // banner sticky — the next tap will re-test via resolveRoom and re-set
    // stale if the room is still gone.
    this.jumpBackInStale.set(false)
    this.jumpBackInSummary.set(summaryFromCache(cache))
  }

  private async toast(message: string): Promise<void> {
    await this.toastService.error(message)
  }

  // ---------------------------------------------------------------------------
  // Password prompt handlers
  // ---------------------------------------------------------------------------

  /**
   * Handler for password submission from the password prompt sheet.
   * If password is non-empty, hash it and patchRoomAccess; otherwise
   * treat as no password (open mode). Then navigate to lobby.
   */
  protected async onPasswordSubmitted(password: string): Promise<void> {
    try {
      const uuid = this.pendingRoomUuid
      const code = this.docService.roomCode()
      if (!uuid || !code) {
        // Defensive: should never happen — createSession ran before this sheet opened.
        throw new Error('onPasswordSubmitted: no pending room uuid/code')
      }

      // Dismiss the modal and close the signal
      await this.passwordModalRef()?.dismiss()
      this.passwordPromptOpen.set(false)

      // If password is non-empty, hash and apply it
      if (password.trim()) {
        const hash = await hashPassword(password, uuid)
        await patchRoomAccess(
          this.appPrefs.relayHttpUrl() ?? environment.relayHttpUrl,
          uuid,
          hash,
        )
      }
      // If empty password, room stays in open mode (created that way by default)

      await this.router.navigate(['/lobby', code])
    } catch (e) {
      const code = this.docService.roomCode()
      await this.toast('Failed to set password. Room created without password.')
      if (code) {
        await this.router.navigate(['/lobby', code])
      } else {
        await this.router.navigate(['/home'])
      }
    }
  }

  /**
   * Handler for cancel/close from the password prompt sheet.
   * Navigates to lobby without setting a password (open mode).
   */
  protected async onPasswordPromptClosed(): Promise<void> {
    await this.passwordModalRef()?.dismiss()
    this.passwordPromptOpen.set(false)
    const code = this.docService.roomCode()
    if (!code) {
      throw new Error('onPasswordPromptClosed: docService.roomCode() is null — no active session')
    }
    await this.router.navigate(['/lobby', code])
  }
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

function summaryFromCache(cache: LastSessionCache): JumpBackInSummary {
  return {
    roomCode: cache.roomCode,
    lastScreen: cache.lastScreen,
  }
}

function routeForScreen(screen: LastSessionScreen, code: string): string {
  switch (screen) {
    case 'lobby':
      return `/lobby/${code}`
    case 'estimating':
      return `/estimating/${code}`
  }
}

/**
 * Defensive fallback copy for relay rejections we don't expect in
 * Phase 3 (the only live reason is `unknown-room`, handled inline).
 * Mirrors the Join page's switch so Phase 5's enforcement turns on
 * without another round of copy work.
 */
function rejectionCopy(reason: JoinRejectionReason): string {
  switch (reason) {
    case 'unknown-room':
      return "That session isn't active anymore."
    case 'wrong-password':
      return 'That password is incorrect.'
    case 'invalid-invite':
      return "That invite link isn't valid."
    case 'expired-invite':
      return 'That invite link has expired.'
    case 'invite-already-redeemed':
      return 'That invite link has already been used.'
    case 'room-full':
      return 'That room is full.'
    case 'malformed-credentials':
      return "Couldn't rejoin with the info on file."
  }
}
