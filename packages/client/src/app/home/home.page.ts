import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { hashPassword, type JoinRejectionReason } from '@hnch/shared';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowForwardOutline,
  ellipsisHorizontalOutline,
  returnUpBackOutline,
} from 'ionicons/icons';

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
import { JumpBackInBannerComponent, type JumpBackInSummary } from './jump-back-in-banner.component';
import { PasswordPromptSheetComponent } from './password-prompt.sheet';
import { presentSheet } from '../utils/present-sheet';
import { ActionMenuService } from '../shared/ui/action-menu.service';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { SectionCardComponent } from '../shared/ui/section-card.component';

/**
 * Home launchpad — ux.md §5.2.
 *
 * Two primary entry points (Create, Join) in a SectionCard, an optional
 * "Recent" SectionCard with a Jump-back-in banner above them, and a ⋯
 * action sheet that exposes Settings.
 *
 * PageHeader: eyebrow="welcome back", title="hnch" (Fraunces display-lg),
 * subtitle="Estimate by hunch."
 *
 * Rejoin outcome handling: on `unknown-room` tear the session down, clear
 * the cache, toast, and stay put; any other outcome navigates to the cached
 * `lastScreen`.
 */
@Component({
  selector: 'app-home',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonModal,
    IonTitle,
    IonToolbar,
    JumpBackInBannerComponent,
    PageHeaderComponent,
    PasswordPromptSheetComponent,
    SectionCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-title style="font: var(--hnch-title)">hnch</ion-title>
        <ion-buttons slot="end">
          <ion-button
            aria-label="More options"
            (click)="openMenu()"
          >
            <ion-icon slot="icon-only" name="ellipsis-horizontal-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <div class="page-body">
        <hnch-page-header
          eyebrow="welcome back"
          title="hnch"
          subtitle="Estimate by hunch."
        />

        <!-- Start a session card -->
        <hnch-section-card title="Start a session" class="actions-card">
          <div class="cta-row">
            <ion-button
              expand="block"
              color="primary"
              class="cta-btn"
              aria-label="Create room"
              (click)="onCreateRoom()"
            >
              <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
              Create room
            </ion-button>
            <ion-button
              expand="block"
              fill="outline"
              class="cta-btn"
              aria-label="Join room"
              (click)="onJoinRoom()"
            >
              <ion-icon slot="start" name="arrow-forward-outline" aria-hidden="true"></ion-icon>
              Join room
            </ion-button>
          </div>
        </hnch-section-card>

        <!-- Recent card (only when session cache exists) -->
        @if (jumpBackInSummary(); as summary) {
          <hnch-section-card title="Recent" class="recent-card">
            <app-jump-back-in-banner
              [summary]="summary"
              [stale]="jumpBackInStale()"
              [resuming]="resuming()"
              (resumeRequested)="onResumeJumpBack()"
            />
          </hnch-section-card>
        }
      </div>

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
      ion-content {
        --background: var(--hnch-bg);
      }
      .page-body {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-4);
        padding: 0 var(--hnch-sp-4) var(--hnch-sp-6);
        max-width: 720px;
        margin: 0 auto;
      }
      .cta-row {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-3);
      }
      .cta-btn {
        font: var(--hnch-title);
        --border-radius: var(--hnch-r-sm);
      }
      @media (min-width: 576px) {
        .cta-row {
          flex-direction: row;
        }
        .cta-btn {
          flex: 1;
        }
      }
    `,
  ],
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly actionMenuService = inject(ActionMenuService);
  private readonly toastService = inject(ToastService);
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly displayNameService = inject(DisplayNameService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly scalePrefs = inject(ScalePreferenceService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly docService = inject(DocService);
  private readonly roomJoinService = inject(RoomJoinService);

  protected readonly jumpBackInSummary = signal<JumpBackInSummary | null>(null);
  protected readonly jumpBackInStale = signal(false);
  protected readonly resuming = signal(false);

  private creating = false;

  protected readonly passwordPromptOpen = signal(false);
  private pendingRoomUuid: string | null = null;

  private readonly passwordModalRef = viewChild<IonModal>('passwordModal');

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'arrow-forward-outline': arrowForwardOutline,
      'ellipsis-horizontal-outline': ellipsisHorizontalOutline,
      'return-up-back-outline': returnUpBackOutline,
    });
    void this.loadBannerFromCache();
  }

  ionViewWillEnter(): void {
    void this.loadBannerFromCache();
  }

  protected async onCreateRoom(): Promise<void> {
    if (this.creating) return;
    this.creating = true;

    try {
      const [displayName, participantId, minted] = await Promise.all([
        this.displayNameService.getDisplayName(),
        this.participantIdService.getOrCreateId(),
        mintRoom(this.appPrefs.relayHttpUrl() ?? environment.relayHttpUrl),
      ]);

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

      this.docService.connect({
        roomCode: minted.code,
        deviceId: participantId,
      });

      if (this.appPrefs.defaultPassword()) {
        this.pendingRoomUuid = minted.uuid;
        const modal = this.passwordModalRef();
        if (modal) void presentSheet({ modal });
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

  protected async onResumeJumpBack(): Promise<void> {
    if (this.jumpBackInStale()) {
      await this.lastSessionService.clear();
      this.jumpBackInSummary.set(null);
      this.jumpBackInStale.set(false);
      return;
    }
    if (this.resuming()) return;
    this.resuming.set(true);
    try {
      const cache = await this.lastSessionService.get();
      if (!cache) {
        this.jumpBackInSummary.set(null);
        this.jumpBackInStale.set(false);
        return;
      }

      const outcome = await this.roomJoinService.rejoin(cache.roomCode);

      if (outcome.type === 'unknown-room') {
        this.docService.endSession();
        this.jumpBackInStale.set(true);
        await this.toast(
          "That session isn't active anymore. Start a new one or join a fresh code.",
        );
        return;
      }

      if (outcome.type === 'password-required') {
        await this.router.navigate(['/join'], { queryParams: { code: cache.roomCode } });
        return;
      }

      if (outcome.type === 'rejected') {
        this.docService.endSession();
        await this.toast(rejectionCopy(outcome.reason));
        return;
      }

      if (outcome.type === 'network-error') {
        await this.toast("Couldn't reach the relay. Check your connection and try again.");
        return;
      }

      const code = this.docService.roomCode();
      assertRoomCode(code, 'home.onResumeJumpBack');
      await this.router.navigate([routeForScreen(cache.lastScreen, code)], { replaceUrl: true });
    } finally {
      this.resuming.set(false);
    }
  }

  protected async openMenu(): Promise<void> {
    const id = await this.actionMenuService.open(
      [
        { id: 'settings', label: 'Settings', icon: 'settings-outline' },
        { id: 'cancel', label: 'Cancel', role: 'cancel' },
      ],
      { header: 'hnch' },
    );
    if (id === 'settings') {
      await this.router.navigate(['/settings']);
    }
  }

  private async loadBannerFromCache(): Promise<void> {
    const cache = await this.lastSessionService.get();
    if (!cache) {
      this.jumpBackInSummary.set(null);
      this.jumpBackInStale.set(false);
      return;
    }
    this.jumpBackInStale.set(false);
    this.jumpBackInSummary.set(summaryFromCache(cache));
  }

  private async toast(message: string): Promise<void> {
    await this.toastService.error(message);
  }

  protected async onPasswordSubmitted(password: string): Promise<void> {
    try {
      const uuid = this.pendingRoomUuid;
      const code = this.docService.roomCode();
      if (!uuid || !code) {
        throw new Error('onPasswordSubmitted: no pending room uuid/code');
      }

      await this.passwordModalRef()?.dismiss();
      this.passwordPromptOpen.set(false);

      if (password.trim()) {
        const hash = await hashPassword(password, uuid);
        await patchRoomAccess(this.appPrefs.relayHttpUrl() ?? environment.relayHttpUrl, uuid, hash);
      }

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

  protected async onPasswordPromptClosed(): Promise<void> {
    await this.passwordModalRef()?.dismiss();
    this.passwordPromptOpen.set(false);
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
