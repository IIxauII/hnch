import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { mintRoom } from '@hnch/shared';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, arrowForwardOutline, settingsOutline } from 'ionicons/icons';

import { AppPreferenceService } from '../core/app-preference.service';
import { AvatarColorService } from '../core/avatar-color.service';
import { SurfaceService } from '../core/surface.service';
import { ToastService } from '../services/toast.service';
import { DisplayNameService } from '../core/display-name.service';
import { DocService } from '../core/doc/doc.service';
import type { ClientLastSessionEntry } from '../core/last-session.service';
import { LastSessionService } from '../core/last-session.service';
import { ParticipantIdService } from '../core/participant-id.service';
import { rejectionCopy, RELAY_UNREACHABLE_COPY } from '../core/relay-copy';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { RoomJoinService } from '../core/room-join.service';
import { SessionAccessService } from '../core/session-access.service';
import { BrandMarkComponent } from '../shared/brand-mark.component';
import { RecentRoomsListComponent } from './recent-rooms-list.component';
import { PasswordPromptSheetComponent } from './password-prompt.sheet';
import { presentSheet } from '../utils/present-sheet';
import { greetingFor, routeForScreen } from './home.helpers';

/**
 * Home launchpad — ux.md §1.2, §1.5.
 *
 * Two entry points (New session, Join session) and, above them, the
 * sessions this device can still get back into. Settings is one tap away in
 * the header — it used to be the only item in an overflow menu.
 *
 * Rejoin outcome handling: we open the socket while still
 * mounted on Home and wait for the relay's verdict
 * (`RoomJoinService.rejoin`). A session the relay no longer knows drops its
 * entry; a refusal is reported; a session that is there opens on the screen
 * it was last seen on.
 *
 * One thing at a time: while a session is being created or rejoined, the
 * other ways into a session are switched off. Each of them starts by
 * tearing down whatever session is there.
 *
 * "New session" mints a fresh room on the relay (`POST /rooms`,
 * ADR-0016), seeds a `Y.Doc` with the returned UUID via DocService,
 * opens the y-websocket connection, then navigates to `/lobby`.
 */
@Component({
  selector: 'app-home',
  host: { class: 'ion-page' },
  imports: [
    BrandMarkComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonSpinner,
    IonToolbar,
    RecentRoomsListComponent,
    PasswordPromptSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <div class="brand" slot="start">
          <app-brand-mark [size]="32" />
          <span class="wordmark">hnch</span>
        </div>
        <ion-buttons slot="end">
          <ion-button aria-label="Settings" (click)="openSettings()">
            <ion-icon slot="icon-only" name="settings-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="page-container">
        <div class="hero">
          <h1>{{ greeting() }}</h1>
          <p>Estimate stories with your team. No account needed.</p>
        </div>

        @if (recentEntries().length > 0) {
          <h2 class="section-label">Jump back in</h2>
          <app-recent-rooms-list
            [entries]="recentEntries()"
            [busy]="busy()"
            (joinRequested)="onJoinEntry($event)"
            (removeRequested)="onRemoveEntry($event)"
          />
          <h2 class="section-label">Start fresh</h2>
        }

        <ion-list inset="true" class="actions">
          <ion-item
            button="true"
            detail="true"
            [disabled]="busy()"
            (click)="onCreateRoom()"
          >
            <div class="icon-tile icon-tile--accent" slot="start" aria-hidden="true">
              <ion-icon name="add-outline"></ion-icon>
            </div>
            <ion-label>
              <h3>New session</h3>
              <p>Host an estimation for your team</p>
            </ion-label>
            @if (creating()) {
              <ion-spinner slot="end" name="crescent" aria-label="Creating session"></ion-spinner>
            }
          </ion-item>
          <ion-item button="true" detail="true" [disabled]="busy()" (click)="onJoinRoom()">
            <div class="icon-tile icon-tile--neutral" slot="start" aria-hidden="true">
              <ion-icon name="arrow-forward-outline"></ion-icon>
            </div>
            <ion-label>
              <h3>Join session</h3>
              <p>Enter a code or scan a QR code</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </div>

      <!-- Password prompt half-sheet -->
      <ion-modal
        #passwordModal
        cssClass="modal-centered modal-compact"
        [isOpen]="passwordPromptOpen()"
        [breakpoints]="surface.sheetBreakpoints()"
        [initialBreakpoint]="surface.initialSheetBreakpoint()"
        (didDismiss)="onPasswordSheetDismissed()"
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
      @use '../../theme/page-container' as *;
      @include page-container(560px);

      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-inline-start: 16px;
      }
      .wordmark {
        color: var(--hnch-text);
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .hero {
        padding: 16px 4px 8px;
      }
      .hero h1 {
        margin: 0 0 6px;
        color: var(--hnch-text);
        font-size: 28px;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.15;
        overflow-wrap: anywhere;
      }
      .hero p {
        margin: 0;
        color: var(--hnch-muted);
        font-size: 16px;
        line-height: 1.4;
      }
      ion-list.actions {
        margin-block: 16px 0;
        background: transparent;
      }
      .section-label + ion-list.actions {
        margin-block-start: 0;
      }
      ion-item {
        --inner-padding-top: 12px;
        --inner-padding-bottom: 12px;
        --padding-start: 16px;
      }
      ion-item h3 {
        margin: 0 0 2px;
        color: var(--hnch-text);
        font-size: 17px;
        font-weight: 600;
      }
      ion-item p {
        margin: 0;
        color: var(--hnch-muted);
        font-size: 14px;
      }
      ion-spinner {
        width: 20px;
        height: 20px;
        color: var(--hnch-muted);
      }
    `,
  ],
})
export class HomePage {
  private readonly router = inject(Router);
  protected readonly surface = inject(SurfaceService);
  private readonly toastService = inject(ToastService);
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly avatarColorService = inject(AvatarColorService);
  private readonly displayNameService = inject(DisplayNameService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly scalePrefs = inject(ScalePreferenceService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly access = inject(SessionAccessService);
  private readonly docService = inject(DocService);
  private readonly roomJoinService = inject(RoomJoinService);

  /** Sessions this device can still rejoin (up to 5, most recent first). */
  protected readonly recentEntries = signal<ClientLastSessionEntry[]>([]);

  /** "Hi, Alex" once the stored name has loaded; a neutral line until then. */
  protected readonly greeting = signal(greetingFor(null));

  /**
   * `true` while a rejoin is in flight. Disables the recent-session rows so
   * double-taps are swallowed, and guards `onJoinEntry` against re-entry.
   */
  protected readonly resuming = signal(false);

  /**
   * `true` from the tap on "New session" until the Lobby is on screen or the
   * attempt has failed. Disables the row and shows its spinner — minting the
   * room is a network round-trip, and a row that does nothing on tap reads
   * as broken.
   */
  protected readonly creating = signal(false);

  /** A session is being created or rejoined: one way in at a time. */
  protected readonly busy = computed(() => this.creating() || this.resuming());

  /**
   * State for the password prompt half-sheet. Opened after room is
   * minted if appPrefs.defaultPassword() is true.
   */
  protected readonly passwordPromptOpen = signal(false);

  /**
   * UUID of a room that has been minted but whose Lobby is not on screen
   * yet, because the password sheet is still up. `null` otherwise.
   */
  private pendingRoomUuid: string | null = null;

  private readonly passwordModalRef = viewChild<IonModal>('passwordModal');

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'arrow-forward-outline': arrowForwardOutline,
      'settings-outline': settingsOutline,
    });
    void this.refresh();
  }

  ionViewWillEnter(): void {
    void this.refresh();
  }

  protected async onCreateRoom(): Promise<void> {
    // Guard against double-tap; the mint and both Preferences reads are async.
    if (this.busy()) return;
    this.creating.set(true);

    try {
      // The displayNameGuard has already ensured this is non-null
      // before we ever rendered, so the `?? ''` fallback is defense
      // in depth rather than an expected branch.
      let displayName: string | null;
      let participantId: string;
      let minted: Awaited<ReturnType<typeof mintRoom>>;
      try {
        [displayName, participantId, minted] = await Promise.all([
          this.displayNameService.getDisplayName(),
          this.participantIdService.getOrCreateId(),
          // Mint the room on the relay (ADR-0016 `POST /rooms`).
          // Use AppPreferenceService relay URL override, fallback to environment default.
          mintRoom(this.appPrefs.resolvedRelayHttpUrl()),
        ]);
      } catch {
        // The relay never answered (offline, wrong relay URL, relay down). No
        // session exists yet, so there is nothing to clean up — say so and
        // let the user try again.
        await this.toast(RELAY_UNREACHABLE_COPY);
        return;
      }

      // Tear down any leftover session (e.g. back-nav from a prior
      // flow that bailed early) so createSession's single-session
      // invariant holds.
      this.docService.teardown();
      const defaultSessionName = this.appPrefs.defaultSessionName();
      const avatarColor = this.avatarColorService.value();
      this.docService.createSession({
        participantId,
        displayName: displayName ?? '',
        defaultScale: this.scalePrefs.defaultScale(),
        ...(defaultSessionName && { sessionName: defaultSessionName }),
        ...(avatarColor && { avatarColor }),
        roomUuid: minted.uuid,
        roomCode: minted.code,
      });

      // Open the sync connection so our own writes propagate.
      this.docService.connect(
        { roomCode: minted.code, deviceId: participantId },
        { roomUuid: minted.uuid },
      );

      // If defaultPassword is enabled, show password prompt; otherwise
      // navigate to lobby directly.
      if (this.appPrefs.defaultPassword()) {
        this.pendingRoomUuid = minted.uuid;
        const modal = this.passwordModalRef();
        if (modal) void presentSheet({ modal });
      } else {
        await this.router.navigate(['/lobby', minted.code]);
      }
    } finally {
      this.creating.set(false);
    }
  }

  protected async onJoinRoom(): Promise<void> {
    if (this.busy()) return;
    await this.router.navigate(['/join']);
  }

  protected openSettings(): void {
    void this.router.navigate(['/settings']);
  }

  /** Tap on a recent-session row. */
  protected async onJoinEntry(entry: ClientLastSessionEntry): Promise<void> {
    if (this.busy()) return;
    this.resuming.set(true);
    try {
      await this.doRejoin(entry);
    } finally {
      this.resuming.set(false);
    }
  }

  /** Remove a session from the list. */
  protected async onRemoveEntry(roomUuid: string): Promise<void> {
    await this.lastSessionService.removeByUuid(roomUuid);
    await this.loadEntriesFromCache();
  }

  /**
   * Fast-path rejoin. Prechecks via `GET /rooms/:code` to detect `unknown-room` (relay
   * denies pre-upgrade with HTTP 404, not a WS close code), then opens
   * the socket; any post-upgrade rejection is handled by the existing
   * `waitForJoinOutcome` race.
   */
  private async doRejoin(cache: ClientLastSessionEntry): Promise<void> {
    // A password this device already entered rides along (ADR-0044), so
    // getting back into a protected session is one tap, same as a reload.
    const passwordHash = cache.passwordHash;
    const outcome = await this.roomJoinService.rejoin(cache.roomCode, {
      expectedUuid: cache.roomUuid,
      ...(passwordHash ? { passwordHash } : {}),
    });

    if (outcome.type === 'unknown-room') {
      // Relay has forgotten this room (ADR-0012's TTL lapsed or the
      // server restarted). The entry can never work again — drop it. A
      // session still running in the background is another one, and stays.
      await this.lastSessionService.removeByUuid(cache.roomUuid);
      await this.loadEntriesFromCache();
      await this.toast(rejectionCopy('unknown-room', 'rejoin'));
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
      if (outcome.reason === 'wrong-password') {
        // The host changed the password since we cached ours. Forget the
        // stale hash and hand over to Join, which asks for the new one.
        await this.lastSessionService.clearPasswordHash(cache.roomUuid);
        await this.router.navigate(['/join'], {
          queryParams: { code: cache.roomCode },
        });
        return;
      }
      await this.toast(rejectionCopy(outcome.reason, 'rejoin'));
      return;
    }

    if (outcome.type === 'network-error') {
      // Network down — let user retry; keep the entry.
      await this.toast(RELAY_UNREACHABLE_COPY);
      return;
    }

    // The session went away while this was waiting on it — the host had
    // already ended it, say. Whoever closed it has told the user.
    if (outcome.type === 'superseded') return;

    // 'connected' or 'timeout' — go into the session, if it is still there.
    const code = this.docService.roomCode();
    if (code === null) return;
    if (passwordHash && outcome.type === 'connected') {
      // The relay took the hash again: keep it, with a fresh lease.
      await this.lastSessionService.rememberPasswordHash(cache.roomUuid, passwordHash);
    }
    const screen = cache.lastScreen ?? 'lobby';
    await this.router.navigate([routeForScreen(screen, code)], {
      replaceUrl: true,
    });
  }

  private async refresh(): Promise<void> {
    await Promise.all([this.loadEntriesFromCache(), this.loadGreeting()]);
  }

  private async loadEntriesFromCache(): Promise<void> {
    this.recentEntries.set(await this.lastSessionService.list());
  }

  private async loadGreeting(): Promise<void> {
    this.greeting.set(greetingFor(await this.displayNameService.getDisplayName()));
  }

  private async toast(message: string): Promise<void> {
    await this.toastService.error(message);
  }

  // Password prompt handlers
  //
  // The session already exists by the time this sheet is up, so every way out
  // of it — Done, Skip, a swipe down, a tap on the backdrop — has to end in
  // the Lobby. The two buttons only dismiss; `onPasswordSheetDismissed` is the
  // single place that navigates.

  /**
   * Done: apply the password if one was typed, then dismiss. A blank field is
   * the same as Skip — the room stays open, which is how it was created.
   */
  protected async onPasswordSubmitted(password: string): Promise<void> {
    // The same change the session's settings make later on, by the same
    // means: the relay is told, the socket carries the password from then
    // on, and the device remembers it for the host's own way back in.
    if ((await this.access.setPassword(password)) === 'failed') {
      await this.toast("Couldn't set the password. The session was created without one.");
    }
    await this.passwordModalRef()?.dismiss();
  }

  /** Skip: leave the room open. */
  protected async onPasswordPromptClosed(): Promise<void> {
    await this.passwordModalRef()?.dismiss();
  }

  /** The sheet is gone, however it went: carry on into the session. */
  protected async onPasswordSheetDismissed(): Promise<void> {
    this.passwordPromptOpen.set(false);
    if (this.pendingRoomUuid === null) return;
    this.pendingRoomUuid = null;
    const code = this.docService.roomCode();
    if (code === null) return;
    await this.router.navigate(['/lobby', code]);
  }
}
