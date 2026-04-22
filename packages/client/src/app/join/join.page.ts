import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import {
  formatRoomCode,
  hashPassword,
  isValidRoomCode,
  normalizeRoomCode,
  type JoinRejectionReason,
} from '@hnch/shared'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone'

import { environment } from '../../environments/environment'
import { DisplayNameService } from '../core/display-name.service'
import { DocService } from '../core/doc/doc.service'
import { ParticipantIdService } from '../core/participant-id.service'
import { RelayRejectionError, resolveRoom } from '../core/relay/relay-api'

/**
 * Join Room — ux.md §5.3 manual-entry path.
 *
 * The user types a 6-character code; we `GET /rooms/:code` to resolve
 * it to a UUID (ADR-0016) and then hand off to `DocService.connect()`.
 * On a successful resolve we seed the doc with the returned UUID + the
 * code the user typed, open the y-websocket, and navigate to Lobby.
 *
 * Phase 3 only surfaces `unknown-room` in practice — the relay runs in
 * permissive mode per plan §2.4. Other `JoinRejectionReason`s have
 * user-visible copy wired already so Phase 5 doesn't need template
 * churn to turn on password / invite enforcement.
 *
 * Password + invite UI, QR scan, and deep-link auto-population all
 * land in Phase 5; this screen only owns the manual-entry flow.
 */
@Component({
  selector: 'app-join',
  host: { class: 'ion-page' },
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>Join Room</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <h1 class="ion-no-margin">Join a Room</h1>
      <p>Enter the 6-character code your host shared.</p>
      <ion-item
        fill="solid"
        lines="none"
        class="code-item"
      >
        <ion-label position="floating">Room code</ion-label>
        <ion-input
          [formControl]="codeControl"
          class="code-input"
          inputmode="text"
          autocapitalize="characters"
          autocomplete="one-time-code"
          enterkeyhint="go"
          spellcheck="false"
          maxlength="7"
          placeholder="XXX-XXX"
          (keydown.enter)="submit()"
        ></ion-input>
      </ion-item>
      @if (needsPassword()) {
        <ion-item
          fill="solid"
          lines="none"
          class="password-item"
        >
          <ion-label position="floating">Password</ion-label>
          <ion-input
            [formControl]="passwordControl"
            type="password"
            enterkeyhint="go"
            (keydown.enter)="submit()"
          ></ion-input>
        </ion-item>
      }
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-button
          expand="block"
          color="primary"
          [disabled]="!canJoin() || isSubmitting()"
          (click)="submit()"
        >
          Join
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: [
    `
      h1 {
        font-size: 2rem;
        font-weight: 700;
        margin-block-end: 0.75rem;
      }
      p {
        color: var(--ion-color-medium);
        margin-block-end: 1.25rem;
      }
      .code-item,
      .password-item {
        --border-radius: 8px;
      }
      .password-item {
        margin-block-start: 0.75rem;
      }
      .code-input {
        font-family: var(--ion-font-family-monospace, ui-monospace, monospace);
        font-size: 1.25rem;
        letter-spacing: 0.15em;
      }
      ion-footer ion-toolbar {
        --background: transparent;
        --border-width: 0;
      }
    `,
  ],
})
export class JoinPage {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly docService = inject(DocService)
  private readonly displayNameService = inject(DisplayNameService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly toastCtrl = inject(ToastController)

  /**
   * Raw form control bound to the `ion-input`. We reformat the value on
   * every edit so the user sees `XXX-XXX` even if they typed it flat or
   * with mixed case; the underlying model stays in the normalized (no
   * dash, uppercase) form that `isValidRoomCode` expects.
   */
  protected readonly codeControl = new FormControl('', { nonNullable: true })
  protected readonly passwordControl = new FormControl('', { nonNullable: true })

  private readonly rawValue = toSignal(this.codeControl.valueChanges, {
    initialValue: this.codeControl.value,
  })

  private readonly rawPassword = toSignal(this.passwordControl.valueChanges, {
    initialValue: this.passwordControl.value,
  })

  /**
   * Normalized version of the field's current value — no dashes,
   * uppercase. The Join button gates on this.
   */
  private readonly normalizedCode = computed(() =>
    normalizeRoomCode(this.rawValue()),
  )

  /** Set after resolving the room code — `true` when accessMode is `'password'`. */
  protected readonly needsPassword = signal(false)

  /** The resolved room UUID, cached between resolve and connect. */
  private resolvedUuid: string | null = null

  protected readonly canJoin = computed(() => {
    if (!isValidRoomCode(this.normalizedCode())) return false
    if (this.needsPassword() && !this.rawPassword().trim()) return false
    return true
  })

  protected readonly isSubmitting = signal(false)

  constructor() {
    // Live-reformat the field as the user types: normalize to strip
    // dashes + uppercase, then re-insert the dash once we have six
    // characters so the chrome matches ux.md §5.3's `XXX-XXX` hint.
    // `emitEvent: false` keeps the write from re-entering the
    // valueChanges stream and flipping the caret.
    this.codeControl.valueChanges.subscribe((value) => {
      const normalized = normalizeRoomCode(value)
      const formatted = formatRoomCode(normalized)
      if (formatted !== value) {
        this.codeControl.setValue(formatted, { emitEvent: false })
      }
      // Reset password state when the code changes — a different code
      // may resolve to a different access mode.
      if (this.resolvedUuid !== null) {
        this.resolvedUuid = null
        this.needsPassword.set(false)
        this.passwordControl.reset()
      }
    })

    // Deep-link auto-fill: if navigated via /join?code=K7P9MR, seed
    // the input so the user just taps Join. The displayNameGuard
    // stashes /join?code=... for post-onboarding resume, so this
    // also fires after the onboarding → resume flow.
    const codeParam = this.route.snapshot.queryParamMap.get('code')
    if (codeParam) {
      const formatted = formatRoomCode(normalizeRoomCode(codeParam))
      this.codeControl.setValue(formatted)
    }
  }

  protected async submit(): Promise<void> {
    if (!this.canJoin() || this.isSubmitting()) return
    this.isSubmitting.set(true)

    const code = this.normalizedCode()
    try {
      // Phase 1: resolve the code to get UUID + accessMode.
      // If we already resolved (user is submitting with a password),
      // skip the resolve step and go straight to connect.
      let uuid = this.resolvedUuid
      if (uuid === null) {
        const resolved = await resolveRoom(environment.relayHttpUrl, code)
        uuid = resolved.uuid

        if (resolved.accessMode === 'password') {
          // Show the password field and wait for the user to fill it in.
          this.resolvedUuid = uuid
          this.needsPassword.set(true)
          this.isSubmitting.set(false)
          return
        }
      }

      // Phase 2: connect with credentials.
      const [displayName, participantId] = await Promise.all([
        this.displayNameService.getDisplayName(),
        this.participantIdService.getOrCreateId(),
      ])

      const passwordHash = this.needsPassword()
        ? await hashPassword(this.passwordControl.value, uuid)
        : undefined

      this.docService.endSession()
      this.docService.joinSession({
        participantId,
        displayName: displayName ?? '',
        roomCode: code,
      })

      this.docService.connect(
        { roomCode: code, deviceId: participantId, passwordHash },
        { roomUuid: uuid },
      )

      await this.router.navigate(['/lobby'])
    } catch (err) {
      if (err instanceof RelayRejectionError) {
        await this.showRejectionToast(err.reason)
      } else {
        await this.showGenericErrorToast()
      }
    } finally {
      this.isSubmitting.set(false)
    }
  }

  private async showRejectionToast(reason: JoinRejectionReason): Promise<void> {
    await this.toast(rejectionCopy(reason))
  }

  private async showGenericErrorToast(): Promise<void> {
    // Network failure or an unexpected 5xx — the relay wasn't reachable
    // enough to give us a decoded rejection reason.
    await this.toast("Couldn't reach the relay. Check your connection and try again.")
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 2400,
      position: 'bottom',
    })
    await t.present()
  }
}

// ---------------------------------------------------------------------------
// Module-private copy
// ---------------------------------------------------------------------------

/**
 * Map a `JoinRejectionReason` to user-visible copy. Phase 3 only
 * surfaces `unknown-room` (the relay is permissive until Phase 5); the
 * rest are stubbed with generic copy so the exhaustive switch stays
 * compile-checked as new reasons land.
 */
function rejectionCopy(reason: JoinRejectionReason): string {
  switch (reason) {
    case 'unknown-room':
      return "That room code isn't active. Double-check with your host."
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
      return "Couldn't join with the info provided."
  }
}
