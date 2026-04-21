import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import {
  FIBONACCI_SCALE,
  formatRoomCode,
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
      :host {
        display: block;
      }
      h1 {
        font-size: 2rem;
        font-weight: 700;
        margin-block-end: 0.75rem;
      }
      p {
        color: var(--ion-color-medium);
        margin-block-end: 1.25rem;
      }
      .code-item {
        --border-radius: 8px;
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

  private readonly rawValue = toSignal(this.codeControl.valueChanges, {
    initialValue: this.codeControl.value,
  })

  /**
   * Normalized version of the field's current value — no dashes,
   * uppercase. The Join button gates on this.
   */
  private readonly normalizedCode = computed(() =>
    normalizeRoomCode(this.rawValue()),
  )

  protected readonly canJoin = computed(() =>
    isValidRoomCode(this.normalizedCode()),
  )

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
    })
  }

  protected async submit(): Promise<void> {
    if (!this.canJoin() || this.isSubmitting()) return
    this.isSubmitting.set(true)

    const code = this.normalizedCode()
    try {
      const [displayName, participantId, resolved] = await Promise.all([
        this.displayNameService.getDisplayName(),
        this.participantIdService.getOrCreateId(),
        resolveRoom(environment.relayHttpUrl, code),
      ])

      // Tear down any leftover session so `createSession`'s
      // single-session invariant holds across a back-nav from Lobby.
      this.docService.endSession()
      this.docService.createSession({
        participantId,
        displayName: displayName ?? '',
        defaultScale: FIBONACCI_SCALE,
        revealMode: 'manual',
        roomUuid: resolved.uuid,
        roomCode: code,
      })

      // Permissive mode for Phase 3 — `deviceId` is enough. Phase 5
      // threads in the Phase-5 password / invite fields without
      // touching this call site.
      this.docService.connect({
        roomCode: code,
        deviceId: participantId,
      })

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
