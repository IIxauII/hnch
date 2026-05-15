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
import { formatRoomCode, getScaleLabel, terminalState } from '@hnch/shared';
import type { Round } from '@hnch/shared';
import {
  AlertController,
  IonAccordion,
  IonAccordionGroup,
  IonAvatar,
  IonButton,
  IonButtons,
  IonChip,
  IonCol,
  IonContent,
  IonFooter,
  IonGrid,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonRow,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  closeCircleOutline,
  copyOutline,
  ellipsisHorizontalCircle,
  logOutOutline,
  pencilOutline,
  personCircleOutline,
  personRemoveOutline,
  qrCodeOutline,
  settingsOutline,
  shareOutline,
  starOutline,
} from 'ionicons/icons';

import { ConnectionChipComponent } from '../core/connection-chip.component';
import { isParticipantViewer } from './lobby-helpers';
import { ConnectionStatusBannerComponent } from '../shared/connection-status-banner.component';
import { ExportService } from '../core/export.service';
import { SurfaceService } from '../core/surface.service';
import { ToastService } from '../services/toast.service';
import { DocService } from '../core/doc/doc.service';
import { HapticService } from '../core/haptic.service';
import { LastSessionService } from '../core/last-session.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
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
import { participantsAccordionValueFor, summarizeParticipants } from './lobby-summary';

/**
 * Lobby — ux.md §5.4 host variant.
 *
 * Phase 2 only renders the host view because there are no joiners
 * without a relay. Phase 3 will split this into host + joiner
 * subtemplates driven by `settings.hostParticipantId ===
 * myParticipantId`.
 *
 * Session-settings sheet is wired through the ⋯ menu and the
 * subtitle tap. Share invite uses `@capacitor/share` with a
 * clipboard fallback on web (ux.md §6.5).
 *
 * The Lobby owns the session's lifetime (plan §3.10): leaving here
 * — either via the top-left back control or the ⋯ → "Leave
 * session" entry — prompts an `ion-alert` confirmation per ux.md
 * §2 "Destructive actions" and calls `docService.endSession()`
 * before popping to Home. The native `ion-back-button` would pop
 * without running our confirmation, so we render a custom back
 * chevron that routes through the same handler.
 *
 * After a round is revealed, Estimating navigates back to Lobby.
 * Lobby shows the full VoteResultsComponent for the latest revealed
 * round, and RoundHistoryComponent for any older revealed rounds.
 * The host gets Re-vote and Next Round controls in the footer.
 */
@Component({
  selector: 'app-lobby',
  host: { class: 'ion-page' },
  imports: [
    ConnectionChipComponent,
    ConnectionStatusBannerComponent,
    IonAccordion,
    IonAccordionGroup,
    IonAvatar,
    IonButton,
    IonButtons,
    IonChip,
    IonCol,
    IonContent,
    IonFooter,
    IonGrid,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonModal,
    IonNote,
    IonRow,
    IonTitle,
    IonToolbar,
    QrDisplaySheetComponent,
    RoundEditSheetComponent,
    RoundHistoryComponent,
    RoundStartSheetComponent,
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
            <ion-icon
              slot="icon-only"
              name="chevron-back-outline"
            ></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>Lobby</ion-title>
        <ion-buttons slot="end">
          <app-connection-chip></app-connection-chip>
          <ion-button
            aria-label="More options"
            (click)="openActionSheet($event)"
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
      <ion-grid fixed class="page-container">
        <ion-row><ion-col>
      <app-connection-status-banner />
      @if (roomCode()) {
        <h1 class="room-code">{{ formattedRoomCode() }}</h1>
        <button
          type="button"
          class="subtitle"
          (click)="openSessionSettings()"
        >
          {{ subtitle() }}
        </button>
      }

      <ion-list lines="inset" class="actions">
        <ion-item button (click)="onShareInvite()">
          <ion-icon
            slot="start"
            name="share-outline"
            aria-hidden="true"
          ></ion-icon>
          <ion-label>Share invite</ion-label>
        </ion-item>
        <ion-item button (click)="onShowQr()">
          <ion-icon
            slot="start"
            name="qr-code-outline"
            aria-hidden="true"
          ></ion-icon>
          <ion-label>Show QR code</ion-label>
        </ion-item>
      </ion-list>

      <ion-accordion-group [value]="participantsAccordionValue()" expand="inset">
        <ion-accordion value="open">
          <ion-item slot="header" lines="inset">
            <ion-label>
              Participants ({{ activeParticipants().length }})
              @if (participantsSummary()) {
                <p class="participants-summary">{{ participantsSummary() }}</p>
              }
            </ion-label>
          </ion-item>
          <div slot="content">
            @if (isHost()) {
              <p class="swipe-hint">Swipe a row for host actions.</p>
            }
            <ion-list lines="inset" class="participants">
              @for (p of activeParticipants(); track p.id) {
                @if (isHost() && p.id !== myId()) {
                  <ion-item-sliding>
                    <ion-item
                      [class.offline]="!onlineIds().has(p.id)"
                      [attr.aria-label]="p.displayName"
                    >
                      <ion-avatar slot="start" aria-hidden="true">
                        <ion-icon name="person-circle-outline"></ion-icon>
                      </ion-avatar>
                      <ion-label>
                        {{ p.displayName }}
                        @if (p.id === hostId()) {
                          <ion-icon
                            name="star-outline"
                            class="host-icon"
                            aria-label="Host"
                          ></ion-icon>
                        }
                      </ion-label>
                      @if (isParticipantViewer(p)) {
                        <ion-note slot="end" aria-label="Observer">observer</ion-note>
                      } @else if (!onlineIds().has(p.id)) {
                        <ion-note slot="end">Offline</ion-note>
                      }
                    </ion-item>
                    <ion-item-options side="end">
                      <ion-item-option
                        color="primary"
                        [attr.aria-label]="'Make ' + p.displayName + ' host'"
                        (click)="onHandoffTap(p.id, p.displayName)"
                      >
                        <ion-icon slot="icon-only" name="star-outline"></ion-icon>
                      </ion-item-option>
                      <ion-item-option
                        color="danger"
                        [attr.aria-label]="'Remove ' + p.displayName + ' from session'"
                        (click)="onRemoveTap(p.id, p.displayName)"
                      >
                        <ion-icon slot="icon-only" name="person-remove-outline"></ion-icon>
                      </ion-item-option>
                    </ion-item-options>
                  </ion-item-sliding>
                } @else {
                  <ion-item
                    [class.offline]="!onlineIds().has(p.id)"
                    [attr.aria-label]="p.id === myId() ? 'You (' + p.displayName + ')' : p.displayName"
                  >
                    <ion-avatar slot="start" aria-hidden="true">
                      <ion-icon name="person-circle-outline"></ion-icon>
                    </ion-avatar>
                    <ion-label>
                      {{ p.id === myId() ? 'You (' + p.displayName + ')' : p.displayName }}
                      @if (p.id === hostId()) {
                        <ion-icon
                          name="star-outline"
                          class="host-icon"
                          aria-label="Host"
                        ></ion-icon>
                      }
                    </ion-label>
                    @if (p.id === myId()) {
                      <ion-chip
                        slot="end"
                        [color]="isParticipantViewer(p) ? 'medium' : 'primary'"
                        [attr.aria-label]="isParticipantViewer(p) ? 'You are observing. Tap to switch to voter.' : 'You are a voter. Tap to switch to observer.'"
                        [attr.aria-pressed]="isParticipantViewer(p)"
                        (click)="onToggleRole()"
                      >
                        <ion-label>{{ isParticipantViewer(p) ? 'Observing' : 'Voter' }}</ion-label>
                      </ion-chip>
                    } @else if (isParticipantViewer(p)) {
                      <ion-note slot="end" aria-label="Observer">observer</ion-note>
                    } @else if (!onlineIds().has(p.id)) {
                      <ion-note slot="end">Offline</ion-note>
                    }
                  </ion-item>
                }
              }
            </ion-list>
          </div>
        </ion-accordion>
      </ion-accordion-group>

      @if (lastRevealedRound(); as round) {
        <section class="results-section" aria-label="Round {{ lastRevealedRoundIndex() }} Results">
          <h2 class="results-heading">Round {{ lastRevealedRoundIndex() }} Results</h2>
          @if (lastRoundWasSkipped()) {
            <p class="round-skipped" role="status">Round skipped</p>
          } @else {
            <div class="results-descriptor-row">
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
                  <ion-icon name="pencil-outline" slot="icon-only" />
                </ion-button>
              }
            </div>
            <app-vote-results
              [round]="round"
              [participants]="participants()"
              [myId]="myId()"
            />
          }
        </section>
      }

      @if (pastRevealedRounds().length > 0) {
        <app-round-history
          [rounds]="pastRevealedRounds()"
          [participants]="participants()"
          [isHost]="isHost()"
          (editTriggered)="openRoundEditById($event)"
        />
      }
        </ion-col></ion-row>
      </ion-grid>
    </ion-content>

    @if (isHost()) {
      <ion-footer class="cta-bar">
        <ion-toolbar>
          @if (lastRevealedRound()) {
            @if (lastRoundWasSkipped()) {
              <ion-button
                expand="block"
                color="primary"
                (click)="openRoundStart()"
              >
                Next Round {{ nextRoundNumber() }}
              </ion-button>
            } @else {
              <div class="footer-row">
                <ion-button
                  expand="block"
                  fill="outline"
                  (click)="onRevote()"
                >
                  Re-vote
                </ion-button>
                <ion-button
                  expand="block"
                  color="primary"
                  (click)="openRoundStart()"
                >
                  Next Round {{ nextRoundNumber() }}
                </ion-button>
              </div>
            }
          } @else {
            <ion-button
              expand="block"
              color="primary"
              [disabled]="!hasSession()"
              (click)="openRoundStart()"
            >
              Start Round {{ nextRoundNumber() }}
            </ion-button>
          }
        </ion-toolbar>
      </ion-footer>
    }

    <ion-modal
      #roundStartModal
      cssClass="modal-centered"
      [isOpen]="roundStartOpen()"
      [breakpoints]="surface.sheetBreakpoints()"
      [initialBreakpoint]="surface.initialSheetBreakpoint()"
      (didDismiss)="roundStartOpen.set(false)"
    >
      <ng-template>
        <app-round-start-sheet
          [roundNumber]="nextRoundNumber()"
          (submitted)="onRoundStart($event)"
          (cancelled)="roundStartOpen.set(false)"
        />
      </ng-template>
    </ion-modal>

    <ion-modal
      #sessionSettingsModal
      cssClass="modal-centered"
      [isOpen]="sessionSettingsOpen()"
      [breakpoints]="surface.sheetBreakpoints()"
      [initialBreakpoint]="surface.initialSheetBreakpoint()"
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
      cssClass="modal-centered"
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
      cssClass="modal-centered"
      [isOpen]="roundEditOpen()"
      [breakpoints]="surface.sheetBreakpoints()"
      [initialBreakpoint]="surface.initialSheetBreakpoint()"
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
      @use '../../theme/breakpoints' as *;
      @use '../../theme/page-container' as *;
      @include page-container(800px);

      .room-code {
        font-size: 2.5rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        margin: 0.5rem 0 0.25rem;
      }
      .subtitle {
        appearance: none;
        background: transparent;
        border: none;
        padding: 0;
        color: var(--ion-color-medium);
        font: inherit;
        cursor: pointer;
        text-align: left;
      }
      .subtitle:focus-visible {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: 2px;
        border-radius: 4px;
      }
      .actions,
      .participants {
        margin-top: 1.25rem;
      }
      .participants-summary {
        margin: 0.125rem 0 0;
        font-size: 0.85rem;
        color: var(--ion-color-medium);
      }
      .swipe-hint {
        margin: 0.25rem 1rem 0.25rem;
        font-size: 0.8rem;
        color: var(--ion-color-medium);
      }
      ion-avatar ion-icon {
        font-size: 2rem;
        color: var(--ion-color-medium);
      }
      ion-item.offline ion-label {
        color: var(--ion-color-medium);
      }
      .host-icon {
        font-size: 1rem;
        color: var(--ion-color-medium);
        vertical-align: middle;
        margin-inline-start: 0.25rem;
      }
      .results-section {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 2px solid var(--hnch-sep);
      }
      .results-heading {
        font-size: 1.25rem;
        font-weight: 700;
        margin: 0 0 0.25rem;
      }
      .results-descriptor-row {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        margin-bottom: 0.75rem;
      }
      .results-descriptor {
        margin: 0;
        color: var(--ion-color-medium);
      }
      .results-descriptor.placeholder {
        color: var(--ion-color-medium);
        font-style: italic;
      }
      .edit-btn {
        --padding-start: 0.25rem;
        --padding-end: 0.25rem;
      }
      .round-skipped {
        margin: 0.5rem 0;
        color: var(--ion-color-medium);
        font-style: italic;
      }
      .footer-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem;
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
  private readonly scalePrefs = inject(ScalePreferenceService);
  protected readonly surface = inject(SurfaceService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastService = inject(ToastService);
  private readonly exportService = inject(ExportService);

  protected readonly hasSession = this.docService.hasSession;
  protected readonly participants = this.docService.participants;
  protected readonly activeParticipants = this.docService.activeParticipants;
  protected readonly onlineIds = this.docService.onlineParticipantIds;
  protected readonly rounds = this.docService.rounds;

  /** Round-start modal visibility. Two-way bound to `ion-modal`. */
  protected readonly roundStartOpen = signal(false);

  /** Session-settings modal visibility. Two-way bound to `ion-modal`. */
  protected readonly sessionSettingsOpen = signal(false);

  /** QR display modal visibility. */
  protected readonly qrOpen = signal(false);

  /** Round-edit modal visibility. */
  protected readonly roundEditOpen = signal(false);

  /** Round currently being edited, or null when no edit is open. */
  protected readonly editingRound = signal<Round | null>(null);

  /**
   * Access state lives here (not in SessionSettingsSheetComponent) so
   * it survives the modal's destroy/recreate lifecycle.
   */
  protected readonly lobbyAccessMode = signal<'open' | 'password'>('open');
  protected readonly lobbyAccessPassword = signal('');

  protected readonly myId = this.participantIdService.id;

  protected readonly hostId = computed(() => this.docService.settings()?.hostParticipantId ?? null);

  protected readonly isParticipantViewer = isParticipantViewer;

  /** Toggle own voter↔viewer role. Wired to the self-row chip. */
  protected onToggleRole(): void {
    const id = this.myId();
    if (!id) return;
    this.haptic.impactLight();
    this.docService.toggleRole(id);
  }

  protected readonly isHost = computed(() => {
    const hostId = this.hostId();
    const myId = this.myId();
    return !!myId && !!hostId && myId === hostId;
  });

  /**
   * Relay-assigned 6-character room code (ADR-0008). The code is
   * plumbed through `DocService` after `POST /rooms` resolves; schema.md
   * is explicit that codes do not live in the Yjs doc, so we read it
   * from the service's dedicated signal rather than `meta()`.
   */
  protected readonly roomCode = this.docService.roomCode;

  /** Invite URL derived from the room code + runtime origin (`window.location.origin`). */
  protected readonly inviteUrl = computed(() => {
    const code = this.roomCode();
    if (!code) return '';
    const base = `${window.location.origin}/join?code=${code}`;
    return this.lobbyAccessMode() === 'password' ? `${base}&pw=1` : base;
  });

  /** Dash-formatted room code for human display. */
  protected readonly formattedRoomCode = computed(() => {
    const code = this.roomCode();
    return code ? formatRoomCode(code) : '';
  });

  /** 1-based index for the "Start Round N" / "Next Round N" label. */
  protected readonly nextRoundNumber = computed(() => this.rounds().length + 1);

  protected readonly subtitle = computed(() => {
    const settings = this.docService.settings();
    if (!settings || !settings.defaultScale) return '';
    const round = this.nextRoundNumber();
    const scaleName = getScaleLabel(settings.defaultScale.id, this.scalePrefs.customScales());
    return `Round ${round} • ${scaleName}`;
  });

  /**
   * The most recently terminal round (revealed or skipped), or null if no
   * rounds have ended yet. Drives the inline results / skipped notice display.
   */
  protected readonly lastRevealedRound = computed(() => {
    const rounds = this.rounds();
    for (let i = rounds.length - 1; i >= 0; i--) {
      const r = rounds[i]!;
      if (terminalState(r) !== null) return r;
    }
    return null;
  });

  /**
   * True when `lastRevealedRound` was skipped rather than revealed.
   */
  protected readonly lastRoundWasSkipped = computed(() => {
    const r = this.lastRevealedRound();
    return r !== null && terminalState(r) === 'skipped';
  });

  /**
   * 1-based index of `lastRevealedRound` within `rounds()`.
   */
  protected readonly lastRevealedRoundIndex = computed(() => {
    const round = this.lastRevealedRound();
    if (!round) return null;
    const idx = this.rounds().findIndex((r) => r.id === round.id);
    return idx >= 0 ? idx + 1 : null;
  });

  /** True when at least one round has been revealed (gates "Copy results" button). */
  protected readonly hasRevealedRounds = computed(() =>
    this.rounds().some((r) => r.revealedAt != null),
  );

  /** True when at least one round has reached a terminal state (gates accordion collapse). */
  protected readonly hasTerminalRounds = computed(() =>
    this.rounds().some((r) => terminalState(r) !== null),
  );

  /**
   * Controls accordion open/closed state. Null collapses when a round
   * has reached a terminal state so results stay above the fold.
   */
  protected readonly participantsAccordionValue = computed(() =>
    participantsAccordionValueFor(this.hasTerminalRounds()),
  );

  /**
   * Short summary line shown in the accordion header when collapsed —
   * e.g. "3 online · 1 offline · 1 viewer". Uses active participants only.
   */
  protected readonly participantsSummary = computed(() =>
    summarizeParticipants(this.activeParticipants(), this.onlineIds(), (p) =>
      this.isParticipantViewer(p),
    ),
  );

  /**
   * All terminal rounds (revealed or skipped) except the most recent. Passed
   * to RoundHistoryComponent — only shown when there are 2+ terminal rounds
   * so there is at least one past entry alongside the current results.
   */
  protected readonly pastRevealedRounds = computed(() => {
    const rounds = this.rounds();
    const last = this.lastRevealedRound();
    if (!last) return [];
    return rounds.filter((r) => terminalState(r) !== null && r.id !== last.id);
  });

  /** 1-based round number for the edit modal header. */
  protected readonly editingRoundNumber = computed<number>(() => {
    const round = this.editingRound();
    if (!round) return 1;
    const idx = this.rounds().findIndex((r) => r.id === round.id);
    return idx >= 0 ? idx + 1 : 1;
  });

  private readonly modalRef = viewChild<IonModal>('roundStartModal');
  private readonly sessionSettingsModalRef = viewChild<IonModal>('sessionSettingsModal');
  private readonly qrModalRef = viewChild<IonModal>('qrModal');

  // Tracks the last uuid written to the cache so the effect does not
  // re-fire on every Yjs doc mutation (votes, awareness, etc.) while
  // connected to the same room. Reset to null when status leaves
  // 'connected' so a reconnect re-writes and bumps the TTL.
  private lastRecordedUuid: string | null = null;

  constructor() {
    addIcons({
      'chevron-back-outline': chevronBackOutline,
      'close-circle-outline': closeCircleOutline,
      'copy-outline': copyOutline,
      'ellipsis-horizontal-circle': ellipsisHorizontalCircle,
      'log-out-outline': logOutOutline,
      'pencil-outline': pencilOutline,
      'person-circle-outline': personCircleOutline,
      'person-remove-outline': personRemoveOutline,
      'qr-code-outline': qrCodeOutline,
      'settings-outline': settingsOutline,
      'share-outline': shareOutline,
      'star-outline': starOutline,
    });

    // Refresh the jump-back-in cache only once per (uuid, screen)
    // transition — deduped via lastRecordedUuid so we don't write on
    // every Yjs doc mutation while staying connected (ADR-0022 §5).
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

    // Auto-navigate to Estimating when a round starts. Covers
    // non-host clients who are sitting on the Lobby when the host
    // taps "Start Round" — without this, only the host's click
    // handler navigates. Guard: do not nav for terminal rounds (skipped
    // rounds briefly appear as currentRound before the projection updates).
    effect(() => {
      const round = this.docService.currentRound();
      if (round && terminalState(round) === null) {
        const code = this.docService.roomCode();
        assertRoomCode(code, 'lobby.autoNav');
        void this.router.navigate(['/estimating', code]);
      }
    });

    // WS rejection handler — covers all reasons a joiner can be rejected
    // while already on Lobby (e.g. host changes password mid-session,
    // room-full race, etc.). Captures code synchronously at signal-flip
    // time before endSession clears it.
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

  /**
   * Re-vote path (ADR-0013). Appends a new round with
   * `parentRoundId = lastRevealedRound.id`, inheriting `title` /
   * `description` / `ticketId` so the descriptor carries over to
   * Estimating without another trip through the round-start sheet.
   */
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

  protected async openActionSheet(event: Event): Promise<void> {
    const items: { text: string; icon?: string; role?: string; handler?: () => void }[] = [
      {
        text: 'Session settings',
        icon: 'settings-outline',
        handler: () => {
          this.openSessionSettings();
        },
      },
      {
        text: 'Leave session',
        icon: 'log-out-outline',
        role: 'destructive',
        handler: () => {
          void this.confirmLeave();
        },
      },
    ];

    if (this.isHost()) {
      items.splice(1, 0, {
        text: 'End session for everyone',
        icon: 'close-circle-outline',
        role: 'destructive',
        handler: () => {
          void this.confirmEndSession();
        },
      });
    }

    if (this.hasRevealedRounds()) {
      items.splice(1, 0, {
        text: 'Copy results',
        icon: 'copy-outline',
        handler: () => {
          void this.copyResults();
        },
      });
    }

    items.push({ text: 'Cancel', role: 'cancel' });

    await this.surface.openSheetOrPopover({
      header: 'Session',
      triggerEvent: event,
      items,
    });
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
      // User-cancelled share sheets throw — silently ignore.
      if (err instanceof Error && err.message?.includes('cancel')) return;
      // navigator.share unavailable or other failure — clipboard fallback.
      await this.copyToClipboard(url, formatted);
    }
  }

  private async copyResults(): Promise<void> {
    try {
      // Pass raw participants() — includes departed — so names still resolve per ADR-0036.
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

  /**
   * Soft exit — back-chevron path. Navigates to Home WITHOUT clearing
   * the last-session cache, so the Jump-back-in banner remains visible.
   * Does not tear down the WebSocket; the session stays alive in the
   * background while the user is on Home.
   *
   * Per plan §4: back is NOT destructive, so no confirmation dialog.
   */
  protected softExit(): void {
    void this.router.navigate(['/home']);
  }

  /**
   * Destructive-action confirmation (ux.md §2). Wired ONLY to the
   * ⋯ → "Leave session" action-sheet item so the session is never
   * torn down without an explicit user confirmation.
   *
   * The back chevron uses `softExit()` instead — no dialog, cache kept.
   */
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
      // Write the soft-delete before disconnecting so peers see the removal (ADR-0036).
      this.docService.leaveSession(selfId);
      // Flush the Yjs update through the WebSocket before closing (best-effort, 500 ms cap).
      await this.docService.flushUpdates();
    }
    this.docService.endSession();
    // Destructive leave — clear cache so Jump-back-in banner does not reappear (ADR-0022).
    await this.lastSessionService.clear();
    await this.router.navigate(['/home']);
  }

  /**
   * Handoff tap handler. Shows confirmation dialog, and on confirm calls
   * updateSettings to transfer host to the target participant.
   */
  protected async onHandoffTap(participantId: string, displayName: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Make host?',
      message: `Make ${displayName} the host?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Confirm',
          handler: () => {
            this.haptic.impactMedium();
            this.docService.updateSettings({ hostParticipantId: participantId });
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Host kick — confirmation dialog per ux.md §4.5. On confirm writes
   * `leftAt` + `removedBy` to the target's record (ADR-0036).
   */
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
