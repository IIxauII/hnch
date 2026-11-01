import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CelebrationService } from '../core/celebration.service';
import { Router } from '@angular/router';
import { Share } from '@capacitor/share';
import {
  formatRoomCode,
  formatRoundLabel,
  getScaleLabel,
  nextRoundNumber,
  roundNumber,
} from '@hnch/shared';
import type { AgendaItem, AgendaResult, ParticipantSnapshot, Round } from '@hnch/shared';
import {
  AlertController,
  PopoverController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  closeCircleOutline,
  copyOutline,
  ellipsisHorizontal,
  lockClosedOutline,
  logOutOutline,
  pencilOutline,
  personRemoveOutline,
  qrCodeOutline,
  settingsOutline,
  shareOutline,
  starOutline,
} from 'ionicons/icons';

import { SessionAccessService } from '../core/session-access.service';
import {
  buildCopyRoomCodeToast,
  buildResultsHeading,
  buildRoundCta,
  buildSessionSummary,
  buildWaitingNote,
  isParticipantViewer,
} from './lobby-helpers';
import type { MenuItem } from '../shared/menu-popover/menu-popover.component';
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
import { AvatarComponent } from '../shared/avatar.component';
import { RoleToggleComponent } from '../shared/role-toggle.component';
import { revoteLabel } from '../shared/revote-label';
import { RoundHistoryComponent } from '../shared/round-history.component';
import { VoteResultsComponent } from '../shared/vote-results.component';
import { assertRoomCode } from '../core/room-join.service';
import { shouldRecordCache } from '../core/cache-record-guard';
import { QrDisplaySheetComponent } from './qr-display.sheet';
import { presentSheet } from '../utils/present-sheet';
import { AgendaPanelComponent } from '../agenda/agenda-panel.component';
import {
  AgendaItemFormSheetComponent,
  type AgendaItemFormSubmission,
} from '../agenda/agenda-item-form.sheet';

/**
 * Lobby — the session's home screen between rounds (ux.md §1.2, §1.4).
 *
 * One screen for host and joiner; the host additionally gets the round
 * controls in the footer, the ⋯ menu, and the per-participant actions. A
 * joiner gets a one-tap Leave where the host has ⋯, and a line saying what
 * they are waiting for where the host has a button.
 *
 * Sections are plain cards in one column, the newest result right under the
 * session code. Nothing collapses.
 *
 * The Lobby owns the session's lifetime: leaving prompts an
 * `ion-alert` confirmation per ux.md §2 "Destructive confirmation" and
 * calls `docService.teardown()` before popping to Home. The back chevron is
 * a soft exit — it keeps the session alive and the way back in on Home.
 *
 * After a round is revealed, Estimating navigates back to Lobby.
 * Lobby shows the full VoteResultsComponent for the latest finished
 * round, and RoundHistoryComponent for any older ones.
 */
@Component({
  selector: 'app-lobby',
  host: { class: 'ion-page' },
  providers: [CelebrationService],
  imports: [
    AgendaItemFormSheetComponent,
    AgendaPanelComponent,
    AvatarComponent,
    ConnectionStatusBannerComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonNote,
    IonTitle,
    IonToolbar,
    QrDisplaySheetComponent,
    RoleToggleComponent,
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
        <ion-title role="heading" aria-level="1">{{ sessionTitle() }}</ion-title>
        <ion-buttons slot="end">
          @if (isHost()) {
            <ion-button
              aria-label="More options"
              (click)="openActionSheet($event)"
            >
              <ion-icon
                slot="icon-only"
                name="ellipsis-horizontal"
              ></ion-icon>
            </ion-button>
          } @else {
            <ion-button
              aria-label="Leave session"
              (click)="confirmLeave()"
            >
              <ion-icon
                slot="icon-only"
                name="log-out-outline"
              ></ion-icon>
            </ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="page-container">
        <app-connection-status-banner />
        <div class="lobby-layout">
          <section class="hnch-card lobby-section session-card" aria-label="Session">
            <div class="hnch-card__body">
              <div class="card-label">Session code</div>
              @if (roomCode()) {
                <button
                  type="button"
                  class="room-code"
                  [attr.aria-label]="'Copy session code ' + formattedRoomCode()"
                  (click)="onCopyRoomCode()"
                >
                  <span>{{ formattedRoomCode() }}</span>
                  <ion-icon name="copy-outline" aria-hidden="true"></ion-icon>
                </button>
                @if (subtitle()) {
                  @if (isHost()) {
                    <button
                      type="button"
                      class="subtitle"
                      [attr.aria-label]="'Edit session settings: ' + subtitle()"
                      (click)="openSessionSettings()"
                    >
                      @if (passwordProtected()) {
                        <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon>
                      }
                      <span>{{ subtitle() }}</span>
                      <ion-icon name="pencil-outline" aria-hidden="true"></ion-icon>
                    </button>
                  } @else {
                    <p class="subtitle-chip">
                      @if (passwordProtected()) {
                        <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon>
                      }
                      <span>{{ subtitle() }}</span>
                    </p>
                  }
                }
                <div class="share-actions">
                  <ion-button fill="outline" class="share-btn" (click)="onShareInvite()">
                    <ion-icon slot="start" name="share-outline" aria-hidden="true"></ion-icon>
                    Share invite
                  </ion-button>
                  <ion-button fill="outline" class="qr-btn" (click)="onShowQr()">
                    <ion-icon slot="start" name="qr-code-outline" aria-hidden="true"></ion-icon>
                    QR code
                  </ion-button>
                </div>
              }
              @if (!isHost()) {
                <p class="waiting-note" role="status">{{ waitingNote() }}</p>
              }
            </div>
          </section>

          @if (lastRevealedRound(); as round) {
            <section class="hnch-card lobby-section results-card">
              <div class="hnch-card__header">
                <h2 class="hnch-card__title lobby-section__heading results-heading">
                  {{ resultsHeading() }}
                  @if (resultsLineageNote(); as note) {
                    <span class="hnch-card__title-note">{{ note }}</span>
                  }
                </h2>
                @if (hasRevealedRounds()) {
                  <ion-button
                    fill="clear"
                    size="small"
                    class="copy-results-btn"
                    aria-label="Copy all results as Markdown"
                    title="Copy all results as Markdown"
                    (click)="copyResults()"
                  >
                    <ion-icon slot="icon-only" name="copy-outline" aria-hidden="true"></ion-icon>
                  </ion-button>
                }
              </div>
              <div class="hnch-card__body results-section" [attr.aria-label]="resultsHeading()">
                @if (lastRoundWasSkipped()) {
                  <p class="round-skipped" role="status">Round skipped</p>
                } @else {
                  <div class="results-descriptor-row">
                    @if (formatRoundLabel(round); as label) {
                      <p class="results-descriptor">{{ label }}</p>
                    } @else if (isHost()) {
                      <p class="results-descriptor placeholder">Untitled round</p>
                    }
                    @if (isHost()) {
                      <ion-button
                        fill="clear"
                        size="small"
                        class="edit-btn"
                        aria-label="Edit round"
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
                }
              </div>
            </section>
          }

          <section class="hnch-card lobby-section participants-card">
            <div class="hnch-card__header">
              <h2 class="hnch-card__title lobby-section__heading">
                Participants ({{ activeParticipants().length }})
              </h2>
            </div>
            <div class="hnch-card__body">
              <ion-list lines="none" class="participants">
                @for (p of activeParticipants(); track p.id) {
                  <ion-item [class.offline]="!onlineIds().has(p.id)">
                    <app-avatar
                      slot="start"
                      [participantId]="p.id"
                      [name]="p.displayName"
                      [color]="p.avatarColor"
                      [dimmed]="!onlineIds().has(p.id)"
                    />
                    <ion-label>
                      <span class="participant-name">{{ participantLabel(p) }}</span>
                      @if (p.id === hostId()) {
                        <span class="host-badge host-icon">Host</span>
                      }
                    </ion-label>
                    @if (p.id === myId()) {
                      <app-role-toggle
                        slot="end"
                        [viewer]="isParticipantViewer(p)"
                        (toggled)="onToggleRole()"
                      />
                    } @else {
                      @if (!onlineIds().has(p.id)) {
                        <ion-note slot="end">Offline</ion-note>
                      } @else if (isParticipantViewer(p)) {
                        <ion-note slot="end">Observer</ion-note>
                      }
                      @if (isHost()) {
                        <ion-button
                          fill="clear"
                          slot="end"
                          class="participant-menu-btn"
                          [attr.aria-label]="'Host actions for ' + p.displayName"
                          (click)="openParticipantActions(p, $event)"
                        >
                          <ion-icon
                            slot="icon-only"
                            name="ellipsis-horizontal"
                            aria-hidden="true"
                          ></ion-icon>
                        </ion-button>
                      }
                    }
                  </ion-item>
                }
              </ion-list>
            </div>
          </section>

          <section class="hnch-card lobby-section agenda-card">
            <div class="hnch-card__header">
              <h2 class="hnch-card__title lobby-section__heading">Agenda</h2>
            </div>
            <div class="hnch-card__body">
              <app-agenda-panel
                [items]="agenda()"
                [isHost]="isHost()"
                (addRequested)="openAddAgendaItem()"
                (editRequested)="openEditAgendaItem($event)"
                (skipRequested)="onAgendaSkip($event)"
                (cancelRequested)="onAgendaCancel($event)"
                (reorderUpRequested)="onAgendaReorderUp($event)"
                (reorderDownRequested)="onAgendaReorderDown($event)"
              />
            </div>
          </section>

          @if (pastRevealedRounds().length > 0) {
            <section class="hnch-card lobby-section history-card">
              <div class="hnch-card__header">
                <h2 class="hnch-card__title lobby-section__heading">History</h2>
              </div>
              <div class="hnch-card__body">
                <app-round-history
                  [rounds]="pastRevealedRounds()"
                  [allRounds]="rounds()"
                  [participants]="participants()"
                  [isHost]="isHost()"
                  (editTriggered)="openRoundEditById($event)"
                />
              </div>
            </section>
          }
        </div>
      </div>
      @if (celebration.consensus() && celebration.showOverlay()) {
        <div
          class="consensus-overlay"
          role="status"
          aria-live="polite"
          (click)="celebration.dismissOverlay()"
        >
          <div #confettiLayer class="confetti-layer" aria-hidden="true"></div>
          <span class="consensus-text">hnch'd!
            @if (celebration.reducedMotion()) {<span aria-hidden="true"> 🎉</span>}
          </span>
        </div>
      }
    </ion-content>

    @if (isHost()) {
      <ion-footer class="cta-bar">
        <ion-toolbar>
          <div class="cta-inner">
            @if (canRevote()) {
              <ion-button
                fill="outline"
                (click)="onRevote()"
              >
                Re-vote
              </ion-button>
            }
            <ion-button
              color="primary"
              [disabled]="!hasSession()"
              (click)="openRoundStart()"
            >
              {{ roundCta() }}
            </ion-button>
          </div>
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
          [prefillAgendaItem]="roundStartPrefillItem()"
          (submitted)="onRoundStart($event)"
          (cancelled)="closeRoundStart()"
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
          [isHost]="isHost()"
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
      cssClass="modal-centered modal-compact"
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
            (closeRequested)="roundEditOpen.set(false)"
          />
        }
      </ng-template>
    </ion-modal>

    <ion-modal
      cssClass="modal-centered"
      [isOpen]="agendaFormOpen()"
      [breakpoints]="surface.sheetBreakpoints()"
      [initialBreakpoint]="surface.initialSheetBreakpoint()"
      (didDismiss)="onAgendaFormDismiss()"
    >
      <ng-template>
        <app-agenda-item-form-sheet
          [mode]="agendaFormMode()"
          [initialItem]="editingAgendaItem()"
          (submitted)="onAgendaFormSubmit($event)"
          (closeRequested)="agendaFormOpen.set(false)"
        />
      </ng-template>
    </ion-modal>

  `,
  styles: [
    `
      @use '../../theme/page-container' as *;
      @use '../../theme/a11y' as *;
      @include page-container(800px);

      /*
       * One column on every surface, ordered by what matters right now: the
       * code, then the newest result, then who is here.
       */
      .lobby-layout {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .session-card .hnch-card__body {
        padding-block-start: 16px;
      }
      .room-code {
        @include focus-ring;
        appearance: none;
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: 100%;
        min-height: 44px;
        margin: 2px 0 0;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--hnch-text);
        cursor: pointer;
        font: inherit;
        /* Fits "XXX-XXX" on a 320px screen and stops growing at 40px. */
        font-size: clamp(1.75rem, 9vw, 2.5rem);
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        letter-spacing: 0.06em;
        line-height: 1.1;
        white-space: nowrap;
      }
      .room-code ion-icon {
        flex: 0 0 auto;
        color: var(--hnch-muted);
        font-size: 1.25rem;
      }
      .subtitle,
      .subtitle-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        margin: 4px 0 0;
        color: var(--hnch-muted);
        font-size: 0.9375rem;
        line-height: 1.35;
        text-align: start;
      }
      .subtitle > span,
      .subtitle-chip > span {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .subtitle ion-icon,
      .subtitle-chip ion-icon {
        flex: 0 0 auto;
        font-size: 1rem;
      }
      .subtitle {
        @include focus-ring;
        appearance: none;
        min-height: 32px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
        font-family: inherit;
        transition: color 120ms ease;
        @include touch-target;
      }
      @include hover-only {
        .subtitle:hover {
          color: var(--hnch-text);
        }
      }
      .share-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-block-start: 16px;
      }
      .share-actions ion-button {
        flex: 1 1 8rem;
        min-height: 44px;
        margin: 0;
        font-size: 0.9375rem;
      }
      .waiting-note {
        margin: 16px 0 0;
        padding-block-start: 12px;
        border-top: 0.55px solid var(--hnch-sep);
        color: var(--hnch-muted);
        font-size: 0.9375rem;
        line-height: 1.4;
      }

      ion-list.participants ion-item {
        --min-height: 52px;
        --padding-start: 0;
        --inner-padding-end: 0;
      }
      ion-list.participants ion-item + ion-item {
        border-top: 0.55px solid var(--hnch-sep);
      }
      ion-list.participants app-avatar {
        margin-inline-end: 12px;
      }
      ion-list.participants ion-label {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        white-space: normal;
      }
      .participant-name {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      ion-item.offline .participant-name {
        color: var(--hnch-muted);
      }
      .host-badge {
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--hnch-fill);
        color: var(--hnch-muted);
        font-size: 0.75rem;
        font-weight: 600;
        line-height: 1.4;
      }
      ion-list.participants ion-note {
        font-size: 0.875rem;
      }
      /*
       * The dots sit at the row's edge, the 44px target reaches inwards from
       * there. No negative margin: the item clips whatever overhangs it, and
       * scrolling an overhanging button into view shifts the whole row, which
       * cut the first letter off the name beside it.
       */
      .participant-menu-btn {
        --color: var(--hnch-muted);
        --padding-end: 0;
        --padding-start: 20px;
        min-width: 44px;
        min-height: 44px;
        margin: 0 0 0 4px;
      }

      .copy-results-btn {
        --color: var(--hnch-muted);
        --padding-end: 0;
        --padding-start: 12px;
        min-width: 44px;
        min-height: 44px;
        margin: 0;
      }
      .results-descriptor-row {
        display: flex;
        align-items: center;
        gap: 4px;
        min-height: 32px;
        margin-block-end: 8px;
      }
      .results-descriptor {
        min-width: 0;
        margin: 0;
        color: var(--hnch-text);
        font-size: 1rem;
        font-weight: 500;
        overflow-wrap: anywhere;
      }
      .results-descriptor.placeholder {
        color: var(--hnch-muted);
        font-weight: 400;
      }
      .edit-btn {
        --color: var(--hnch-muted);
        --padding-start: 0.25rem;
        --padding-end: 0.25rem;
        flex: 0 0 auto;
        margin: 0;
      }
      .round-skipped {
        margin: 0;
        color: var(--hnch-muted);
      }

      /* Consensus overlay — positioned inside ion-content, below toolbar */
      @keyframes consensusScaleIn {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.4);
        }
        60% {
          transform: translate(-50%, -50%) scale(1.15);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
      @keyframes consensusPulse {
        0%, 100% {
          transform: translate(-50%, -50%) scale(1);
        }
        50% {
          transform: translate(-50%, -50%) scale(1.06);
        }
      }
      .consensus-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        background: rgba(0, 0, 0, var(--hnch-backdrop-alpha, 0.55));
        cursor: pointer;
        animation: none;
      }
      .confetti-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 1001;
        overflow: hidden;
      }
      /*
       * A filled badge: accent fill, accent ink. Accent-colored *text* on the
       * scrim was 2:1 in dark mode and not much better in light.
       */
      .consensus-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 0.35em 0.8em;
        border-radius: 999px;
        background: var(--hnch-accent);
        box-shadow: var(--hnch-shadow-3);
        color: var(--hnch-accent-ink);
        font-size: clamp(2rem, 9vw, 3rem);
        font-weight: 800;
        letter-spacing: -0.02em;
        white-space: nowrap;
        z-index: 1002;
        animation: consensusScaleIn 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both,
                   consensusPulse 900ms ease-in-out 380ms 3;
      }
      @media (prefers-reduced-motion: reduce) {
        .consensus-text {
          animation: none;
        }
      }
    `,
  ],
})
export class LobbyPage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly access = inject(SessionAccessService);
  private readonly docService = inject(DocService);
  private readonly haptic = inject(HapticService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly scalePrefs = inject(ScalePreferenceService);
  protected readonly surface = inject(SurfaceService);
  private readonly alertCtrl = inject(AlertController);
  private readonly popoverCtrl = inject(PopoverController);
  private readonly toastService = inject(ToastService);
  private readonly exportService = inject(ExportService);
  protected readonly celebration = inject(CelebrationService);

  protected readonly hasSession = this.docService.hasSession;
  protected readonly participants = this.docService.participants;
  protected readonly activeParticipants = this.docService.activeParticipants;
  protected readonly onlineIds = this.docService.onlineParticipantIds;
  protected readonly rounds = this.docService.rounds;
  protected readonly agenda = this.docService.agenda;

  /** Round-start modal visibility. Two-way bound to `ion-modal`. */
  protected readonly roundStartOpen = signal(false);

  /**
   * Agenda item to pre-fill into the round-start sheet. Set by
   * `openRoundStart()` from `nextPendingAgendaItem`. Reset on dismiss.
   */
  protected readonly roundStartPrefillItem = signal<AgendaItem | null>(null);

  /** Session-settings modal visibility. Two-way bound to `ion-modal`. */
  protected readonly sessionSettingsOpen = signal(false);

  /** QR display modal visibility. */
  protected readonly qrOpen = signal(false);

  /** Round-edit modal visibility. */
  protected readonly roundEditOpen = signal(false);

  /** Round currently being edited, or null when no edit is open. */
  protected readonly editingRound = signal<Round | null>(null);

  /** Agenda item form modal visibility. */
  protected readonly agendaFormOpen = signal(false);

  /** 'add' or 'edit' mode for the agenda item form. */
  protected readonly agendaFormMode = signal<'add' | 'edit'>('add');

  /** Agenda item being edited, or null when adding. */
  protected readonly editingAgendaItem = signal<AgendaItem | null>(null);

  /**
   * Whether the session asks for a password. Relay state (ADR-0009), kept by
   * `SessionAccessService`: a session created with a password, reloaded, or
   * protected by a previous host is locked whether or not this page was the
   * one that locked it.
   */
  protected readonly passwordProtected = computed(() => this.access.mode() === 'password');

  protected readonly myId = this.participantIdService.id;

  protected readonly hostId = computed(() => this.docService.settings()?.hostParticipantId ?? null);

  protected readonly isParticipantViewer = isParticipantViewer;

  /** A roster row's name: the participant's own row reads "You (Alex)". */
  protected participantLabel(p: Pick<ParticipantSnapshot, 'id' | 'displayName'>): string {
    return p.id === this.myId() ? `You (${p.displayName})` : p.displayName;
  }

  /** Toggle own voter↔viewer role. Wired to the switch on the participant's own row. */
  protected onToggleRole(): void {
    if (!this.myId()) return;
    this.haptic.impactLight();
    this.docService.commands.toggleRole();
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
    return this.passwordProtected() ? `${base}&pw=1` : base;
  });

  /** Dash-formatted room code for human display. */
  protected readonly formattedRoomCode = computed(() => {
    const code = this.roomCode();
    return code ? formatRoomCode(code) : '';
  });

  /** Re-export of the shared label helper so the template can call it. */
  protected readonly formatRoundLabel = formatRoundLabel;

  /** The number on "Start round N" / "Next round N". Cancelled rounds take none. */
  protected readonly nextRoundNumber = computed(() => nextRoundNumber(this.rounds()));

  /**
   * Toolbar title: the session's name when it has one. "Lobby" otherwise —
   * the screen's name is only worth the space when there is nothing better.
   */
  protected readonly sessionTitle = computed(() => {
    const name = this.docService.settings()?.name?.trim() ?? '';
    return name.length > 0 ? name : 'Lobby';
  });

  /**
   * One line under the code: scale, and the lock when there is one. The
   * session's name is already the toolbar title, and the round number is on
   * the button that starts it, so neither is repeated here.
   */
  protected readonly subtitle = computed(() => {
    const settings = this.docService.settings();
    if (!settings || !settings.defaultScale) return '';
    return buildSessionSummary({
      scaleLabel: getScaleLabel(settings.defaultScale.id, this.scalePrefs.customScales()),
      passwordProtected: this.passwordProtected(),
    });
  });

  /**
   * The most recently terminal round (revealed or skipped), or null if no
   * rounds have ended yet. Drives the inline results / skipped notice display.
   * Discarded rounds are tombstones — they never surface as the "last" anchor
   * (no votes were revealed, nothing to display or re-vote from).
   */
  protected readonly lastRevealedRound = computed(() => {
    const rounds = this.rounds();
    for (let i = rounds.length - 1; i >= 0; i--) {
      const r = rounds[i]!;
      if (r.status === 'revealed' || r.status === 'skipped') return r;
    }
    return null;
  });

  /**
   * True when `lastRevealedRound` was skipped rather than revealed.
   */
  protected readonly lastRoundWasSkipped = computed(() => {
    const r = this.lastRevealedRound();
    return r !== null && r.status === 'skipped';
  });

  /** The number `lastRevealedRound` goes by, or `null` when there is none. */
  protected readonly lastRevealedRoundNumber = computed(() => {
    const round = this.lastRevealedRound();
    if (!round) return null;
    const number = roundNumber(round, this.rounds());
    return number > 0 ? number : null;
  });

  /** Results-card heading — pure-helper backed for unit testability. */
  protected readonly resultsHeading = computed(() =>
    buildResultsHeading(this.lastRevealedRoundNumber()),
  );

  /** "Re-vote" beside the heading when the round re-votes an earlier one (#111). */
  protected readonly resultsLineageNote = computed(() => {
    const round = this.lastRevealedRound();
    return round === null ? null : revoteLabel(round.id, this.rounds());
  });

  /** Re-vote needs a result to re-vote on; a skipped round has none. */
  protected readonly canRevote = computed(
    () => this.lastRevealedRound() !== null && !this.lastRoundWasSkipped(),
  );

  /** "Start round 1" / "Next round 4". */
  protected readonly roundCta = computed(() =>
    buildRoundCta(this.lastRevealedRound() !== null, this.nextRoundNumber()),
  );

  /** Shown to everyone but the host, in place of the round button. */
  protected readonly waitingNote = computed(() => {
    const hostId = this.hostId();
    const host = this.activeParticipants().find((p) => p.id === hostId);
    return buildWaitingNote(host?.displayName ?? null, this.lastRevealedRound() !== null);
  });

  /** True when at least one round has been revealed (gates "Copy results" button). */
  protected readonly hasRevealedRounds = computed(() =>
    this.rounds().some((r) => r.status === 'revealed'),
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
    // Revealed and skipped only: a discarded round is a tombstone and never
    // resurfaces in history (ADR-0046).
    return rounds.filter(
      (r) => (r.status === 'revealed' || r.status === 'skipped') && r.id !== last.id,
    );
  });

  /** Round number for the edit modal header. */
  protected readonly editingRoundNumber = computed<number>(() => {
    const round = this.editingRound();
    if (!round) return 1;
    return roundNumber(round, this.rounds()) || 1;
  });

  private readonly modalRef = viewChild<IonModal>('roundStartModal');
  private readonly sessionSettingsModalRef = viewChild<IonModal>('sessionSettingsModal');
  private readonly qrModalRef = viewChild<IonModal>('qrModal');

  /** ViewChild for the engine-owned confetti layer div inside the overlay. */
  private readonly confettiLayer = viewChild<ElementRef<HTMLElement>>('confettiLayer');

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
      'ellipsis-horizontal': ellipsisHorizontal,
      'lock-closed-outline': lockClosedOutline,
      'log-out-outline': logOutOutline,
      'pencil-outline': pencilOutline,
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
      const uuid = this.docService.relayRoomUuid();
      // Up *and* synced: an open socket is not yet the relay saying yes.
      const joined = this.docService.joined();
      if (!joined) {
        this.lastRecordedUuid = null;
        return;
      }
      if (shouldRecordCache(code, uuid, joined, this.lastRecordedUuid)) {
        this.lastRecordedUuid = uuid ?? null;
        void this.lastSessionService.record({
          roomCode: code!,
          roomUuid: uuid!,
          lastScreen: 'lobby',
        });
      }
    });

    // Wire last revealed round into CelebrationService.
    // Only non-skipped revealed rounds trigger celebration; CelebrationService
    // guards internally via consensus() computed.
    effect(() => {
      const round = this.lastRevealedRound();
      this.celebration.setRound(round);
    });

    // Auto-navigate to Estimating whenever this peer no longer belongs on
    // Lobby (#508). Covers non-host clients sitting here when the host
    // taps "Start Round" — without this, only the host's click handler
    // navigates. The rule lives in the shared `screenFor` selector; this is
    // the adapter, and unlike Estimating's it pushes rather than replaces.
    //
    // `null` means the projection has not arrived yet (slow-network resume);
    // stay on the screen the URL asked for.
    effect(() => {
      this.followScreen();
    });

    // Wire confetti layer DOM node to CelebrationService after each render.
    // afterRenderEffect guarantees the read runs after view commit so the
    // element is document-attached when attachLayer() is called.
    afterRenderEffect(() => {
      this.celebration.attachLayer(this.confettiLayer()?.nativeElement ?? null);
    });
  }

  /**
   * Ionic keeps this page alive under Estimating and re-shows the same
   * instance on the way back, so the effect above — which only re-runs when
   * `screen` changes — never notices a return to the Lobby while a round is
   * still running (the browser's Back button does exactly that). Re-apply
   * the rule on every entry: while a round is active, everyone is on
   * Estimating.
   */
  ionViewWillEnter(): void {
    this.followScreen();
    // Whether the session is locked is the relay's to say, and may have
    // changed while this page was out of sight.
    void this.access.refresh();
  }

  /**
   * Menus and sheets belong to the screen they were opened on. The page is
   * left without the user doing anything when the host starts a round, and
   * whatever was open then would sit on top of Estimating — a sheet also
   * switches off the voting keys there.
   */
  ionViewWillLeave(): void {
    void this.surface.dismissMenu();
    for (const modal of [this.modalRef(), this.sessionSettingsModalRef(), this.qrModalRef()]) {
      void modal?.dismiss();
    }
    this.roundStartOpen.set(false);
    this.sessionSettingsOpen.set(false);
    this.qrOpen.set(false);
    this.roundEditOpen.set(false);
    this.agendaFormOpen.set(false);
  }

  /** Go where the shared `screenFor` rule says this peer belongs. */
  private followScreen(): void {
    const screen = this.docService.screen();
    if (screen === null || screen === 'lobby') return;
    const code = this.docService.roomCode();
    assertRoomCode(code, 'lobby.autoNav');
    void this.router.navigate(['/estimating', code]);
  }

  protected openRoundStart(): void {
    // Set pre-fill from next pending agenda item (ADR-0042).
    this.roundStartPrefillItem.set(this.docService.nextPendingAgendaItem());
    const modal = this.modalRef();
    if (modal) void presentSheet({ modal });
  }

  protected async closeRoundStart(): Promise<void> {
    await this.modalRef()?.dismiss();
    this.roundStartOpen.set(false);
  }

  protected async onRoundStart(submission: RoundStartSubmission): Promise<void> {
    // Agenda consume is deferred to the round's terminal state (reveal or
    // skip) — handled inside the shared round-terminal writers behind the
    // `round-commands` seam.
    // Host back-chevron discard leaves the linked item `pending` so it can be
    // re-started. See ADR superseding ADR-0042.
    // `startRound` refuses rather than throws when the room has no host to
    // attribute the round to — a joiner whose settings have not synced yet is
    // exactly that state (#516). Stay put with the sheet open: dismissing and
    // navigating would land the host on Estimating with no round to estimate.
    if (
      !this.docService.commands.startRound({
        ...(submission.title !== null && { title: submission.title }),
        ...(submission.ticketId !== null && { ticketId: submission.ticketId }),
        ...(submission.description !== null && { description: submission.description }),
        ...(submission.agendaItemId !== undefined && { agendaItemId: submission.agendaItemId }),
      }).applied
    ) {
      return;
    }

    await this.modalRef()?.dismiss();
    this.roundStartOpen.set(false);
    this.roundStartPrefillItem.set(null);
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

    // Inherit agendaItemId from parent round (ADR-0042 re-vote rule).
    // No agenda item state mutation on re-vote.
    // Same refusal branch as `onRoundStart` — no host, no round, no navigation.
    if (
      !this.docService.commands.startRound({
        parentRoundId: round.id,
        ...(round.title !== undefined && { title: round.title }),
        ...(round.description !== undefined && { description: round.description }),
        ...(round.ticketId !== undefined && { ticketId: round.ticketId }),
        ...(round.agendaItemId !== undefined && { agendaItemId: round.agendaItemId }),
      }).applied
    ) {
      return;
    }
    const code = this.docService.roomCode();
    assertRoomCode(code, 'lobby.onRevote');
    await this.router.navigate(['/estimating', code]);
  }

  protected openAddAgendaItem(): void {
    this.agendaFormMode.set('add');
    this.editingAgendaItem.set(null);
    this.agendaFormOpen.set(true);
  }

  protected openEditAgendaItem(item: AgendaItem): void {
    this.agendaFormMode.set('edit');
    this.editingAgendaItem.set(item);
    this.agendaFormOpen.set(true);
  }

  protected onAgendaFormDismiss(): void {
    this.agendaFormOpen.set(false);
    this.editingAgendaItem.set(null);
  }

  /**
   * Submit the add / edit agenda form.
   *
   * A refusal **leaves the modal open**. Vote and round refusals are
   * invisible because the affordance disappears along with them; an agenda
   * refusal happens with the form still on screen and the user waiting for
   * something, so dismissing it would silently eat their typing. The common
   * case is a lost race — a peer skipped or cancelled the item while this
   * form was open (#507). No toast: that surface does not exist elsewhere in
   * the app.
   */
  protected onAgendaFormSubmit(submission: AgendaItemFormSubmission): void {
    const mode = this.agendaFormMode();
    let result: AgendaResult;
    if (mode === 'add') {
      result = this.docService.commands.addItem({
        ...(submission.title !== null && { title: submission.title }),
        ...(submission.ticketId !== null && { ticketId: submission.ticketId }),
        ...(submission.description !== null && { description: submission.description }),
      });
    } else {
      const item = this.editingAgendaItem();
      if (!item) return;
      result = this.docService.commands.editItem(item.id, {
        ...(submission.title !== null ? { title: submission.title } : { title: '' }),
        ...(submission.ticketId !== null ? { ticketId: submission.ticketId } : { ticketId: '' }),
        ...(submission.description !== null
          ? { description: submission.description }
          : { description: '' }),
      });
    }
    if (!result.applied) return;

    this.agendaFormOpen.set(false);
    this.editingAgendaItem.set(null);
    this.haptic.impactLight();
  }

  protected onAgendaSkip(id: string): void {
    if (this.docService.commands.skipItem(id).applied) {
      this.haptic.impactMedium();
    }
  }

  protected onAgendaCancel(id: string): void {
    if (this.docService.commands.cancelItem(id).applied) {
      this.haptic.impactMedium();
    }
  }

  protected onAgendaReorderUp(id: string): void {
    const items = this.docService.pendingAgenda();
    const idx = items.findIndex((i) => i.id === id);
    if (idx <= 0) return;
    const before = idx >= 2 ? items[idx - 2]!.sortKey : null;
    const after = items[idx - 1]!.sortKey;
    if (this.docService.commands.moveItem(id, before, after).applied) {
      this.haptic.impactLight();
    }
  }

  protected onAgendaReorderDown(id: string): void {
    const items = this.docService.pendingAgenda();
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0 || idx >= items.length - 1) return;
    const before = items[idx + 1]!.sortKey;
    const after = idx + 2 < items.length ? items[idx + 2]!.sortKey : null;
    if (this.docService.commands.moveItem(id, before, after).applied) {
      this.haptic.impactLight();
    }
  }

  /**
   * The host's ⋯ menu. Everyone else has nothing to choose between — their
   * one action, Leave, is a button in the toolbar instead.
   */
  protected async openActionSheet(event: Event): Promise<void> {
    if (!this.isHost()) return;
    const items: MenuItem[] = [
      {
        text: 'Session settings',
        icon: 'settings-outline',
        handler: () => {
          this.openSessionSettings();
        },
      },
      {
        text: 'End session for everyone',
        icon: 'close-circle-outline',
        role: 'destructive',
        handler: () => {
          void this.confirmEndSession();
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
      { text: 'Cancel', role: 'cancel' },
    ];

    await this.surface.openSheetOrPopover({ triggerEvent: event, items });
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
            if (!this.myId()) return;
            // The shared roster command applies the host gate underneath
            // ADR-0023's UI gate; a refusal fires no haptic (#507).
            if (this.docService.endSessionForEveryone().applied) {
              this.haptic.impactHeavy();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  protected openSessionSettings(): void {
    if (!this.isHost()) return;
    const modal = this.sessionSettingsModalRef();
    if (modal) void presentSheet({ modal });
  }

  protected async closeSessionSettings(): Promise<void> {
    await this.sessionSettingsModalRef()?.dismiss();
    this.sessionSettingsOpen.set(false);
  }

  protected async onShareInvite(): Promise<void> {
    const url = this.inviteUrl();
    const formatted = this.formattedRoomCode();
    if (!url) return;

    try {
      await Share.share({
        title: 'Join my hnch session',
        text: `Session code: ${formatted}`,
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

  protected async copyResults(): Promise<void> {
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

  protected async onCopyRoomCode(): Promise<void> {
    const code = this.formattedRoomCode();
    if (!code) return;
    let success = false;
    try {
      await navigator.clipboard.writeText(code);
      success = true;
    } catch {
      success = false;
    }
    await this.toastService.info(buildCopyRoomCodeToast(success, code));
  }

  private async copyToClipboard(url: string, formattedCode: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      await this.toastService.info(`Invite link copied (${formattedCode})`);
    } catch {
      await this.toastService.error("Couldn't share the invite link.");
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

  /**
   * The sheet is gone. Only now is the round let go of: the sheet renders
   * from it, and clearing it on Cancel or Save emptied the sheet while it
   * was still sliding out.
   */
  protected onRoundEditDismiss(): void {
    this.roundEditOpen.set(false);
    this.editingRound.set(null);
  }

  protected onRoundEditSave(payload: { title: string; description: string | null }): void {
    const round = this.editingRound();
    if (!round) return;
    this.docService.updateRoundDescriptor(round.id, {
      title: payload.title,
      // An emptied description is written as empty: left out, the old text
      // would stay.
      description: payload.description ?? '',
    });
    this.roundEditOpen.set(false);
  }

  /**
   * Soft exit — back-chevron path. Navigates to Home WITHOUT clearing
   * the last-session cache, so the session stays on Home's "Jump back in" list.
   * Does not tear down the WebSocket; the session stays alive in the
   * background while the user is on Home.
   *
   * Back is not destructive, so no confirmation dialog.
   */
  protected softExit(): void {
    void this.router.navigate(['/home']);
  }

  /**
   * Destructive-action confirmation (ux.md §2). Reached from the host's menu
   * and from everyone else's toolbar button, so the session is never left
   * without an explicit confirmation.
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
    // The UUID the relay issued, which is what the entry was recorded under.
    // Not the one in the doc: any participant can rewrite that. Read before
    // anything is waited for — the session may be gone by the time it is over.
    const uuid = this.docService.relayRoomUuid();
    if (this.myId()) {
      // Write the soft-delete before disconnecting so peers see the removal (ADR-0036).
      this.docService.commands.leave();
      // Flush the Yjs update through the WebSocket before closing (best-effort, 500 ms cap).
      await this.docService.flushUpdates();
    }
    this.docService.teardown();
    // Destructive leave — remove the entry, so Home does not offer the session again (ADR-0044).
    if (uuid !== null) await this.lastSessionService.removeByUuid(uuid);
    await this.router.navigate(['/home']);
  }

  /**
   * Handoff tap handler. Shows a confirmation dialog, and on confirm routes
   * through the shared roster command, which applies the host gate and
   * refuses a target who is not online (#507).
   */
  protected async onHandoffTap(participantId: string, displayName: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: `Make ${displayName} the host?`,
      message: 'They take over the round controls. You stay in the session.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Make host',
          handler: () => {
            if (!this.myId()) return;
            if (this.docService.commands.handoffHost(participantId).applied) {
              this.haptic.impactMedium();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Host actions for one participant, opened by the ⋯ button on their row:
   * an action sheet on touch, a popover with a pointer. One visible
   * affordance on every surface — it used to be a hidden swipe on mobile.
   */
  protected async openParticipantActions(
    p: { id: string; displayName: string },
    event: Event,
  ): Promise<void> {
    const items: MenuItem[] = [];
    // The role can only go to someone who is here to take it; offered to an
    // offline participant it was confirmed and then refused without a word.
    if (this.onlineIds().has(p.id)) {
      items.push({
        text: 'Make host',
        icon: 'star-outline',
        handler: () => this.onHandoffTap(p.id, p.displayName),
      });
    }
    items.push(
      {
        text: 'Remove',
        role: 'destructive',
        icon: 'person-remove-outline',
        handler: () => this.onRemoveTap(p.id, p.displayName),
      },
      { text: 'Cancel', role: 'cancel' },
    );
    await this.surface.openSheetOrPopover({
      header: p.displayName,
      items,
      triggerEvent: event,
    });
  }

  ngOnDestroy(): void {
    this.popoverCtrl.dismiss().catch(() => {});
    this.celebration.detachLayer();
  }

  /**
   * Host kick — confirmation dialog per ux.md §4.5. On confirm writes
   * `leftAt` + `removedBy` to the target's record (ADR-0036).
   */
  protected async onRemoveTap(participantId: string, displayName: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: `Remove ${displayName} from session?`,
      message:
        "They'll be disconnected and dropped from the participant list. Their votes in past rounds stay in the history.",
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            if (!this.myId()) return;
            if (this.docService.commands.kick(participantId).applied) {
              this.haptic.impactHeavy();
            }
          },
        },
      ],
    });
    await alert.present();
  }
}
