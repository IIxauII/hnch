import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  formatRoomCode,
  hashPassword,
  isValidRoomCode,
  MAX_PASSWORD_LENGTH,
  normalizePassword,
  normalizeRoomCode,
  parseInviteContent,
  RelayRejectionError,
  resolveRoom,
} from '@hnch/shared';
import type { JoinRejectionReason } from '@hnch/shared';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonInputPasswordToggle,
  IonItem,
  IonList,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, qrCodeOutline } from 'ionicons/icons';

import { AppPreferenceService } from '../core/app-preference.service';
import { AvatarColorService } from '../core/avatar-color.service';
import { DisplayNameService } from '../core/display-name.service';
import { DocService } from '../core/doc/doc.service';
import { LastSessionService } from '../core/last-session.service';
import { ParticipantIdService } from '../core/participant-id.service';
import { QrScannerService } from '../core/qr-scanner.service';
import {
  rejectionCopy,
  RELAY_UNREACHABLE_COPY,
  SESSION_OPEN_FAILED_COPY,
} from '../core/relay-copy';
import { RoomJoinService } from '../core/room-join.service';
import { isSessionUrl } from '../core/session-rejection.service';
import { ToastService } from '../services/toast.service';
import { SegmentedCodeInputComponent } from '../shared/segmented-code-input.component';
import { focusField } from '../utils/focus-field';
import {
  isJoinUrl,
  joinLinkAction,
  qrScanErrorCopy,
  shouldAutoSubmitDeepLink,
  shouldAutoSubmitTypedCode,
} from './join.helpers';
import { isComposingKey } from '../utils/composing-key';

/**
 * Join session — ux.md §1.3.
 *
 * The user types a 6-character code; we `GET /rooms/:code` to resolve
 * it to a UUID (ADR-0016) and then hand off to `DocService.open()`.
 * On a successful resolve we seed the doc with the returned UUID + the
 * code the user typed, open the y-websocket, and navigate to Lobby.
 *
 * Three join paths feed this screen: manual code entry, `?code=`
 * deep link (auto-populates), and QR scan (auto-populates + submits).
 * All three submit on their own once the code is complete — the Join
 * button is the fallback for retrying the same code, and the way to submit
 * a password.
 */
@Component({
  selector: 'app-join',
  host: { class: 'ion-page' },
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonInputPasswordToggle,
    IonItem,
    IonList,
    IonSpinner,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
    SegmentedCodeInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button
            defaultHref="/home"
            text=""
            icon="chevron-back-outline"
            aria-label="Back to home"
          ></ion-back-button>
        </ion-buttons>
        <ion-title role="heading" aria-level="1">Join session</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="page-container">
        <p class="page-subtitle">Enter the 6-character code your host shared.</p>

        <div class="hnch-card code-card">
          <div class="card-label">Session code</div>
          <app-segmented-code-input [formControl]="codeControl" />
        </div>

        @if (needsPassword()) {
          <ion-list inset="true" lines="none" class="password-list">
            <ion-item>
              <ion-input
                #passwordInput
                [formControl]="passwordControl"
                label="Password"
                labelPlacement="stacked"
                type="password"
                autocomplete="off"
                enterkeyhint="go"
                [maxlength]="maxPasswordLength"
                placeholder="Enter the session password"
                (keydown.enter)="composing($event) || submit()"
              >
                <ion-input-password-toggle slot="end" color="medium"></ion-input-password-toggle>
              </ion-input>
            </ion-item>
          </ion-list>
          <p class="list-footer">This session is password-protected.</p>
        }

        <ion-button
          expand="block"
          class="join-btn"
          [disabled]="!canJoin() || isSubmitting()"
          (click)="submit()"
        >
          @if (isSubmitting()) {
            <ion-spinner name="crescent" aria-label="Joining"></ion-spinner>
          } @else {
            Join
          }
        </ion-button>

        @if (canScanQr()) {
          <div class="divider" aria-hidden="true"><span>or</span></div>
          <ion-button
            expand="block"
            fill="outline"
            class="scan-btn"
            [disabled]="isSubmitting()"
            (click)="onScanQr()"
          >
            <ion-icon slot="start" name="qr-code-outline" aria-hidden="true"></ion-icon>
            Scan QR code
          </ion-button>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      @use '../../theme/page-container' as *;
      @include page-container(480px);

      .page-subtitle {
        margin: 8px 4px 16px;
        color: var(--hnch-muted);
        font-size: 16px;
        line-height: 1.4;
      }
      .code-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
      }
      ion-list.password-list {
        margin-block: 16px 0;
      }
      .list-footer {
        margin: 8px 16px 0;
        color: var(--hnch-muted);
        font-size: 13px;
      }
      .join-btn,
      .scan-btn {
        min-height: 50px;
        margin: 0;
        font-size: 17px;
      }
      .join-btn {
        margin-block-start: 24px;
      }
      .join-btn ion-spinner {
        width: 22px;
        height: 22px;
      }
      .divider {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 20px 4px;
        color: var(--hnch-muted);
        font-size: 13px;
      }
      .divider::before,
      .divider::after {
        flex: 1 1 0;
        height: 0.55px;
        background: var(--hnch-sep-strong);
        content: '';
      }
    `,
  ],
})
export class JoinPage {
  /**
   * For the Enter handlers: the Enter that confirms a choice in an input
   * method is part of typing, and commits nothing.
   */
  protected readonly composing = isComposingKey;

  /** As long as a password gets, on every surface. */
  protected readonly maxPasswordLength = MAX_PASSWORD_LENGTH;

  private readonly appPrefs = inject(AppPreferenceService);
  private readonly avatarColorService = inject(AvatarColorService);
  private readonly router = inject(Router);
  private readonly docService = inject(DocService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly displayNameService = inject(DisplayNameService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly qrScanner = inject(QrScannerService);
  private readonly roomJoinService = inject(RoomJoinService);
  private readonly toastService = inject(ToastService);
  private readonly injector = inject(Injector);

  /**
   * Raw form control bound to the segmented input. We reformat the value on
   * every edit so the model is always `XXX-XXX`, whatever the user typed or
   * pasted; `normalizedCode` strips it back to the form `isValidRoomCode`
   * expects.
   */
  protected readonly codeControl = new FormControl('', { nonNullable: true });
  protected readonly passwordControl = new FormControl('', { nonNullable: true });

  private readonly rawValue = toSignal(this.codeControl.valueChanges, {
    initialValue: this.codeControl.value,
  });

  private readonly rawPassword = toSignal(this.passwordControl.valueChanges, {
    initialValue: this.passwordControl.value,
  });

  /**
   * Normalized version of the field's current value — no dashes,
   * uppercase. The Join button gates on this.
   */
  private readonly normalizedCode = computed(() => normalizeRoomCode(this.rawValue()));

  /** Set after resolving the room code — `true` when accessMode is `'password'`. */
  protected readonly needsPassword = signal(false);

  /** The resolved room UUID, cached between resolve and connect. */
  private resolvedUuid: string | null = null;

  /**
   * The attempt in flight, if any. Aborted when the page is left: whatever
   * the attempt was waiting for, it must not act on it from a screen the
   * user is no longer on — least of all navigate them into the session.
   */
  private attempt: AbortController | null = null;

  /**
   * The last code `submit()` ran for. A typed code auto-submits once; after
   * that it takes an edit (or a tap on Join) to try again.
   */
  private lastAttemptedCode: string | null = null;

  /**
   * The navigation this page was last entered by; `undefined` until it has
   * been entered at all. See {@link ionViewWillEnter}.
   */
  private lastNavigationId: number | null | undefined = undefined;

  /** True between entering the page and leaving it. */
  private entered = false;

  /**
   * True while this page is writing the code field itself (deep link, QR
   * scan). Those paths call `submit()` on their own schedule, so the typed-code
   * auto-submit stands down for them.
   */
  private settingCodeProgrammatically = false;

  protected readonly canJoin = computed(() => {
    if (!isValidRoomCode(this.normalizedCode())) return false;
    // Password gate applies only after the resolve step has identified
    // the room as password-protected (`resolvedUuid !== null`). Before
    // resolve, an unverified `pw=1` URL hint must not block submit()
    // from running the resolve that would clear or confirm it.
    if (
      this.resolvedUuid !== null &&
      this.needsPassword() &&
      normalizePassword(this.rawPassword()) === ''
    )
      return false;
    return true;
  });

  protected readonly isSubmitting = signal(false);

  /**
   * `true` when the device can actually scan a QR code (native always;
   * web requires a `videoinput` device). Probed once at construction —
   * the scan button is hidden when this stays `false` so users on
   * camera-less desktops (e.g. a Mac mini) don't see a dead entry.
   */
  protected readonly canScanQr = signal(false);

  private readonly codeInput = viewChild(SegmentedCodeInputComponent);
  private readonly passwordInput = viewChild<IonInput>('passwordInput');

  constructor() {
    addIcons({ 'chevron-back-outline': chevronBackOutline, 'qr-code-outline': qrCodeOutline });
    inject(DestroyRef).onDestroy(() => this.abandonAttempt());

    void this.qrScanner.isScanningAvailable().then((ok) => this.canScanQr.set(ok));

    // Live-reformat the field as the user types: normalize to strip
    // dashes + uppercase, then re-insert the dash once we have six
    // characters. `emitEvent: false` keeps the write from re-entering the
    // valueChanges stream and flipping the caret.
    this.codeControl.valueChanges.subscribe((value) => {
      const normalized = normalizeRoomCode(value);
      const formatted = formatRoomCode(normalized);
      if (formatted !== value) {
        this.codeControl.setValue(formatted, { emitEvent: false });
      }
      // Reset password state when the code changes — a different code
      // may resolve to a different access mode.
      if (this.resolvedUuid !== null || this.needsPassword()) {
        this.resolvedUuid = null;
        this.needsPassword.set(false);
        this.passwordControl.reset();
      }

      // Sixth character in: go. The microtask lets `rawValue` (and with it
      // `canJoin`) catch up with this emission before `submit()` reads it.
      if (
        !this.settingCodeProgrammatically &&
        shouldAutoSubmitTypedCode({
          codeIsValid: isValidRoomCode(normalized),
          code: normalized,
          lastAttemptedCode: this.lastAttemptedCode,
          isSubmitting: this.isSubmitting(),
        })
      ) {
        queueMicrotask(() => void this.submit());
      }
    });
  }

  /**
   * Deep-link auto-fill + auto-submit: if navigated via /join?code=K7P9MR,
   * seed the input and immediately kick off the same flow as manual Join.
   * The displayNameGuard stashes /join?code=... for post-onboarding resume,
   * so this also fires after the onboarding → resume flow.
   *
   * On entering, not in the constructor: Ionic keeps the page in its stack,
   * and someone sent here a second time — by a session that turned them
   * away, by "Join session" on Home — enters the instance that is already
   * there. Read from the router for the same reason: the route this
   * instance was created with still says what it said then. The navigation
   * is the one that has just finished, which is the one that led here.
   */
  ionViewWillEnter(): void {
    this.entered = true;
    // Entered ahead of the router — a swipe back. What the router says is
    // about the page being left; this one is found as it was left.
    const routerIsHere = isJoinUrl(this.router.url);
    if (!routerIsHere) return;

    const params = this.router.parseUrl(this.router.url).queryParamMap;
    const codeParam = params.get('code');
    const navigation = this.router.lastSuccessfulNavigation;
    const action = joinLinkAction({
      codeParam,
      navigation,
      lastNavigationId: this.lastNavigationId,
      routerIsHere,
    });
    const entry = navigation?.id ?? null;
    this.lastNavigationId = entry;
    if (action === 'none') return;
    if (action === 'reset') {
      this.resetForm();
      return;
    }
    if (codeParam === null) return;

    const code = normalizeRoomCode(codeParam);
    if (action === 'fill') {
      // Back on the page. What is in the field stays; an empty field gets
      // the link's code back — to be used, not used already.
      if (this.normalizedCode().length === 0) this.setCode(formatRoomCode(code));
      return;
    }

    this.abandonAttempt();
    this.lastAttemptedCode = null;
    this.setCode(formatRoomCode(code));

    // Apply the URL `pw=1` hint AFTER setting the code, so the
    // valueChanges reset (which fires on setValue) does not wipe it.
    if (params.get('pw') === '1') {
      this.needsPassword.set(true);
    }

    // Only auto-submit if the user already has a display name — the guard
    // handles the no-name case by stashing the URL and redirecting to
    // onboarding; after onboarding completes and the user lands back
    // here, getDisplayName() will resolve non-null.
    void this.displayNameService.getDisplayName().then((name) => {
      // The page may have been left, or entered anew, while the name was read.
      if (!this.entered || entry !== this.lastNavigationId) return;
      if (shouldAutoSubmitDeepLink(codeParam, name)) {
        void this.submit();
      }
    });
  }

  /** Put the cursor in the code field on arrival, unless a link pre-filled it. */
  ionViewDidEnter(): void {
    if (this.normalizedCode().length === 0) this.codeInput()?.focus();
  }

  /**
   * Ionic keeps the page alive in the stack, so leaving is not destroying.
   *
   * On the way out — which a swipe that is let go of turns back from — only
   * what can be started again is given up: the attempt.
   */
  ionViewWillLeave(): void {
    this.abandonAttempt();
  }

  /**
   * Gone. What was typed to get in is not kept for whoever comes back to
   * the page: the password is asked for again.
   */
  ionViewDidLeave(): void {
    this.entered = false;
    this.forgetPassword();
  }

  /**
   * Give up on the attempt in flight: the user has left, or asked for
   * something else. A session the attempt had already begun to join is
   * closed again by the attempt itself, when it finds out — they did not get
   * to see it, and must not turn up in its roster.
   */
  private abandonAttempt(): void {
    this.attempt?.abort();
    this.attempt = null;
    this.isSubmitting.set(false);
  }

  private forgetPassword(): void {
    this.passwordControl.reset();
    this.resolvedUuid = null;
    this.needsPassword.set(false);
  }

  /** The form as it is on a first visit. */
  private resetForm(): void {
    this.abandonAttempt();
    this.lastAttemptedCode = null;
    this.setCode('');
    this.forgetPassword();
  }

  protected async submit(): Promise<void> {
    if (!this.canJoin() || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    const code = this.normalizedCode();
    this.lastAttemptedCode = code;
    const attempt = new AbortController();
    this.attempt = attempt;
    // The epoch of the session this attempt opens, once it has opened one.
    let joinedEpoch: number | null = null;
    // Whether the relay has been heard from: what goes wrong after that is
    // not the relay being out of reach.
    let relayAnswered = false;
    /**
     * True when the attempt has nothing left to act on: the page was left, or
     * the code it was made for is no longer the one in the field. The field
     * stays editable during an attempt — taking it away would take the focus
     * and the keyboard with it.
     */
    const stale = (): boolean => attempt.signal.aborted || this.normalizedCode() !== code;
    /** True while the page's state is this attempt's to change. */
    const current = (): boolean => this.attempt === attempt;
    /**
     * Close the session this attempt opened, if it is still the one held —
     * unless someone is looking at it: a Lobby that was gone to while the
     * attempt was under way has taken the session over.
     */
    const closeOwnSession = (evenIfShown = false): void => {
      if (joinedEpoch === null || this.docService.sessionEpoch() !== joinedEpoch) return;
      const url = this.router.url;
      if (!evenIfShown && isSessionUrl(url) && url.includes(code)) return;
      this.docService.teardown();
    };

    try {
      // Step 1: resolve the code to get UUID + accessMode.
      // If we already resolved (user is submitting with a password),
      // skip the resolve step and go straight to connect.
      let uuid = this.resolvedUuid;
      if (uuid === null) {
        const resolved = await resolveRoom(this.appPrefs.resolvedRelayHttpUrl(), code);
        relayAnswered = true;
        if (stale()) return;
        uuid = resolved.uuid;

        if (resolved.accessMode === 'password') {
          // Show the password field and wait for the user to fill it in.
          this.resolvedUuid = uuid;
          this.needsPassword.set(true);
          this.focusPasswordInput();
          return;
        }

        // Room is open — clear any stale pw=1 hint set before resolve.
        this.needsPassword.set(false);
        this.passwordControl.reset();
      }
      relayAnswered = true;

      // Step 2: connect with credentials.
      const [displayName, participantId] = await Promise.all([
        this.displayNameService.getDisplayName(),
        this.participantIdService.getOrCreateId(),
      ]);

      const passwordHash = this.needsPassword()
        ? await hashPassword(this.passwordControl.value, uuid)
        : undefined;
      if (stale()) return;

      const avatarColor = this.avatarColorService.value();
      this.docService.open({
        room: { uuid, code },
        participantId,
        displayName: displayName ?? '',
        ...(avatarColor && { avatarColor }),
        ...(passwordHash !== undefined && { passwordHash }),
        seed: { kind: 'join' },
      });
      joinedEpoch = this.docService.sessionEpoch();

      // Stay here until the relay has said yes or no. A slow relay is not a
      // no: on a timeout go in, and let the Lobby show that it is connecting.
      const outcome = await this.roomJoinService.waitForJoinOutcome({ signal: attempt.signal });
      if (outcome === 'superseded' || stale()) {
        // Left the page, changed the code, or the session is gone (the host
        // had already ended it). Whoever is responsible has taken over;
        // nothing to say here.
        closeOwnSession();
        return;
      }
      if (outcome !== 'connected' && outcome !== 'timeout') {
        closeOwnSession(true);
        await this.onRejected(outcome, current);
        return;
      }

      if (passwordHash !== undefined) {
        await this.keepForTheWayBack(uuid, passwordHash, outcome === 'connected');
      }
      if (attempt.signal.aborted) {
        closeOwnSession();
        return;
      }
      await this.router.navigate(['/lobby', code]);
    } catch (err) {
      // Whatever went wrong, the user did not get into the session.
      closeOwnSession();
      // Nor is there anything to tell them about a code they have left
      // behind: the page, or the code that is in the field by now.
      if (stale()) return;
      if (err instanceof RelayRejectionError) {
        await this.toast(rejectionCopy(err.reason));
      } else if (relayAnswered) {
        await this.toast(SESSION_OPEN_FAILED_COPY);
      } else {
        // Network failure or an unexpected 5xx — the relay wasn't reachable
        // enough to give us a decoded rejection reason.
        await this.toast(RELAY_UNREACHABLE_COPY);
      }
    } finally {
      // Only while the page's state is still this attempt's: leaving has
      // reset it already, and a newer attempt may be under way.
      if (current()) {
        this.attempt = null;
        this.isSubmitting.set(false);
        this.submitWhatWasTypedMeanwhile(code);
      }
    }
  }

  /**
   * The code was changed while an attempt for the old one was under way.
   * That attempt has just ended without a word; the new code, if it is all
   * there, is submitted as it would have been had it been typed now.
   */
  private submitWhatWasTypedMeanwhile(attemptedCode: string): void {
    const code = this.normalizedCode();
    if (code === attemptedCode) return;
    if (
      shouldAutoSubmitTypedCode({
        codeIsValid: isValidRoomCode(code),
        code,
        lastAttemptedCode: this.lastAttemptedCode,
        isSubmitting: this.isSubmitting(),
      })
    ) {
      queueMicrotask(() => void this.submit());
    }
  }

  /**
   * Keep the hash for the way back in (ADR-0044). Once the relay has
   * accepted it, in the entry; while it has not answered yet, on the side —
   * the entry is only written once it has, and a refusal drops what was put
   * aside. Not being able to keep it is no reason not to go in.
   */
  private async keepForTheWayBack(uuid: string, hash: string, accepted: boolean): Promise<void> {
    try {
      if (accepted) {
        await this.lastSessionService.rememberPasswordHash(uuid, hash);
      } else {
        this.lastSessionService.setPendingPasswordHash(uuid, hash);
      }
    } catch (err) {
      console.warn('Failed to cache the password hash:', err);
    }
  }

  /**
   * The relay turned the connection down. A wrong password is asked for
   * again, code kept; anything else has nothing left to correct on this
   * page. `current` says whether the page is still the attempt's to change.
   */
  private async onRejected(reason: JoinRejectionReason, current: () => boolean): Promise<void> {
    if (!current()) return;
    await this.toast(rejectionCopy(reason));
    if (!current()) return;
    if (reason === 'wrong-password') {
      this.passwordControl.reset();
      this.focusPasswordInput();
      return;
    }
    if (reason === 'unknown-room') {
      this.resolvedUuid = null;
      this.needsPassword.set(false);
      return;
    }
    await this.router.navigate(['/home']);
  }

  protected async onScanQr(): Promise<void> {
    if (this.isSubmitting()) return;
    const result = await this.qrScanner.scanForCode();

    if (result.status === 'cancelled') return;

    if (result.status === 'error') {
      await this.toast(qrScanErrorCopy(result.reason));
      return;
    }

    // result.status === 'ok'
    const code = parseInviteContent(result.value);
    if (!code) {
      await this.toast("That doesn't look like an hnch invite");
      return;
    }

    // Populate the input and submit — the existing submit()
    // handles open rooms (→ lobby) and password rooms (→ show field).
    this.setCode(formatRoomCode(code));
    await this.submit();
  }

  /** Write the code field from this page, without tripping the typed-code auto-submit. */
  private setCode(formatted: string): void {
    this.settingCodeProgrammatically = true;
    try {
      this.codeControl.setValue(formatted);
    } finally {
      this.settingCodeProgrammatically = false;
    }
  }

  /** The password field has just been revealed — put the cursor in it. */
  private focusPasswordInput(): void {
    afterNextRender(() => void focusField(this.passwordInput()), { injector: this.injector });
  }

  private async toast(message: string): Promise<void> {
    await this.toastService.error(message);
  }
}
