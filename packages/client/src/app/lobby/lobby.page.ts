import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Share } from '@capacitor/share';
import { formatRoomCode, participantRole } from '@hnch/shared';
import type { Round } from '@hnch/shared';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonList,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  chevronForwardOutline,
  ellipsisHorizontalCircle,
  pencilOutline,
  qrCodeOutline,
  shareOutline,
} from 'ionicons/icons';

import { ConnectionChipComponent } from '../core/connection-chip.component';
import { ConnectionStatusBannerComponent } from '../shared/connection-status-banner.component';
import { ExportService } from '../core/export.service';
import { ToastService } from '../services/toast.service';
import { DocService } from '../core/doc/doc.service';
import { HapticService } from '../core/haptic.service';
import { LastSessionService } from '../core/last-session.service';
import { ParticipantIdService } from '../core/participant-id.service';
import {
  RoundStartSheetComponent,
  type RoundStartSubmission,
} from '../round-start/round-start.sheet';
import { RoundEditSheetComponent } from './round-edit.sheet';
import { SessionSettingsSheetComponent } from '../session-settings/session-settings.sheet';
import { RoundHistoryComponent } from '../shared/round-history.component';
import { VoteResultsComponent } from '../shared/vote-results.component';
import { assertRoomCode } from '../core/room-join.service';
import { shouldRecordCache } from '../core/cache-record-guard';
import { QrDisplaySheetComponent } from './qr-display.sheet';
import { presentSheet } from '../utils/present-sheet';
import { rejectionCopy } from '../join/join.page';
import { summarizeParticipants } from './lobby-summary';
import { ActionMenuService } from '../shared/ui/action-menu.service';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { ParticipantRowComponent } from '../shared/ui/participant-row.component';
import { SectionCardComponent } from '../shared/ui/section-card.component';

/**
 * Lobby — ux.md §5.4.
 *
 * Redesigned layout (Phase D):
 *  - Giant `62BFVN` hero removed. Code lives in a SectionCard (mobile-only).
 *  - PageHeader eyebrow="lobby" title=roomName subtitle=participantCount·scale.
 *  - Mobile toolbar: roomName (Inter Tight), ⋯ ActionMenu, ion-back-button for soft exit.
 *  - SectionCard "Code" (ion-hide-lg-up) — segmented code + Share + QR in footer.
 *  - SectionCard "Participants" — flat hnch-participant-row list (NO accordion).
 *  - SectionCard "Round history" — RoundHistoryComponent.
 *  - SectionCard "Scale" — preset name + session-settings tap.
 *  - VoteResults card between Participants and Round history on reveal.
 *  - Footer (host only): Start/Next round + Re-vote.
 */
@Component({
  selector: 'app-lobby',
  host: { class: 'ion-page' },
  imports: [
    ConnectionChipComponent,
    ConnectionStatusBannerComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonList,
    IonModal,
    IonTitle,
    IonToolbar,
    PageHeaderComponent,
    ParticipantRowComponent,
    QrDisplaySheetComponent,
    RoundEditSheetComponent,
    RoundHistoryComponent,
    RoundStartSheetComponent,
    SectionCardComponent,
    SessionSettingsSheetComponent,
    VoteResultsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button
            aria-label="Back to home"
            (click)="softExit()"
          >
            <ion-icon slot="icon-only" name="chevron-back-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title style="font: var(--hnch-title)">{{ roomName() }}</ion-title>
        <ion-buttons slot="end">
          <app-connection-chip></app-connection-chip>
          <ion-button aria-label="More options" (click)="openMenu()">
            <ion-icon slot="icon-only" name="ellipsis-horizontal-circle"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="page-body">
        <app-connection-status-banner />

        <hnch-page-header
          eyebrow="lobby"
          [title]="roomName()"
          [subtitle]="pageSubtitle()"
        />

        <!-- Code card (mobile only) -->
        <hnch-section-card class="code-card ion-hide-lg-up">
          <div class="code-display">
            <span class="code-text" aria-label="Room code {{ formattedRoomCode() }}">
              {{ formattedRoomCode() }}
            </span>
          </div>
          <div footer class="code-actions">
            <ion-button
              fill="clear"
              size="small"
              aria-label="Share invite"
              (click)="onShareInvite()"
            >
              <ion-icon slot="start" name="share-outline" aria-hidden="true"></ion-icon>
              Share
            </ion-button>
            <ion-button
              fill="clear"
              size="small"
              aria-label="Show QR code"
              (click)="onShowQr()"
            >
              <ion-icon slot="start" name="qr-code-outline" aria-hidden="true"></ion-icon>
              QR code
            </ion-button>
          </div>
        </hnch-section-card>

        <!-- Participants card (NO accordion) -->
        <hnch-section-card title="Participants">
          <ion-list lines="none" class="participants-list">
            @for (p of activeParticipants(); track p.id) {
              <hnch-participant-row
                [participant]="p"
                [isMe]="p.id === myId()"
                [isHost]="p.id === hostId()"
                [canEditRole]="p.id === myId()"
                [online]="onlineIds().has(p.id)"
                [canKick]="isHost() && p.id !== myId()"
                (roleChange)="onRoleChange(p.id, $event)"
                (kick)="onRemoveTap(p.id, p.displayName)"
              />
            }
          </ion-list>
          <p footer class="participants-footer">
            {{ participantsSummary() }}
          </p>
        </hnch-section-card>

        <!-- VoteResults appears when latest round is revealed -->
        @if (lastRevealedRound(); as round) {
          <hnch-section-card class="results-card">
            <div class="results-header-row">
              <h2 class="results-heading">Round {{ lastRevealedRoundIndex() }} Results</h2>
              @if (round.title) {
                <p class="results-descriptor">{{ round.title }}</p>
              } @else if (isHost()) {
                <p class="results-descriptor placeholder">Add a descriptor</p>
              }
              @if (isHost()) {
                <ion-button
                  fill="clear"
                  size="small"
                  class="edit-btn"
                  aria-label="Edit round descriptor"
                  (click)="openRoundEdit(round)"
                >
                  <ion-icon name="pencil-outline" slot="icon-only" aria-hidden="true" />
                </ion-button>
              }
            </div>
            <app-vote-results
              [round]="round"
              [participants]="participants()"
              [myId]="myId()"
            />
          </hnch-section-card>
        }

        <!-- Round history -->
        @if (pastRevealedRounds().length > 0) {
          <hnch-section-card title="Round history">
            <app-round-history
              [rounds]="pastRevealedRounds()"
              [participants]="participants()"
              [isHost]="isHost()"
              (editTriggered)="openRoundEditById($event)"
            />
          </hnch-section-card>
        }

        <!-- Scale card -->
        <hnch-section-card title="Scale">
          <button
            type="button"
            class="scale-btn"
            aria-label="Change scale: {{ scaleName() }}"
            (click)="openSessionSettings()"
          >
            <span class="scale-name">{{ scaleName() }}</span>
            <ion-icon name="chevron-forward-outline" class="scale-chevron" aria-hidden="true"></ion-icon>
          </button>
        </hnch-section-card>
      </div>
    </ion-content>

    @if (isHost()) {
      <ion-footer>
        <div class="footer-inner">
          @if (lastRevealedRound()) {
            <ion-button
              expand="block"
              fill="outline"
              class="footer-btn"
              (click)="onRevote()"
            >
              Re-vote
            </ion-button>
            <ion-button
              expand="block"
              color="primary"
              class="footer-btn"
              (click)="openRoundStart()"
            >
              Next Round {{ nextRoundNumber() }}
            </ion-button>
          } @else {
            <ion-button
              expand="block"
              color="primary"
              class="footer-btn"
              [disabled]="!hasSession()"
              (click)="openRoundStart()"
            >
              Start Round {{ nextRoundNumber() }}
            </ion-button>
          }
        </div>
      </ion-footer>
    }

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
          [accessMode]="lobbyAccessMode()"
          [accessPassword]="lobbyAccessPassword()"
          [isHost]="isHost()"
          (accessChanged)="onAccessChanged($event)"
          (closeRequested)="closeSessionSettings()"
        />
      </ng-template>
    </ion-modal>

    <ion-modal
      #qrModal
      [isOpen]="qrOpen()"
      (didDismiss)="qrOpen.set(false)"
    >
      <ng-template>
        <app-qr-display-sheet
          [inviteUrl]="inviteUrl()"
          [roomCode]="formattedRoomCode()"
          (closeRequested)="closeQr()"
        />
      </ng-template>
    </ion-modal>

    <ion-modal
      [isOpen]="roundEditOpen()"
      [breakpoints]="[0, 0.6, 0.95]"
      [initialBreakpoint]="0.6"
      (didDismiss)="onRoundEditDismiss()"
    >
      <ng-template>
        @if (editingRound(); as round) {
          <app-round-edit-sheet
            [roundNumber]="editingRoundNumber()"
            [initialTitle]="round.title ?? null"
            [initialDescription]="round.description ?? null"
            (submitted)="onRoundEditSave($event)"
          />
        }
      </ng-template>
    </ion-modal>
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
      /* Code card */
      .code-display {
        display: flex;
        justify-content: center;
        padding-block: var(--hnch-sp-2);
      }
      .code-text {
        font: var(--hnch-numeral-lg);
        letter-spacing: var(--hnch-numeral-tracking);
        color: var(--hnch-text);
        font-variant-numeric: tabular-nums;
      }
      .code-actions {
        display: flex;
        justify-content: center;
        gap: var(--hnch-sp-3);
        padding-block: var(--hnch-sp-2) var(--hnch-sp-3);
        border-top: 1px solid var(--hnch-muted-2);
      }
      /* Participants */
      .participants-list {
        margin: 0;
        padding: 0;
      }
      .participants-footer {
        margin: var(--hnch-sp-2) var(--hnch-sp-4) 0;
        font: var(--hnch-body-sm);
        color: var(--hnch-muted);
        padding-top: var(--hnch-sp-2);
        border-top: 1px solid var(--hnch-muted-2);
      }
      /* Results */
      .results-header-row {
        display: flex;
        align-items: flex-start;
        gap: var(--hnch-sp-2);
        margin-bottom: var(--hnch-sp-3);
        flex-wrap: wrap;
      }
      .results-heading {
        margin: 0;
        font: var(--hnch-title);
        flex: 1;
      }
      .results-descriptor {
        margin: 0;
        font: var(--hnch-body-sm);
        color: var(--hnch-muted);
        width: 100%;
      }
      .results-descriptor.placeholder {
        font-style: italic;
      }
      .edit-btn {
        --padding-start: var(--hnch-sp-1);
        --padding-end: var(--hnch-sp-1);
        margin: 0;
      }
      /* Scale */
      .scale-btn {
        appearance: none;
        background: transparent;
        border: none;
        padding: var(--hnch-sp-1) 0;
        display: flex;
        align-items: center;
        gap: var(--hnch-sp-2);
        cursor: pointer;
        width: 100%;
        font: var(--hnch-body);
        color: var(--hnch-text);
      }
      .scale-btn:focus-visible {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: 2px;
        border-radius: var(--hnch-r-xs);
      }
      .scale-name {
        flex: 1;
        text-align: left;
      }
      .scale-chevron {
        font-size: 16px;
        color: var(--hnch-muted);
      }
      /* Footer */
      ion-footer {
        --background: var(--hnch-bg);
        box-shadow: none;
      }
      .footer-inner {
        display: flex;
        gap: var(--hnch-sp-3);
        padding: var(--hnch-sp-3) var(--hnch-sp-4) var(--hnch-sp-6);
        max-width: 720px;
        margin: 0 auto;
      }
      .footer-btn {
        flex: 1;
        font: var(--hnch-title);
        --border-radius: var(--hnch-r-sm);
      }
    `,
  ],
})
export class LobbyPage {
  private readonly router = inject(Router);
  private readonly docService = inject(DocService);
  private readonly haptic = inject(HapticService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastService = inject(ToastService);
  private readonly exportService = inject(ExportService);
  private readonly actionMenuService = inject(ActionMenuService);

  protected readonly hasSession = this.docService.hasSession;
  protected readonly participants = this.docService.participants;
  protected readonly activeParticipants = this.docService.activeParticipants;
  protected readonly onlineIds = this.docService.onlineParticipantIds;
  protected readonly rounds = this.docService.rounds;

  protected readonly roundStartOpen = signal(false);
  protected readonly sessionSettingsOpen = signal(false);
  protected readonly qrOpen = signal(false);
  protected readonly roundEditOpen = signal(false);
  protected readonly editingRound = signal<Round | null>(null);
  protected readonly lobbyAccessMode = signal<'open' | 'password'>('open');
  protected readonly lobbyAccessPassword = signal('');

  protected readonly myId = this.participantIdService.id;
  protected readonly hostId = computed(() => this.docService.settings()?.hostParticipantId ?? null);

  protected readonly isHost = computed(() => {
    const hostId = this.hostId();
    const myId = this.myId();
    return !!myId && !!hostId && myId === hostId;
  });

  protected readonly roomCode = this.docService.roomCode;

  protected readonly roomName = computed(() => {
    const settings = this.docService.settings();
    return settings?.name || 'Lobby';
  });

  protected readonly formattedRoomCode = computed(() => {
    const code = this.roomCode();
    return code ? formatRoomCode(code) : '';
  });

  protected readonly scaleName = computed(() => {
    const settings = this.docService.settings();
    if (!settings?.defaultScale) return '—';
    return formatScaleId(settings.defaultScale.id);
  });

  protected readonly pageSubtitle = computed(() => {
    const count = this.activeParticipants().length;
    const scale = this.scaleName();
    return `${count} participant${count === 1 ? '' : 's'} · ${scale}`;
  });

  protected readonly inviteUrl = computed(() => {
    const code = this.roomCode();
    if (!code) return '';
    const base = `${window.location.origin}/join?code=${code}`;
    return this.lobbyAccessMode() === 'password' ? `${base}&pw=1` : base;
  });

  protected readonly nextRoundNumber = computed(() => this.rounds().length + 1);

  protected readonly lastRevealedRound = computed(() => {
    const rounds = this.rounds();
    for (let i = rounds.length - 1; i >= 0; i--) {
      const r = rounds[i]!;
      if (r.revealedAt !== undefined) return r;
    }
    return null;
  });

  protected readonly lastRevealedRoundIndex = computed(() => {
    const round = this.lastRevealedRound();
    if (!round) return null;
    const idx = this.rounds().findIndex((r) => r.id === round.id);
    return idx >= 0 ? idx + 1 : null;
  });

  protected readonly hasRevealedRounds = computed(() =>
    this.rounds().some((r) => r.revealedAt != null),
  );

  protected readonly participantsSummary = computed(() =>
    summarizeParticipants(
      this.activeParticipants(),
      this.onlineIds(),
      (p) => participantRole(p) === 'viewer',
    ),
  );

  protected readonly pastRevealedRounds = computed(() => {
    const rounds = this.rounds();
    const last = this.lastRevealedRound();
    if (!last) return [];
    return rounds.filter((r) => r.revealedAt !== undefined && r.id !== last.id);
  });

  protected readonly editingRoundNumber = computed<number>(() => {
    const round = this.editingRound();
    if (!round) return 1;
    const idx = this.rounds().findIndex((r) => r.id === round.id);
    return idx >= 0 ? idx + 1 : 1;
  });

  private readonly modalRef = viewChild<IonModal>('roundStartModal');
  private readonly sessionSettingsModalRef = viewChild<IonModal>('sessionSettingsModal');
  private readonly qrModalRef = viewChild<IonModal>('qrModal');

  private lastRecordedUuid: string | null = null;

  constructor() {
    addIcons({
      chevronBackOutline,
      chevronForwardOutline,
      ellipsisHorizontalCircle,
      pencilOutline,
      qrCodeOutline,
      shareOutline,
    });

    effect(() => {
      const code = this.docService.roomCode();
      const uuid = this.docService.meta()?.roomUuid;
      const status = this.docService.syncStatus();
      if (status !== 'connected') {
        this.lastRecordedUuid = null;
        return;
      }
      if (shouldRecordCache(code, uuid, status, this.lastRecordedUuid)) {
        this.lastRecordedUuid = uuid ?? null;
        void this.lastSessionService.record({
          roomCode: code!,
          roomUuid: uuid!,
          lastScreen: 'lobby',
        });
      }
    });

    effect(() => {
      const round = this.docService.currentRound();
      if (round && round.revealedAt === undefined) {
        const code = this.docService.roomCode();
        assertRoomCode(code, 'lobby.autoNav');
        void this.router.navigate(['/estimating', code]);
      }
    });

    effect(() => {
      const reason = this.docService.lastRejection();
      if (reason === null) return;
      const code = this.roomCode();
      void (async () => {
        this.docService.endSession();
        await this.toastService.error(rejectionCopy(reason));
        if (reason === 'wrong-password') {
          await this.router.navigate(['/join'], { queryParams: { code } });
        } else {
          await this.router.navigate(['/home']);
        }
      })();
    });
  }

  protected openRoundStart(): void {
    const modal = this.modalRef();
    if (modal) void presentSheet({ modal });
  }

  protected async onRoundStart(submission: RoundStartSubmission): Promise<void> {
    this.docService.startRound({
      ...(submission.title !== null && { title: submission.title }),
    });
    await this.modalRef()?.dismiss();
    this.roundStartOpen.set(false);
    const code = this.docService.roomCode();
    assertRoomCode(code, 'lobby.onRoundStart');
    await this.router.navigate(['/estimating', code]);
  }

  protected async onRevote(): Promise<void> {
    const round = this.lastRevealedRound();
    if (!round) return;
    this.docService.startRound({
      parentRoundId: round.id,
      ...(round.title !== undefined && { title: round.title }),
      ...(round.description !== undefined && { description: round.description }),
      ...(round.ticketId !== undefined && { ticketId: round.ticketId }),
    });
    const code = this.docService.roomCode();
    assertRoomCode(code, 'lobby.onRevote');
    await this.router.navigate(['/estimating', code]);
  }

  protected async openMenu(): Promise<void> {
    const items: { id: string; label: string; role?: 'destructive' | 'cancel'; icon?: string }[] = [
      { id: 'settings', label: 'Session settings', icon: 'settings-outline' },
    ];

    if (this.isHost()) {
      items.push({ id: 'edit-name', label: 'Edit room name', icon: 'pencil-outline' });
    }

    if (this.hasRevealedRounds()) {
      items.push({ id: 'copy-results', label: 'Copy results', icon: 'copy-outline' });
    }

    items.push({ id: 'leave', label: 'Leave session', role: 'destructive' });

    if (this.isHost()) {
      items.push({ id: 'end', label: 'End session for everyone', role: 'destructive' });
    }

    items.push({ id: 'cancel', label: 'Cancel', role: 'cancel' });

    const id = await this.actionMenuService.open(items, { header: 'Session' });
    switch (id) {
      case 'settings':
        this.openSessionSettings();
        break;
      case 'edit-name':
        await this.promptRoomName();
        break;
      case 'copy-results':
        await this.copyResults();
        break;
      case 'leave':
        await this.confirmLeave();
        break;
      case 'end':
        await this.confirmEndSession();
        break;
    }
  }

  private async promptRoomName(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Room name',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: this.roomName(),
          placeholder: 'Session name',
          attributes: { maxlength: 60 },
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data: { name: string }) => {
            const trimmed = data.name.trim();
            if (trimmed) {
              this.docService.updateSettings({ name: trimmed });
            }
          },
        },
      ],
    });
    await alert.present();
  }

  protected async confirmEndSession(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'End this session?',
      message: 'All participants will be disconnected.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'End session',
          role: 'destructive',
          handler: () => {
            this.haptic.impactHeavy();
            this.docService.endSessionForEveryone();
          },
        },
      ],
    });
    await alert.present();
  }

  protected openSessionSettings(): void {
    const modal = this.sessionSettingsModalRef();
    if (modal) void presentSheet({ modal });
  }

  protected async closeSessionSettings(): Promise<void> {
    await this.sessionSettingsModalRef()?.dismiss();
    this.sessionSettingsOpen.set(false);
  }

  protected onAccessChanged(selection: {
    mode: 'open' | 'password';
    password: string | null;
  }): void {
    this.lobbyAccessMode.set(selection.mode);
    this.lobbyAccessPassword.set(selection.password ?? '');
  }

  protected async onShareInvite(): Promise<void> {
    const url = this.inviteUrl();
    const formatted = this.formattedRoomCode();
    if (!url) return;
    try {
      await Share.share({
        title: 'Join my hnch session',
        text: `Room code: ${formatted}`,
        url,
        dialogTitle: 'Share invite',
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes('cancel')) return;
      await this.copyToClipboard(url, formatted);
    }
  }

  private async copyResults(): Promise<void> {
    try {
      const participantsRecord = Object.fromEntries(
        this.docService.participants().map((p) => [p.id, p]),
      );
      await this.exportService.copyRoundsAsMarkdown({
        rounds: this.docService.rounds(),
        participants: participantsRecord,
      });
      await this.toastService.info('Results copied');
    } catch (err: unknown) {
      console.warn('copyResults failed', err);
      await this.toastService.error('Clipboard unavailable');
    }
  }

  private async copyToClipboard(url: string, formattedCode: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      await this.toastService.info(`Invite link copied! (${formattedCode})`);
    } catch {
      await this.toastService.error('Could not share the invite link.');
    }
  }

  protected onShowQr(): void {
    const modal = this.qrModalRef();
    if (modal) void presentSheet({ modal });
  }

  protected async closeQr(): Promise<void> {
    await this.qrModalRef()?.dismiss();
    this.qrOpen.set(false);
  }

  protected openRoundEdit(round: Round): void {
    this.editingRound.set(round);
    this.roundEditOpen.set(true);
  }

  protected openRoundEditById(roundId: string): void {
    const round = this.rounds().find((r) => r.id === roundId);
    if (round) this.openRoundEdit(round);
  }

  protected onRoundEditDismiss(): void {
    this.roundEditOpen.set(false);
    this.editingRound.set(null);
  }

  protected onRoundEditSave(payload: { title: string; description: string | null }): void {
    const round = this.editingRound();
    if (!round) return;
    this.docService.updateRoundDescriptor(round.id, {
      title: payload.title,
      ...(payload.description !== null && { description: payload.description }),
    });
    this.roundEditOpen.set(false);
    this.editingRound.set(null);
  }

  protected softExit(): void {
    void this.router.navigate(['/home']);
  }

  protected async confirmLeave(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Leave session?',
      message: "You'll need the code to rejoin.",
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Leave',
          role: 'destructive',
          handler: () => {
            this.haptic.impactHeavy();
            void this.leaveSession();
          },
        },
      ],
    });
    await alert.present();
  }

  private async leaveSession(): Promise<void> {
    const selfId = this.myId();
    if (selfId) {
      this.docService.leaveSession(selfId);
      await this.docService.flushUpdates();
    }
    this.docService.endSession();
    await this.lastSessionService.clear();
    await this.router.navigate(['/home']);
  }

  /** Role change from ParticipantRowComponent (only fired for self). */
  protected onRoleChange(participantId: string, _newRole: 'voter' | 'viewer'): void {
    const myId = this.myId();
    if (participantId !== myId) return;
    this.haptic.impactLight();
    this.docService.toggleRole(participantId);
  }

  protected async onRemoveTap(participantId: string, displayName: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: `Remove ${displayName} from session?`,
      message:
        "They'll be disconnected and won't appear in the active roster. Their votes in past rounds stay in the round history.",
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            this.haptic.impactHeavy();
            const hostId = this.myId();
            if (hostId) {
              this.docService.removeParticipant(hostId, participantId);
            }
          },
        },
      ],
    });
    await alert.present();
  }
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

function formatScaleId(id: string): string {
  if (id.length === 0) return id;
  return id.charAt(0).toUpperCase() + id.slice(1);
}
