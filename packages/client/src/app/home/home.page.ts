import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { hashPassword, type JoinRejectionReason } from '@hnch/shared';
import { IonContent, IonModal } from '@ionic/angular/standalone';

import { environment } from '../../environments/environment';
import { AppPreferenceService } from '../core/app-preference.service';
import { ToastService } from '../services/toast.service';
import { DisplayNameService } from '../core/display-name.service';
import { DocService } from '../core/doc/doc.service';
import {
  LastSessionService,
  type LastSessionCache,
  type LastSessionScreen,
} from '../core/last-session.service';
import { ParticipantIdService } from '../core/participant-id.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { mintRoom, patchRoomAccess } from '../core/relay/relay-api';
import { assertRoomCode, RoomJoinService } from '../core/room-join.service';
import { type JumpBackInSummary } from './jump-back-in-banner.component';
import { PasswordPromptSheetComponent } from './password-prompt.sheet';

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
  imports: [IonContent, IonModal, PasswordPromptSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <div class="hero">
        <h1 class="hero-mark">hnch</h1>
        <p class="hero-tag">Estimate by hunch.</p>
      </div>
      <div class="entries">
        @if (jumpBackInSummary(); as summary) {
          <button
            class="entry entry--resume"
            (click)="onResumeJumpBack()"
            [disabled]="resuming()"
            [class.stale]="jumpBackInStale()"
            aria-label="Resume session {{ summary.roomCode }}"
          >
            <span class="entry-eyebrow">Resume</span>
            <span class="entry-title">{{ summary.roomCode }}</span>
            <span class="entry-sub">{{ summary.lastScreen === 'estimating' ? 'Estimating round' : 'In the lobby' }}</span>
          </button>
        }
        <button class="entry entry--primary" (click)="onCreateRoom()" aria-label="Create a new room">
          <span class="entry-eyebrow">New</span>
          <span class="entry-title">Create room</span>
          <span class="entry-sub">Start a session and invite the team.</span>
        </button>
        <button class="entry entry--secondary" (click)="onJoinRoom()" aria-label="Join an existing room">
          <span class="entry-eyebrow">Existing</span>
          <span class="entry-title">Join room</span>
          <span class="entry-sub">Enter a code or scan a QR.</span>
        </button>
      </div>
    </ion-content>

    <!-- Password prompt half-sheet — outside content so overlay portal is unaffected -->
    <ion-modal
      #passwordModal
      class="hnch-form-modal"
      [isOpen]="passwordPromptOpen()"
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

      .hero {
        padding: clamp(48px, 12vw, 144px) 24px clamp(24px, 5vw, 56px);
        text-align: center;
      }
      .hero-mark {
        font-family: var(--hnch-font-display);
        font-weight: 800;
        font-size: clamp(72px, 14vw, 184px);
        line-height: 0.9;
        letter-spacing: -0.04em;
        margin: 0 0 8px;
        font-variation-settings: "opsz" 144;
        color: var(--ion-text-color);
      }
      .hero-tag {
        font-size: clamp(16px, 1.6vw, 22px);
        color: var(--ion-color-step-600);
        font-style: italic;
        font-family: var(--hnch-font-display);
        font-weight: 400;
        margin: 0;
      }

      .entries {
        max-width: 720px;
        margin: 0 auto;
        padding: 0 24px clamp(48px, 8vw, 96px);
        display: grid;
        gap: 12px;
        grid-template-columns: 1fr;
      }
      @media (min-width: 768px) {
        .entries { grid-template-columns: 1fr 1fr; }
        .entries .entry--resume { grid-column: 1 / -1; }
      }

      .entry {
        appearance: none;
        border: 0;
        text-align: left;
        background: var(--ion-background-color-step-50);
        border-radius: 18px;
        padding: 28px 24px 24px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        cursor: pointer;
        transition: transform 0.15s ease, background 0.15s ease;
        font-family: inherit;
        width: 100%;
      }
      .entry:hover { transform: translateY(-2px); background: var(--ion-background-color-step-100); }
      .entry:active { transform: translateY(0); }
      .entry:disabled { opacity: 0.5; cursor: default; transform: none; }
      .entry.stale { opacity: 0.55; }

      .entry-eyebrow {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--ion-color-step-600);
      }
      .entry-title {
        font-family: var(--hnch-font-display);
        font-size: 28px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--ion-text-color);
        font-variation-settings: "opsz" 32;
      }
      .entry-sub {
        font-size: 14px;
        color: var(--ion-color-step-600);
        margin-top: 4px;
      }

      .entry--primary {
        background: var(--ion-color-primary);
      }
      .entry--primary .entry-eyebrow,
      .entry--primary .entry-title,
      .entry--primary .entry-sub { color: var(--ion-color-primary-contrast); }
      .entry--primary .entry-sub { opacity: 0.85; }
      .entry--primary:hover { background: var(--ion-color-primary-shade); transform: translateY(-2px); }

      .entry--resume {
        background: transparent;
        border: 1px solid var(--ion-color-step-200);
      }

      @media (prefers-reduced-motion: reduce) {
        .entry { transition: none; }
        .entry:hover { transform: none; }
      }
    `,
  ],
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly displayNameService = inject(DisplayNameService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly scalePrefs = inject(ScalePreferenceService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly docService = inject(DocService);
  private readonly roomJoinService = inject(RoomJoinService);

  /**
   * Summary passed into the banner. `null` means "no banner" — either
   * no cache entry, entry past TTL, or we just cleared after an
   * `unknown-room` bounce. Populated once async from
   * `lastSessionService.get()` in the constructor.
   */
  protected readonly jumpBackInSummary = signal<JumpBackInSummary | null>(null);

  /**
   * True when the cached session is stale (relay reported unknown-room).
   * Banner remains visible but dimmed; tapping it shows the expired toast
   * and clears the entry.
   */
  protected readonly jumpBackInStale = signal(false);

  /**
   * `true` while a rejoin is in flight. Bound to the banner's
   * `disabled` state so double-taps are swallowed, and guards the
   * `onResumeJumpBack` handler against re-entry.
   */
  protected readonly resuming = signal(false);

  /**
   * Guards the Create Room button against double-tap while the
   * displayName + participantId reads are in flight. Pure in-memory
   * re-entrancy flag; no view binding.
   */
  private creating = false;

  /**
   * State for the password prompt half-sheet. Opened after room is
   * minted if appPrefs.defaultPassword() is true.
   */
  protected readonly passwordPromptOpen = signal(false);

  /**
   * Cached room UUID from the successful mintRoom call, used to
   * patchRoomAccess if user sets a password.
   */
  private pendingRoomUuid: string | null = null;

  private readonly passwordModalRef = viewChild<IonModal>('passwordModal');

  constructor() {
    void this.loadBannerFromCache();
  }

  ionViewWillEnter(): void {
    void this.loadBannerFromCache();
  }

  protected async onCreateRoom(): Promise<void> {
    // Guard against double-tap; both Preferences reads are async.
    if (this.creating) return;
    this.creating = true;

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
        mintRoom(this.appPrefs.relayHttpUrl() ?? environment.relayHttpUrl),
      ]);

      // Tear down any leftover session (e.g. back-nav from a prior
      // flow that bailed early) so createSession's single-session
      // invariant holds.
      this.docService.endSession();
      const defaultSessionName = this.appPrefs.defaultSessionName();
      this.docService.createSession({
        participantId,
        displayName: displayName ?? '',
        defaultScale: this.scalePrefs.defaultScale(),
        ...(defaultSessionName && { sessionName: defaultSessionName }),
        roomUuid: minted.uuid,
        roomCode: minted.code,
      });

      // Open the sync connection so our own writes propagate and the
      // UI's status chip starts reflecting live state. ADR-0005's
      // deviceId slot is filled from `participantId` until the
      // Capacitor-Device swap in a later P3 commit.
      this.docService.connect({
        roomCode: minted.code,
        deviceId: participantId,
      });

      // If defaultPassword is enabled, show password prompt; otherwise
      // navigate to lobby directly.
      if (this.appPrefs.defaultPassword()) {
        this.pendingRoomUuid = minted.uuid;
        this.passwordPromptOpen.set(true);
      } else {
        await this.router.navigate(['/lobby', minted.code]);
      }
    } finally {
      this.creating = false;
    }
  }

  protected async onJoinRoom(): Promise<void> {
    await this.router.navigate(['/join']);
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
      await this.lastSessionService.clear();
      this.jumpBackInSummary.set(null);
      this.jumpBackInStale.set(false);
      return;
    }
    if (this.resuming()) return;
    this.resuming.set(true);
    try {
      // Re-read the cache at tap time rather than trusting the signal:
      // the entry may have aged past TTL since the banner first
      // rendered (cold-start banners that idle for 24 h), and re-reading
      // sweeps stale entries in one place.
      const cache = await this.lastSessionService.get();
      if (!cache) {
        this.jumpBackInSummary.set(null);
        this.jumpBackInStale.set(false);
        return;
      }

      const outcome = await this.roomJoinService.rejoin(cache.roomCode);

      if (outcome.type === 'unknown-room') {
        // Relay has forgotten this room (ADR-0012's TTL lapsed or the
        // server restarted). Mark banner as stale instead of immediately
        // clearing — it renders dimmed and a second tap clears it.
        this.docService.endSession();
        this.jumpBackInStale.set(true);
        await this.toast(
          "That session isn't active anymore. Start a new one or join a fresh code.",
        );
        return;
      }

      if (outcome.type === 'password-required') {
        // Cache entry exists but room was later password-protected; redirect
        // to Join page which auto-fills the code and shows the password field.
        await this.router.navigate(['/join'], {
          queryParams: { code: cache.roomCode },
        });
        return;
      }

      if (outcome.type === 'rejected') {
        // Phase-5 rejection reasons land here once enforcement is on.
        this.docService.endSession();
        await this.toast(rejectionCopy(outcome.reason));
        return;
      }

      if (outcome.type === 'network-error') {
        // Network down — let user retry; don't clear the banner.
        await this.toast("Couldn't reach the relay. Check your connection and try again.");
        return;
      }

      // 'connected' or 'timeout' — navigate into the session
      const code = this.docService.roomCode();
      assertRoomCode(code, 'home.onResumeJumpBack');
      await this.router.navigate([routeForScreen(cache.lastScreen, code)], {
        replaceUrl: true,
      });
    } finally {
      this.resuming.set(false);
    }
  }

  private async loadBannerFromCache(): Promise<void> {
    const cache = await this.lastSessionService.get();
    if (!cache) {
      this.jumpBackInSummary.set(null);
      this.jumpBackInStale.set(false);
      return;
    }
    // Reset stale flag so returning from another screen doesn't keep a stale
    // banner sticky — the next tap will re-test via resolveRoom and re-set
    // stale if the room is still gone.
    this.jumpBackInStale.set(false);
    this.jumpBackInSummary.set(summaryFromCache(cache));
  }

  private async toast(message: string): Promise<void> {
    await this.toastService.error(message);
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
      const uuid = this.pendingRoomUuid;
      const code = this.docService.roomCode();
      if (!uuid || !code) {
        // Defensive: should never happen — createSession ran before this sheet opened.
        throw new Error('onPasswordSubmitted: no pending room uuid/code');
      }

      // Dismiss the modal (didDismiss binding resets the signal)
      await this.passwordModalRef()?.dismiss();

      // If password is non-empty, hash and apply it
      if (password.trim()) {
        const hash = await hashPassword(password, uuid);
        await patchRoomAccess(this.appPrefs.relayHttpUrl() ?? environment.relayHttpUrl, uuid, hash);
      }
      // If empty password, room stays in open mode (created that way by default)

      await this.router.navigate(['/lobby', code]);
    } catch {
      const code = this.docService.roomCode();
      await this.toast('Failed to set password. Room created without password.');
      if (code) {
        await this.router.navigate(['/lobby', code]);
      } else {
        await this.router.navigate(['/home']);
      }
    }
  }

  /**
   * Handler for cancel/close from the password prompt sheet.
   * Navigates to lobby without setting a password (open mode).
   */
  protected async onPasswordPromptClosed(): Promise<void> {
    await this.passwordModalRef()?.dismiss();
    const code = this.docService.roomCode();
    if (!code) {
      throw new Error('onPasswordPromptClosed: docService.roomCode() is null — no active session');
    }
    await this.router.navigate(['/lobby', code]);
  }
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

function summaryFromCache(cache: LastSessionCache): JumpBackInSummary {
  return {
    roomCode: cache.roomCode,
    lastScreen: cache.lastScreen,
  };
}

function routeForScreen(screen: LastSessionScreen, code: string): string {
  switch (screen) {
    case 'lobby':
      return `/lobby/${code}`;
    case 'estimating':
      return `/estimating/${code}`;
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
      return "That session isn't active anymore.";
    case 'wrong-password':
      return 'That password is incorrect.';
    case 'invalid-invite':
      return "That invite link isn't valid.";
    case 'expired-invite':
      return 'That invite link has expired.';
    case 'invite-already-redeemed':
      return 'That invite link has already been used.';
    case 'room-full':
      return 'That room is full.';
    case 'malformed-credentials':
      return "Couldn't rejoin with the info on file.";
  }
}
