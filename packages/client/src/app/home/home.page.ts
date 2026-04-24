import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core'
import { Router } from '@angular/router'
import { hashPassword, type JoinRejectionReason } from '@hnch/shared'
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import {
  addOutline,
  arrowForwardOutline,
  ellipsisHorizontalCircle,
  returnUpBackOutline,
} from 'ionicons/icons'

import { environment } from '../../environments/environment'
import { AppPreferenceService } from '../core/app-preference.service'
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
import {
  JumpBackInBannerComponent,
  type JumpBackInSummary,
} from './jump-back-in-banner.component'
import { PasswordPromptSheetComponent } from './password-prompt.sheet'

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
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonModal,
    IonTitle,
    IonToolbar,
    JumpBackInBannerComponent,
    PasswordPromptSheetComponent,
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
          [resuming]="resuming()"
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

      <!-- Password prompt half-sheet -->
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
    </ion-content>
  `,
  styles: [
    `
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
  private readonly toastCtrl = inject(ToastController)
  private readonly appPrefs = inject(AppPreferenceService)
  private readonly displayNameService = inject(DisplayNameService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly scalePrefs = inject(ScalePreferenceService)
  private readonly lastSessionService = inject(LastSessionService)
  private readonly docService = inject(DocService)
  private readonly injector = inject(Injector)

  /**
   * Summary passed into the banner. `null` means "no banner" — either
   * no cache entry, entry past TTL, or we just cleared after an
   * `unknown-room` bounce. Populated once async from
   * `lastSessionService.get()` in the constructor.
   */
  protected readonly jumpBackInSummary = signal<JumpBackInSummary | null>(null)

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
      'ellipsis-horizontal-circle': ellipsisHorizontalCircle,
      'return-up-back-outline': returnUpBackOutline,
    })
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
        this.passwordPromptOpen.set(true)
      } else {
        await this.router.navigate(['/lobby'])
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
   * Skips `GET /rooms/:code` because we already have the UUID, then
   * waits for the first `'connected'` / relay-rejection transition
   * so we can detect `unknown-room` (the only rejection that Phase 3
   * emits in practice, per §2.4) without navigating first and
   * bouncing. Any other outcome — including a timeout — optimistically
   * proceeds to the cached screen; the chip polish in commit §10 will
   * surface lingering disconnects there.
   */
  protected async onResumeJumpBack(): Promise<void> {
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
        return
      }

      const [displayName, participantId] = await Promise.all([
        this.displayNameService.getDisplayName(),
        this.participantIdService.getOrCreateId(),
      ])

      this.docService.endSession()
      this.docService.createSession({
        participantId,
        displayName: displayName ?? '',
        defaultScale: this.scalePrefs.defaultScale(),
        roomUuid: cache.roomUuid,
        roomCode: cache.roomCode,
      })
      this.docService.connect({
        roomCode: cache.roomCode,
        deviceId: participantId,
      })

      const outcome = await this.waitForJoinOutcome()
      if (outcome === 'unknown-room') {
        // Relay has forgotten this room (ADR-0012's TTL lapsed or the
        // server restarted). Tear the local session down, drop the
        // banner, and stay on Home.
        this.docService.endSession()
        await this.lastSessionService.clear()
        this.jumpBackInSummary.set(null)
        await this.toast(
          "That session isn't active anymore. Start a new one or join a fresh code.",
        )
        return
      }
      if (typeof outcome === 'string' && outcome !== 'connected' && outcome !== 'timeout') {
        // Phase-5 rejection reasons land here once enforcement is on.
        // For now we log and stay — a useful fallback should `connect`
        // ever surface an unexpected reason from the relay mid-Phase 3.
        this.docService.endSession()
        await this.toast(rejectionCopy(outcome))
        return
      }

      await this.router.navigate([routeForScreen(cache.lastScreen)], {
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

  /**
   * Await the first decisive event off the doc-service signals after
   * a `connect()` call: either `syncStatus === 'connected'`, a
   * relay-issued rejection, or a timeout. Implemented with a one-shot
   * `effect()` captured in `this.injector` so it tears itself down
   * when any branch resolves.
   *
   * Timeout is a safety net — y-websocket will reconnect in the
   * background if the first attempt times out, but the user has
   * tapped a button and we owe them a visible outcome.
   */
  private waitForJoinOutcome(
    opts: { timeoutMs?: number } = {},
  ): Promise<'connected' | 'timeout' | JoinRejectionReason> {
    const timeoutMs = opts.timeoutMs ?? 5_000
    return new Promise((resolve) => {
      let settled = false
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      const settle = (
        outcome: 'connected' | 'timeout' | JoinRejectionReason,
      ): void => {
        if (settled) return
        settled = true
        if (timeoutId !== null) clearTimeout(timeoutId)
        // Defer destroy so the effect function returns before we
        // tear its own handle down.
        queueMicrotask(() => ref.destroy())
        resolve(outcome)
      }

      const ref = effect(
        () => {
          if (settled) return
          const rejection = this.docService.lastRejection()
          if (rejection !== null) {
            settle(rejection)
            return
          }
          const status = this.docService.syncStatus()
          if (status === 'connected') settle('connected')
        },
        { injector: this.injector },
      )

      timeoutId = setTimeout(() => settle('timeout'), timeoutMs)
    })
  }

  private async loadBannerFromCache(): Promise<void> {
    const cache = await this.lastSessionService.get()
    if (!cache) return
    this.jumpBackInSummary.set(summaryFromCache(cache))
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 2400,
      position: 'bottom',
    })
    await t.present()
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
      if (!uuid) {
        await this.router.navigate(['/lobby'])
        return
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

      await this.router.navigate(['/lobby'])
    } catch (e) {
      await this.toast('Failed to set password. Room created without password.')
      await this.router.navigate(['/lobby'])
    }
  }

  /**
   * Handler for cancel/close from the password prompt sheet.
   * Navigates to lobby without setting a password (open mode).
   */
  protected async onPasswordPromptClosed(): Promise<void> {
    await this.passwordModalRef()?.dismiss()
    this.passwordPromptOpen.set(false)
    await this.router.navigate(['/lobby'])
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

function routeForScreen(screen: LastSessionScreen): string {
  switch (screen) {
    case 'lobby':
      return '/lobby'
    case 'estimating':
      return '/estimating'
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
