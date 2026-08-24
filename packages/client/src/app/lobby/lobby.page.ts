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
  isTerminalStatus,
  resolveAvatarColor,
} from '@hnch/shared';
import type { Round } from '@hnch/shared';
import {
  AlertController,
  PopoverController,
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
  ellipsisVertical,
  listOutline,
  logOutOutline,
  pencilOutline,
  peopleOutline,
  personCircleOutline,
  personRemoveOutline,
  qrCodeOutline,
  settingsOutline,
  shareOutline,
  starOutline,
  statsChartOutline,
  timeOutline,
} from 'ionicons/icons';

import { ConnectionChipComponent } from '../core/connection-chip.component';
import { buildCopyRoomCodeToast, buildResultsHeading, isParticipantViewer } from './lobby-helpers';
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
import { RoundHistoryComponent } from '../shared/round-history.component';
import { VoteResultsComponent } from '../shared/vote-results.component';
import { assertRoomCode } from '../core/room-join.service';
import { shouldRecordCache } from '../core/cache-record-guard';
import { QrDisplaySheetComponent } from './qr-display.sheet';
import { presentSheet } from '../utils/present-sheet';
import { rejectionCopy } from '../join/join.page';
import { summarizeParticipants } from './lobby-summary';
import { AgendaPanelComponent } from '../agenda/agenda-panel.component';
import {
  AgendaItemFormSheetComponent,
  type AgendaItemFormSubmission,
} from '../agenda/agenda-item-form.sheet';
import type { AgendaItem } from '@hnch/shared';

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
  providers: [CelebrationService],
  imports: [
    AgendaItemFormSheetComponent,
    AgendaPanelComponent,
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
        <app-connection-status-banner />
        <ion-row>
          <ion-col size="12" sizeLg="6" sizeXl="5">
            <ion-accordion-group
              [multiple]="true"
              [value]="expandedSections()"
              expand="inset"
              (ionChange)="onAccordionChange($event)"
            >
              <ion-accordion
                value="general"
                class="lobby-section locked-open"
              >
                <ion-item slot="header" lines="inset">
                  <ion-label>
                    <h2 class="lobby-section__heading">Session</h2>
                  </ion-label>
                </ion-item>
                <div slot="content" class="lobby-section__body">
                  @if (roomCode()) {
                    <button
                      type="button"
                      class="room-code"
                      aria-label="Copy room code"
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
                          <span>{{ subtitle() }}</span>
                          <ion-icon name="pencil-outline" aria-hidden="true"></ion-icon>
                        </button>
                      } @else {
                        <ion-chip outline class="subtitle-chip">
                          {{ subtitle() }}
                        </ion-chip>
                      }
                    }
                  }
                </div>
              </ion-accordion>

              <ion-accordion value="share" class="lobby-section">
                <ion-item slot="header" lines="inset">
                  <ion-icon slot="start" name="share-outline" aria-hidden="true"></ion-icon>
                  <ion-label>
                    <h2 class="lobby-section__heading">Share</h2>
                  </ion-label>
                </ion-item>
                <div slot="content" class="lobby-section__body">
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
                </div>
              </ion-accordion>

              <ion-accordion value="participants" class="lobby-section">
                <ion-item slot="header" lines="inset">
                  <ion-icon slot="start" name="people-outline" aria-hidden="true"></ion-icon>
                  <ion-label>
                    <h2 class="lobby-section__heading">
                      Participants ({{ activeParticipants().length }})
                    </h2>
                    @if (participantsSummary() && !participantsAccordionOpen()) {
                      <p class="participants-summary">{{ participantsSummary() }}</p>
                    }
                  </ion-label>
                </ion-item>
                <div slot="content" class="lobby-section__body">
                  @if (isHost() && surface.mode() === 'mobile') {
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
                            <ion-avatar
                              slot="start"
                              aria-hidden="true"
                              [style.--avatar-color]="colorOf(p)"
                            >
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
                            @if (surface.mode() === 'desktop') {
                              <ion-button
                                fill="clear"
                                slot="end"
                                [attr.aria-label]="'Host actions for ' + p.displayName"
                                (click)="openParticipantActions(p, $event)"
                              >
                                <ion-icon name="ellipsis-vertical" aria-hidden="true"></ion-icon>
                              </ion-button>
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
                          <ion-avatar
                            slot="start"
                            aria-hidden="true"
                            [style.--avatar-color]="colorOf(p)"
                          >
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
          </ion-col>

          <ion-col size="12" sizeLg="6" sizeXl="7">
            <ion-accordion-group
              [multiple]="true"
              [value]="expandedSections()"
              expand="inset"
              (ionChange)="onAccordionChange($event)"
            >
              <ion-accordion
                value="agenda"
                class="lobby-section locked-open"
              >
                <ion-item slot="header" lines="inset">
                  <ion-icon slot="start" name="list-outline" aria-hidden="true"></ion-icon>
                  <ion-label>
                    <h2 class="lobby-section__heading">Agenda</h2>
                  </ion-label>
                </ion-item>
                <div slot="content" class="lobby-section__body">
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
              </ion-accordion>

              @if (lastRevealedRound(); as round) {
                <ion-accordion
                  value="results"
                  class="lobby-section locked-open"
                >
                  <ion-item slot="header" lines="inset">
                    <ion-icon slot="start" name="stats-chart-outline" aria-hidden="true"></ion-icon>
                    <ion-label>
                      <h2 class="lobby-section__heading">{{ resultsHeading() }}</h2>
                    </ion-label>
                  </ion-item>
                  <div slot="content" class="lobby-section__body results-section" [attr.aria-label]="resultsHeading()">
                    @if (lastRoundWasSkipped()) {
                      <p class="round-skipped" role="status">Round skipped</p>
                    } @else {
                      <div class="results-descriptor-row">
                        @if (formatRoundLabel(round); as label) {
                          <p class="results-descriptor">{{ label }}</p>
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
                  </div>
                </ion-accordion>
              }

              @if (pastRevealedRounds().length > 0) {
                <ion-accordion value="history" class="lobby-section">
                  <ion-item slot="header" lines="inset">
                    <ion-icon slot="start" name="time-outline" aria-hidden="true"></ion-icon>
                    <ion-label>
                      <h2 class="lobby-section__heading">History</h2>
                    </ion-label>
                  </ion-item>
                  <div slot="content" class="lobby-section__body">
                    <app-round-history
                      [rounds]="pastRevealedRounds()"
                      [allRounds]="rounds()"
                      [participants]="participants()"
                      [isHost]="isHost()"
                      (editTriggered)="openRoundEditById($event)"
                    />
                  </div>
                </ion-accordion>
              }
            </ion-accordion-group>
          </ion-col>
        </ion-row>
      </ion-grid>
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
      @use '../../theme/breakpoints' as *;
      @use '../../theme/page-container' as *;
      @include page-container(800px);

      @media (min-width: $bp-xl) {
        ion-grid.page-container {
          max-width: 1600px;
        }
      }

      .room-code {
        appearance: none;
        background: transparent;
        border: none;
        padding: 0;
        color: inherit;
        font: inherit;
        font-size: 2.5rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        margin: 0.5rem 0 0.25rem;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-height: 44px;
        cursor: pointer;
      }
      .room-code ion-icon {
        font-size: 1.25rem;
        color: var(--ion-color-medium);
      }
      .room-code:focus-visible {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: 2px;
        border-radius: 4px;
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
        transition: color 120ms ease;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: wrap;
      }
      .subtitle > span {
        min-width: 0;
      }
      .subtitle ion-icon {
        font-size: 1rem;
        color: inherit;
        transition: color 120ms ease;
      }
      .subtitle:focus-visible {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: 2px;
        border-radius: 4px;
      }
      @media (pointer: fine) {
        .subtitle:hover {
          color: var(--hnch-text);
        }
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
        color: var(--avatar-color, var(--ion-color-medium));
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
        padding-inline: var(--ion-margin, 16px);
      }
      ion-accordion.lobby-section {
        background: var(--hnch-elev-1);
        border-radius: 12px;
        margin-bottom: 1rem;
        --background: transparent;
      }
      ion-accordion.lobby-section ion-item[slot='header'] {
        --background: transparent;
        --padding-start: 1rem;
      }
      ion-accordion.lobby-section .lobby-section__heading {
        font-size: 1.05rem;
        font-weight: 600;
        margin: 0;
      }
      ion-accordion.lobby-section ion-icon[slot='start'] {
        margin-inline-end: 0.5rem;
      }
      ion-accordion.lobby-section .lobby-section__body {
        padding: 0.5rem 1rem 1rem;
      }
      ion-accordion.lobby-section .lobby-section__body ion-list {
        background: transparent;
        --ion-item-background: var(--hnch-elev-2);
        border-radius: 8px;
        overflow: hidden;
      }
      ion-accordion.lobby-section .lobby-section__body ion-list ion-item {
        --background: var(--hnch-elev-2);
      }
      ion-accordion.lobby-section.locked-open::part(expand-icon) {
        display: none;
      }
      ion-accordion.lobby-section.locked-open ion-item[slot='header'] {
        --background-hover: transparent;
        pointer-events: none;
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
      .consensus-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 3rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--ion-color-primary);
        text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
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
   * Access state lives here (not in SessionSettingsSheetComponent) so
   * it survives the modal's destroy/recreate lifecycle.
   */
  protected readonly lobbyAccessMode = signal<'open' | 'password'>('open');
  protected readonly lobbyAccessPassword = signal('');

  protected readonly myId = this.participantIdService.id;

  protected readonly hostId = computed(() => this.docService.settings()?.hostParticipantId ?? null);

  protected readonly isParticipantViewer = isParticipantViewer;

  /** Resolved avatar color (ADR-0043). Falls back to deterministic hash of `p.id`. */
  protected colorOf(p: { id: string; avatarColor?: string }): string {
    return resolveAvatarColor(p.avatarColor, p.id);
  }

  /** Toggle own voter↔viewer role. Wired to the self-row chip. */
  protected onToggleRole(): void {
    const id = this.myId();
    if (!id) return;
    this.haptic.impactLight();
    this.docService.toggleRole(id);
  }

  /**
   * Sync the expanded-sections signal from `ion-accordion-group` (ionChange).
   * With `[multiple]="true"`, `detail.value` is a string[] of expanded values.
   * Hedges against the older single-value shape for safety.
   */
  protected onAccordionChange(event: CustomEvent<{ value?: string | string[] | null }>): void {
    const v = event.detail?.value;
    this.expandedSections.set(Array.isArray(v) ? v : v ? [v] : []);
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

  /** Re-export of the shared label helper so the template can call it. */
  protected readonly formatRoundLabel = formatRoundLabel;

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
   * Discarded rounds are tombstones — they never surface as the "last" anchor
   * (no votes were revealed, nothing to display or re-vote from).
   */
  protected readonly lastRevealedRound = computed(() => {
    const rounds = this.rounds();
    for (let i = rounds.length - 1; i >= 0; i--) {
      const r = rounds[i]!;
      if (isTerminalStatus(r.status) && r.status !== 'discarded') return r;
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

  /**
   * 1-based index of `lastRevealedRound` within `rounds()`.
   */
  protected readonly lastRevealedRoundIndex = computed(() => {
    const round = this.lastRevealedRound();
    if (!round) return null;
    const idx = this.rounds().findIndex((r) => r.id === round.id);
    return idx >= 0 ? idx + 1 : null;
  });

  /** Results-section heading — pure-helper backed for unit testability (issue #111). */
  protected readonly resultsHeading = computed(() =>
    buildResultsHeading(this.lastRevealedRound(), this.lastRevealedRoundIndex(), this.rounds()),
  );

  /** True when at least one round has been revealed (gates "Copy results" button). */
  protected readonly hasRevealedRounds = computed(() =>
    this.rounds().some((r) => r.status === 'revealed'),
  );

  /** True when at least one round has reached a terminal state (gates accordion collapse). */
  protected readonly hasTerminalRounds = computed(() =>
    this.rounds().some((r) => isTerminalStatus(r.status)),
  );

  /**
   * Expanded-section values driving the lobby's `ion-accordion-group`s.
   * Seeded by the mode-transition effect; updated by `(ionChange)`.
   */
  protected readonly expandedSections = signal<string[]>([]);
  private prevSurfaceMode: 'mobile' | 'desktop' | null = null;

  /** True when the participants accordion is currently expanded. */
  protected readonly participantsAccordionOpen = computed(() =>
    this.expandedSections().includes('participants'),
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
    return rounds.filter((r) => isTerminalStatus(r.status) && r.id !== last.id);
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
      'ellipsis-horizontal-circle': ellipsisHorizontalCircle,
      'ellipsis-vertical': ellipsisVertical,
      'list-outline': listOutline,
      'log-out-outline': logOutOutline,
      'pencil-outline': pencilOutline,
      'people-outline': peopleOutline,
      'person-circle-outline': personCircleOutline,
      'person-remove-outline': personRemoveOutline,
      'qr-code-outline': qrCodeOutline,
      'settings-outline': settingsOutline,
      'share-outline': shareOutline,
      'star-outline': starOutline,
      'stats-chart-outline': statsChartOutline,
      'time-outline': timeOutline,
    });

    // Mode-transition defaults: re-apply only when surface mode flips.
    // Mobile collapses Share + History; desktop expands every section.
    effect(() => {
      const mode = this.surface.mode();
      if (this.prevSurfaceMode === mode) return;
      const base =
        mode === 'mobile'
          ? ['general', 'participants', 'agenda', 'results']
          : ['general', 'share', 'participants', 'agenda', 'results', 'history'];
      this.expandedSections.set(base);
      this.prevSurfaceMode = mode;
    });

    // Targeted Participants auto-collapse on first reveal (mobile only).
    // Share / History user toggles are preserved.
    effect(() => {
      if (this.hasTerminalRounds() && this.surface.mode() === 'mobile') {
        this.expandedSections.update((v) => v.filter((k) => k !== 'participants'));
      }
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

    // Wire last revealed round into CelebrationService.
    // Only non-skipped revealed rounds trigger celebration; CelebrationService
    // guards internally via consensus() computed.
    effect(() => {
      const round = this.lastRevealedRound();
      this.celebration.setRound(round);
    });

    // Auto-navigate to Estimating whenever this peer no longer belongs on
    // Lobby (issue #508). Covers non-host clients sitting here when the host
    // taps "Start Round" — without this, only the host's click handler
    // navigates. The rule lives in the shared `screenFor` selector; this is
    // the adapter, and unlike Estimating's it pushes rather than replaces.
    //
    // `null` means the projection has not arrived yet (slow-network resume);
    // stay on the screen the URL asked for.
    effect(() => {
      const screen = this.docService.screen();
      if (screen === null || screen === 'lobby') return;
      const code = this.docService.roomCode();
      assertRoomCode(code, 'lobby.autoNav');
      void this.router.navigate(['/estimating', code]);
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

    // Wire confetti layer DOM node to CelebrationService after each render.
    // afterRenderEffect guarantees the read runs after view commit so the
    // element is document-attached when attachLayer() is called (P3-C3).
    afterRenderEffect(() => {
      this.celebration.attachLayer(this.confettiLayer()?.nativeElement ?? null);
    });
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
    this.docService.startRound({
      ...(submission.title !== null && { title: submission.title }),
      ...(submission.ticketId !== null && { ticketId: submission.ticketId }),
      ...(submission.description !== null && { description: submission.description }),
      ...(submission.agendaItemId !== undefined && { agendaItemId: submission.agendaItemId }),
    });

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
    this.docService.startRound({
      parentRoundId: round.id,
      ...(round.title !== undefined && { title: round.title }),
      ...(round.description !== undefined && { description: round.description }),
      ...(round.ticketId !== undefined && { ticketId: round.ticketId }),
      ...(round.agendaItemId !== undefined && { agendaItemId: round.agendaItemId }),
    });
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

  protected onAgendaFormSubmit(submission: AgendaItemFormSubmission): void {
    const mode = this.agendaFormMode();
    if (mode === 'add') {
      this.docService.appendAgendaItem({
        ...(submission.title !== null && { title: submission.title }),
        ...(submission.ticketId !== null && { ticketId: submission.ticketId }),
        ...(submission.description !== null && { description: submission.description }),
      });
    } else {
      const item = this.editingAgendaItem();
      if (!item) return;
      this.docService.updateAgendaItemFields(item.id, {
        ...(submission.title !== null ? { title: submission.title } : { title: '' }),
        ...(submission.ticketId !== null ? { ticketId: submission.ticketId } : { ticketId: '' }),
        ...(submission.description !== null
          ? { description: submission.description }
          : { description: '' }),
      });
    }
    this.agendaFormOpen.set(false);
    this.editingAgendaItem.set(null);
    this.haptic.impactLight();
  }

  protected onAgendaSkip(id: string): void {
    this.haptic.impactMedium();
    this.docService.skipAgendaItem(id);
  }

  protected onAgendaCancel(id: string): void {
    this.haptic.impactMedium();
    this.docService.cancelAgendaItem(id);
  }

  protected onAgendaReorderUp(id: string): void {
    const items = this.docService.pendingAgenda();
    const idx = items.findIndex((i) => i.id === id);
    if (idx <= 0) return;
    const before = idx >= 2 ? items[idx - 2]!.sortKey : null;
    const after = items[idx - 1]!.sortKey;
    this.docService.reorderAgendaItem(id, before, after);
    this.haptic.impactLight();
  }

  protected onAgendaReorderDown(id: string): void {
    const items = this.docService.pendingAgenda();
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0 || idx >= items.length - 1) return;
    const before = items[idx + 1]!.sortKey;
    const after = idx + 2 < items.length ? items[idx + 2]!.sortKey : null;
    this.docService.reorderAgendaItem(id, before, after);
    this.haptic.impactLight();
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
    const uuid = this.docService.meta()?.roomUuid;
    this.docService.endSession();
    // Destructive leave — remove entry so Jump-back-in banner does not reappear (ADR-0044).
    if (uuid) {
      await this.lastSessionService.removeByUuid(uuid);
    } else {
      await this.lastSessionService.clearAll();
    }
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
   * Desktop host-actions popover. Opened by the ellipsis button on each
   * participant row when surface mode is 'desktop'. Mirrors the swipe
   * actions available on mobile.
   */
  protected async openParticipantActions(
    p: { id: string; displayName: string },
    event: Event,
  ): Promise<void> {
    const items: MenuItem[] = [
      {
        text: 'Make host',
        icon: 'star-outline',
        handler: () => this.onHandoffTap(p.id, p.displayName),
      },
      {
        text: 'Remove',
        role: 'destructive',
        icon: 'person-remove-outline',
        handler: () => this.onRemoveTap(p.id, p.displayName),
      },
    ];
    await this.surface.openSheetOrPopover({ items, triggerEvent: event });
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
