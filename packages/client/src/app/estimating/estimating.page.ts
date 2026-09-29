import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  QueryList,
  ViewChildren,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ABSTAIN_SENTINEL,
  canEnterTerminal,
  formatElapsed,
  isAbstainVote,
  isTerminalStatus,
  participantRole,
  roundNumber,
  type ParticipantSnapshot,
} from '@hnch/shared';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonLabel,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  chevronBackOutline,
  closeCircleOutline,
  ellipsisHorizontal,
  eyeOutline,
  logOutOutline,
  playSkipForwardOutline,
  removeCircleOutline,
  timerOutline,
} from 'ionicons/icons';

import { ConnectionStatusBannerComponent } from '../shared/connection-status-banner.component';
import { DocService } from '../core/doc/doc.service';
import { SurfaceService } from '../core/surface.service';
import { HapticService } from '../core/haptic.service';
import { LastSessionService } from '../core/last-session.service';
import { assertRoomCode } from '../core/room-join.service';
import { shouldRecordCache } from '../core/cache-record-guard';
import { ParticipantIdService } from '../core/participant-id.service';
import { TimerTickService } from '../core/timer-tick.service';
import { ToastService } from '../services/toast.service';
import type { MenuItem } from '../shared/menu-popover/menu-popover.component';
import { RoleToggleComponent } from '../shared/role-toggle.component';
import { AvatarVoteRowComponent } from './avatar-vote-row.component';
import {
  buildCancelledRoundToast,
  buildEstimatingTitle,
  parseTicketIdHref,
} from './estimating.helpers';
import { resolveKeyboardCardAction, shouldHandleKeyEvent } from './estimating.keyboard';

/**
 * Estimating — ux.md §5.5.
 *
 * Pick-your-card screen. Presence of a vote is public (shown in the
 * avatar row); the value stays hidden until reveal.
 *
 * Features:
 *  - Toolbar title "Round N" uses the current round's 1-based index.
 *  - What is being estimated: ticket, title and description, all in view.
 *  - Elapsed time stopwatch counting up from round start.
 *  - Card grid with tap-to-vote / tap-again-to-unvote (ADR-0013).
 *  - Unanimous auto-reveal: when all online participants have voted,
 *    `revealedAt` is written automatically (ADR-0018).
 *  - Host-only manual Reveal button, and a host-only menu.
 *  - Auto-navigation to Lobby (with inline results) when `revealedAt` is written.
 */
@Component({
  selector: 'app-estimating',
  host: { class: 'ion-page' },
  imports: [
    AvatarVoteRowComponent,
    ConnectionStatusBannerComponent,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonChip,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonLabel,
    IonTitle,
    IonToolbar,
    RoleToggleComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          @if (showBackChevron()) {
            <ion-button
              [attr.aria-label]="backChevronLabel()"
              (click)="softExit()"
            >
              <ion-icon
                slot="icon-only"
                name="chevron-back-outline"
              ></ion-icon>
            </ion-button>
          }
        </ion-buttons>
        <ion-title role="heading" aria-level="1">{{ pageTitle() }}</ion-title>
        <ion-buttons slot="end">
          @if (isHost()) {
            <ion-button
              aria-label="More options"
              (click)="openActionSheet($event)"
            >
              <ion-icon slot="icon-only" name="ellipsis-horizontal"></ion-icon>
            </ion-button>
          } @else {
            <ion-button
              aria-label="Leave session"
              (click)="confirmLeave()"
            >
              <ion-icon slot="icon-only" name="log-out-outline"></ion-icon>
            </ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div class="page-container">
        <app-connection-status-banner />
        @if (currentRound(); as round) {
          @if (round.ticketId || round.title || round.description) {
            <section class="story" aria-label="What is being estimated">
              @if (round.ticketId) {
                @if (ticketIdHref(); as href) {
                  <a
                    class="ticket-link"
                    [href]="href"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ion-chip class="ticket-chip" color="primary">
                      <ion-label>{{ round.ticketId }}</ion-label>
                    </ion-chip>
                  </a>
                } @else {
                  <ion-chip class="ticket-chip">
                    <ion-label>{{ round.ticketId }}</ion-label>
                  </ion-chip>
                }
              }
              @if (round.title) {
                <h2 class="descriptor">{{ round.title }}</h2>
              }
              @if (round.description) {
                <p class="description-body">{{ round.description }}</p>
              }
            </section>
          }

          <div class="status">
            <div class="status-main">
              <app-avatar-vote-row
                [participants]="onlineVoterParticipants()"
                [votedIds]="votedIds()"
              />
              @if (elapsedLabel(); as label) {
                <p class="elapsed" role="status" aria-live="off">
                  <ion-icon name="timer-outline" aria-hidden="true"></ion-icon>
                  <span>{{ label }}</span>
                </p>
              }
            </div>
            <app-role-toggle [viewer]="isViewer()" (toggled)="onToggleRole()" />
          </div>

          @if (isViewer()) {
            <div class="observer-notice" role="status" aria-live="polite">
              <ion-icon name="eye-outline" aria-hidden="true"></ion-icon>
              <p>You're observing this round</p>
              <p class="observer-hint">Switch to Voter to pick a card.</p>
            </div>
          } @else if (activeRound(); as activeR) {
            <h2 class="section">Pick your estimate</h2>

            <div
              class="grid"
              [class.abstained]="isAbstained()"
              role="group"
              aria-label="Choose your estimate"
            >
              @for (card of activeR.scale.cards; track card; let i = $index) {
                <ion-card
                  #cardEl
                  button
                  class="card"
                  [class.selected]="card === myVote()"
                  [class.focused]="i === focusedIndex()"
                  [attr.aria-pressed]="card === myVote()"
                  [attr.aria-label]="'Card ' + card"
                  [attr.aria-keyshortcuts]="ariaKeyShortcut(i)"
                  [attr.tabindex]="i === rovingTabIndex() ? 0 : -1"
                  (click)="onCardTap(card)"
                >
                  <ion-card-content class="card-face">{{ card }}</ion-card-content>
                </ion-card>
              }
            </div>

            <ion-button
              expand="block"
              [fill]="isAbstained() ? 'solid' : 'clear'"
              color="medium"
              class="abstain-btn"
              [attr.aria-pressed]="isAbstained()"
              aria-label="Abstain this round"
              (click)="onAbstain()"
            >
              @if (isAbstained()) {
                <ion-icon slot="start" name="checkmark-circle" aria-hidden="true"></ion-icon>
                Abstained
              } @else {
                <ion-icon slot="start" name="remove-circle-outline" aria-hidden="true"></ion-icon>
                Abstain this round
              }
            </ion-button>
          }
        } @else {
          <p class="empty">No active round.</p>
        }
      </div>
    </ion-content>

    @if (isHost()) {
      <ion-footer class="cta-bar">
        <ion-toolbar>
          <div class="cta-inner">
            <ion-button
              color="primary"
              [disabled]="!activeRound()"
              (click)="onReveal()"
            >
              Reveal votes
            </ion-button>
          </div>
        </ion-toolbar>
      </ion-footer>
    }

  `,
  styles: [
    `
      @use '../../theme/breakpoints' as *;
      @use '../../theme/page-container' as *;
      @use '../../theme/a11y' as *;
      @include page-container(800px);

      .story {
        margin-block-end: 16px;
      }
      .ticket-link {
        display: inline-block;
        text-decoration: none;
      }
      .ticket-chip {
        --background: var(--hnch-fill);
        --color: var(--hnch-text);
        height: auto;
        min-height: 28px;
        margin: 0 0 8px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.8125rem;
      }
      .ticket-link .ticket-chip {
        --color: var(--hnch-accent-text);
      }
      .ticket-chip ion-label {
        overflow-wrap: anywhere;
        white-space: normal;
      }
      .descriptor {
        margin: 0;
        color: var(--hnch-text);
        font-size: 1.375rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }
      .description-body {
        margin: 6px 0 0;
        color: var(--hnch-muted);
        font-size: 0.9375rem;
        line-height: 1.45;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }

      /* Who has voted and for how long, with the role switch beside it. */
      .status {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .status-main {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
      .elapsed {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        color: var(--hnch-muted);
        font-size: 0.875rem;
        font-variant-numeric: tabular-nums;
      }
      .elapsed ion-icon {
        font-size: 1rem;
      }

      .section {
        margin: 24px 0 12px;
        font-size: 1.0625rem;
        font-weight: 600;
      }
      /* Three columns on a phone: a whole Fibonacci scale without scrolling. */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
        gap: 10px;
      }
      @media (min-width: $bp-md) {
        .grid {
          grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
          gap: 12px;
        }
      }
      .card {
        margin: 0;
        border: 2px solid transparent;
        border-radius: 14px;
        background: var(--hnch-elev-1);
        box-shadow: var(--hnch-shadow-1);
        transition: border-color 0.15s ease, background 0.15s ease,
          transform 0.15s ease;
      }
      .card-face {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 72px;
        padding: 0 4px;
        color: var(--hnch-text);
        font-size: 1.625rem;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        line-height: 1;
      }
      .card.selected {
        border-color: var(--hnch-accent-text);
        background: rgba(var(--hnch-accent-text-rgb), 0.16);
        transform: scale(1.02);
      }
      .card.selected .card-face {
        color: var(--hnch-accent-text);
      }
      @include hover-only {
        .grid:not(.abstained) .card:not(.selected):not(:focus-visible):hover {
          border-color: var(--hnch-sep-strong);
          background: var(--hnch-fill);
          cursor: pointer;
        }
      }
      .card.focused:not(.selected),
      .card:focus-visible {
        outline: 2px solid var(--hnch-accent-text);
        outline-offset: 2px;
      }
      .grid.abstained {
        opacity: 0.4;
      }
      @media (prefers-reduced-motion: reduce) {
        .card {
          transition: none;
        }
        .card.selected {
          transform: none;
        }
      }
      .abstain-btn {
        min-height: 44px;
        margin: 12px 0 0;
      }

      .empty {
        margin: 32px 0;
        color: var(--hnch-muted);
        text-align: center;
      }
      .observer-notice {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        margin: 40px 0;
        color: var(--hnch-muted);
        text-align: center;
      }
      .observer-notice ion-icon {
        margin-block-end: 4px;
        font-size: 2rem;
      }
      .observer-notice p {
        margin: 0;
        color: var(--hnch-text);
        font-size: 1.0625rem;
        font-weight: 600;
      }
      .observer-notice .observer-hint {
        color: var(--hnch-muted);
        font-size: 0.9375rem;
        font-weight: 400;
      }
    `,
  ],
})
export class EstimatingPage {
  private readonly router = inject(Router);
  private readonly docService = inject(DocService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly haptic = inject(HapticService);
  private readonly lastSessionService = inject(LastSessionService);
  private readonly timerTick = inject(TimerTickService);
  private readonly surface = inject(SurfaceService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toast = inject(ToastService);

  protected readonly currentRound = this.docService.currentRound;
  protected readonly activeRound = this.docService.activeRound;
  protected readonly onlineParticipants = this.docService.onlineParticipants;

  // Tracks the last uuid written to the cache so the effect does not
  // re-fire on every Yjs doc mutation while connected to the same room.
  // Reset to null when status leaves 'connected' so a reconnect
  // re-writes and bumps the TTL.
  private lastRecordedUuid: string | null = null;

  // The round this page last showed as active. When the page is sent back to
  // the Lobby it looks the round up again to tell a cancelled round — which
  // leaves nothing behind on the Lobby — from one that ended with a result.
  private lastActiveRoundId: string | null = null;

  constructor() {
    addIcons({
      'checkmark-circle': checkmarkCircle,
      'chevron-back-outline': chevronBackOutline,
      'close-circle-outline': closeCircleOutline,
      'ellipsis-horizontal': ellipsisHorizontal,
      'eye-outline': eyeOutline,
      'log-out-outline': logOutOutline,
      'play-skip-forward-outline': playSkipForwardOutline,
      'remove-circle-outline': removeCircleOutline,
      'timer-outline': timerOutline,
    });

    effect(() => {
      const round = this.docService.activeRound();
      if (round) this.lastActiveRoundId = round.id;
    });

    // Bump `hnch.lastSession` so a reopen lands on Estimating rather
    // than Lobby (plan §3.8). Deduped via lastRecordedUuid so we don't
    // write on every Yjs doc mutation while staying connected
    // (ADR-0022 §5).
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
          lastScreen: 'estimating',
        });
      }
    });

    // Auto-navigate to Lobby whenever this peer no longer belongs on
    // Estimating (issue #508). The rule lives in the shared `screenFor`
    // selector; this is the adapter. It covers every way the round can close
    // — unanimous auto-reveal, host manual reveal, host skip, and host
    // discard, including the discard of a session's only round, which the
    // old anchor-selector effect structurally could not see.
    //
    // `null` means the projection has not arrived yet (slow-network resume);
    // stay on the screen the URL asked for rather than bouncing to Lobby.
    effect(() => {
      const screen = this.docService.screen();
      if (screen === null || screen === 'estimating') return;
      const activeCode = this.docService.roomCode();
      assertRoomCode(activeCode, 'estimating.autoNav');
      untracked(() => this.announceCancelledRound());
      void this.router.navigate(['/lobby', activeCode], { replaceUrl: true });
    });

    // Clear the transient keyboard focus cursor when the round changes
    // (issue #154) — otherwise a stale index from a previous scale leaks
    // into the new round's grid. Only reacts to id transitions: a bare
    // `currentRound()` read inside an effect would re-fire on every Yjs
    // awareness update (new projection ref, same id) and wipe the focus
    // cursor mid-arrow-nav.
    let lastRoundId: string | undefined;
    effect(() => {
      const roundId = this.docService.currentRound()?.id;
      if (roundId !== lastRoundId) {
        lastRoundId = roundId;
        this.focusedIndex.set(undefined);
      }
    });

    // Unanimous auto-reveal feedback (ADR-0018). The rule and its driver are
    // session-scoped in `DocService` via the shared `startAutoReveal` — this
    // page only supplies the device feedback, keyed off the monotonic counter
    // the driver bumps when a reveal actually lands. Seeding the tracker at
    // construction means the effect's initial run is inert, so mounting the
    // page after an earlier auto-reveal does not re-fire; and a lost race
    // never bumps the counter, so there is no spurious feedback either.
    let lastAutoRevealCount = this.docService.autoRevealCount();
    effect(() => {
      const count = this.docService.autoRevealCount();
      if (count !== lastAutoRevealCount) {
        lastAutoRevealCount = count;
        this.haptic.notificationSuccess();
      }
    });
  }

  /**
   * A cancelled round is a tombstone (ADR-0046): it shows up nowhere on the
   * Lobby, so without a word the voters would be moved off the cards for no
   * visible reason. The host is told by `softExit`, at the tap.
   */
  private announceCancelledRound(): void {
    const roundId = this.lastActiveRoundId;
    this.lastActiveRoundId = null;
    if (roundId === null || this.isHost()) return;
    const round = this.docService.rounds().find((r) => r.id === roundId);
    if (round?.status !== 'discarded') return;
    void this.toast.info(buildCancelledRoundToast(false));
  }

  private readonly myId = this.participantIdService.id;

  @ViewChildren('cardEl', { read: ElementRef })
  private readonly cardEls!: QueryList<ElementRef<HTMLElement>>;

  /**
   * Transient keyboard focus cursor (issue #154). Distinct from `myVote()`
   * — arrow keys move this without writing to the doc; Enter/Space then
   * commits the focused card.
   */
  protected readonly focusedIndex = signal<number | undefined>(undefined);

  /**
   * Roving tabindex target. Defaults to the focused card if any, else
   * the currently-voted card, else the first card. Keeps a single card
   * in the natural tab order — Tab/Shift+Tab into the grid then arrows
   * to navigate.
   */
  protected readonly rovingTabIndex = computed<number>(() => {
    const focus = this.focusedIndex();
    if (focus !== undefined) return focus;
    const round = this.currentRound();
    const vote = this.myVote();
    if (round && vote !== null) {
      const idx = round.scale.cards.indexOf(vote);
      if (idx >= 0) return idx;
    }
    return 0;
  });

  /** ARIA hint per card index — digits 1–9 → indices 0–8, digit 0 → index 9. */
  protected ariaKeyShortcut(index: number): string | null {
    if (index >= 0 && index <= 8) return `Digit${index + 1}`;
    if (index === 9) return 'Digit0';
    return null;
  }

  /**
   * The number the current round goes by — the same one the Lobby and the
   * history show for it later. Returns `null` when there's no active round
   * (transient — we just navigated in).
   */
  protected readonly roundIndex = computed(() => {
    const round = this.currentRound();
    if (!round) return null;
    const number = roundNumber(round, this.docService.rounds());
    return number > 0 ? number : null;
  });

  /** Toolbar title: "Round 3". */
  protected readonly pageTitle = computed(() => buildEstimatingTitle(this.roundIndex()));

  /** The current user's card, or `null` when they haven't voted yet. */
  protected readonly myVote = computed<string | null>(() => {
    const id = this.myId();
    const round = this.currentRound();
    if (!id || !round) return null;
    return round.votes[id] ?? null;
  });

  /** True when the current user has abstained this round (sentinel vote). */
  protected readonly isAbstained = computed<boolean>(() => {
    const vote = this.myVote();
    return vote !== null && isAbstainVote(vote);
  });

  /**
   * Set of participantIds that have a vote in the current round,
   * filtered against awareness. A peer that cast a vote and then
   * silently dropped (no close frame, just a dead connection) keeps
   * its entry in `round.votes` — cast vote is authoritative — but we
   * don't want the avatar row to keep showing
   * them as "voted" when the tally won't include them on reveal.
   * Revealed chips (§3.7) intentionally skip this filter because
   * there the tally *is* the post-reveal record.
   */
  protected readonly votedIds = computed<ReadonlySet<string>>(() => {
    const round = this.currentRound();
    if (!round) return new Set();
    const voterIds = this.onlineVoterIds();
    return new Set(Object.keys(round.votes).filter((id) => voterIds.has(id)));
  });

  protected readonly onlineVoterIds = computed<ReadonlySet<string>>(() => {
    const online = this.docService.onlineParticipantIds();
    const activeParticipants = this.docService.activeParticipants();
    return new Set(
      activeParticipants
        .filter((p) => online.has(p.id) && participantRole(p) !== 'viewer')
        .map((p) => p.id),
    );
  });

  protected readonly onlineVoterParticipants = computed<readonly ParticipantSnapshot[]>(() => {
    const voterIds = this.onlineVoterIds();
    const activeParticipants = this.docService.activeParticipants();
    return activeParticipants.filter((p) => voterIds.has(p.id));
  });

  protected readonly isHost = computed(() => {
    const myId = this.myId();
    const hostId = this.docService.settings()?.hostParticipantId;
    return !!myId && !!hostId && myId === hostId;
  });

  /**
   * Back chevron is visible to the host always (so they can discard an
   * active round) and to voters/viewers only after the round reaches a
   * terminal state (so they can soft-exit but cannot interrupt active
   * voting). See ADR superseding ADR-0013.
   */
  protected readonly showBackChevron = computed<boolean>(() => {
    if (this.isHost()) return true;
    const round = this.currentRound();
    return round !== null && isTerminalStatus(round.status);
  });

  protected readonly backChevronLabel = computed<string>(() => {
    const round = this.currentRound();
    if (this.isHost() && round && canEnterTerminal(round.status)) {
      return 'Cancel round and go back to the lobby';
    }
    return 'Back to lobby';
  });

  /** True when the current user's effective role is `'viewer'`. */
  protected readonly isViewer = computed(() => {
    const myId = this.myId();
    if (!myId) return false;
    const me = this.docService.activeParticipants().find((p) => p.id === myId);
    return me ? participantRole(me) === 'viewer' : false;
  });

  /**
   * Elapsed voting time label (M:SS counting up), or `null` before the
   * round's stopwatch has started. Driven by the 4 Hz wall-clock tick.
   */
  /**
   * Reactive http(s) URL parsed from `round.ticketId`, or `null` when
   * the value is missing or non-URL. Single parse point — template uses
   * the result to switch between an anchor-wrapped chip and a plain chip.
   */
  protected readonly ticketIdHref = computed<string | null>(() => {
    return parseTicketIdHref(this.currentRound()?.ticketId);
  });

  // A live ticker has no terminal timestamp, so it calls the duration
  // primitive directly rather than `formatRoundElapsed`. Clamping is
  // `formatElapsed`'s job and only its job — no call-site clamp here.
  protected readonly elapsedLabel = computed<string | null>(() => {
    const round = this.docService.currentRound();
    if (!round || round.timerStartedAt === undefined) return null;
    return formatElapsed(this.timerTick.now() - round.timerStartedAt);
  });

  protected onToggleRole(): void {
    if (!this.myId()) return;
    this.haptic.impactLight();
    this.docService.commands.toggleRole();
  }

  protected onCardTap(card: string): void {
    if (!this.myId()) return;
    if (!this.docService.commands.toggleCurrentVote(card).applied) return;
    this.haptic.impactLight();
  }

  /**
   * Keyboard shortcuts for the Estimating card grid (issue #154).
   *
   * Bail conditions enforced here (out of the pure resolver):
   *  - active element is editable (input / textarea / contenteditable);
   *  - any Ionic overlay (action-sheet, alert, modal, popover, loading)
   *    is mounted above the page;
   *  - no current round, round is terminal, or local user is a viewer.
   */
  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    const round = this.currentRound();
    const gateOk = shouldHandleKeyEvent({
      defaultPrevented: event.defaultPrevented,
      activeElement: document.activeElement,
      overlayPresent: !!document.querySelector(
        'ion-action-sheet:not(.overlay-hidden), ion-alert:not(.overlay-hidden), ion-modal:not(.overlay-hidden), ion-popover:not(.overlay-hidden), ion-loading:not(.overlay-hidden)',
      ),
      roundActive: !!round && canEnterTerminal(round.status),
      isViewer: this.isViewer(),
    });
    if (!gateOk || !round || !this.myId()) return;

    const active = document.activeElement;
    const cardRefs = this.cardEls?.toArray() ?? [];
    const domFocusedIndex = active ? cardRefs.findIndex((ref) => ref.nativeElement === active) : -1;
    const activeElementIsCard = domFocusedIndex >= 0;
    // Honour an already-DOM-focused card when the in-component cursor
    // is undefined — otherwise ArrowRight from a Tab-focused card would
    // jump back to index 0 instead of moving forward by one.
    const effectiveFocus =
      this.focusedIndex() ?? (activeElementIsCard ? domFocusedIndex : undefined);

    const action = resolveKeyboardCardAction(
      {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      },
      round.scale.cards,
      this.myVote() ?? undefined,
      effectiveFocus,
      activeElementIsCard,
    );

    if (action.kind === 'noop') return;
    event.preventDefault();

    switch (action.kind) {
      case 'cast':
        if (!this.docService.commands.toggleCurrentVote(action.card).applied) return;
        this.focusedIndex.set(action.index);
        this.haptic.impactLight();
        queueMicrotask(() => this.focusCardAt(action.index));
        break;
      case 'focus':
        this.focusedIndex.set(action.index);
        this.focusCardAt(action.index);
        break;
    }
  }

  private focusCardAt(index: number): void {
    const refs = this.cardEls?.toArray() ?? [];
    const el = refs[index]?.nativeElement;
    if (el && typeof el.focus === 'function') el.focus();
  }

  protected onAbstain(): void {
    if (!this.myId()) return;
    if (!this.docService.commands.toggleCurrentVote(ABSTAIN_SENTINEL).applied) return;
    this.haptic.impactLight();
  }

  protected async onReveal(): Promise<void> {
    if (!this.docService.commands.revealCurrentRound().applied) return;
    this.haptic.impactMedium();
    const code = this.docService.roomCode();
    assertRoomCode(code, 'estimating.onReveal');
    // replaceUrl: back-nav from Lobby (results view) should pop to the
    // screen before Estimating, not bounce back here (plan §3.10).
    await this.router.navigate(['/lobby', code], { replaceUrl: true });
  }

  /**
   * Soft exit — back-chevron path. Navigates back to Lobby in the SAME
   * session WITHOUT clearing the cache. Does not tear down the WebSocket.
   *
   * Host branch: when an active (non-terminal) round is in progress, write
   * `discardedAt` first so the round becomes a tombstone (linked agenda
   * item stays `pending`) and Lobby's auto-nav does not bounce the host
   * straight back into Estimating. See ADR superseding ADR-0013.
   */
  protected softExit(): void {
    const code = this.docService.roomCode();
    assertRoomCode(code, 'estimating.softExit');
    if (this.isHost() && this.docService.commands.discardCurrentRound().applied) {
      this.haptic.impactLight();
      void this.toast.info(buildCancelledRoundToast(true));
    }
    void this.router.navigate(['/lobby', code]);
  }

  /**
   * The host's ⋯ menu. Everyone else has nothing to choose between — their
   * one action, Leave, is a button in the toolbar instead. Session settings
   * are not offered here: they live on the Lobby, and nobody can be on the
   * Lobby while a round is running.
   */
  protected async openActionSheet(event: Event): Promise<void> {
    const items: MenuItem[] = [];

    if (this.isHost()) {
      const round = this.currentRound();
      if (round && canEnterTerminal(round.status)) {
        items.push({
          text: 'Skip round',
          icon: 'play-skip-forward-outline',
          handler: () => {
            this.onSkip();
          },
        });
      }
      items.push({
        text: 'End session for everyone',
        icon: 'close-circle-outline',
        role: 'destructive',
        handler: () => {
          void this.confirmEndSession();
        },
      });
    }

    items.push(
      {
        text: 'Leave session',
        icon: 'log-out-outline',
        role: 'destructive',
        handler: () => {
          void this.confirmLeave();
        },
      },
      { text: 'Cancel', role: 'cancel' },
    );

    await this.surface.openSheetOrPopover({ triggerEvent: event, items });
  }

  /**
   * Destructive-action confirmation (ux.md §2). Reached from the host's menu
   * and from everyone else's toolbar button.
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
    if (this.myId()) {
      // Write the soft-delete before disconnecting so peers see the removal (ADR-0036).
      this.docService.commands.leave();
      // Flush the Yjs update through the WebSocket before closing (best-effort, 500 ms cap).
      await this.docService.flushUpdates();
    }
    const uuid = this.docService.meta()?.roomUuid;
    this.docService.teardown();
    // Destructive leave — remove entry so Jump-back-in banner does not reappear (ADR-0044).
    if (uuid) {
      await this.lastSessionService.removeByUuid(uuid);
    } else {
      await this.lastSessionService.clearAll();
    }
    await this.router.navigate(['/home']);
  }

  private onSkip(): void {
    if (this.docService.commands.skipCurrentRound().applied) {
      this.haptic.impactHeavy();
    }
  }

  private async confirmEndSession(): Promise<void> {
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
}
