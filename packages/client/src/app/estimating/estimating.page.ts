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
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ABSTAIN_SENTINEL,
  canEnterTerminal,
  formatElapsed,
  isAbstainVote,
  isTerminalStatus,
  participantRole,
  shouldAutoReveal,
  type ParticipantSnapshot,
} from '@hnch/shared';
import {
  AlertController,
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonChip,
  IonCol,
  IonContent,
  IonFooter,
  IonGrid,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonRow,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  chevronBackOutline,
  closeCircleOutline,
  ellipsisHorizontalCircle,
  logOutOutline,
  removeCircleOutline,
  settingsOutline,
} from 'ionicons/icons';

import { ConnectionChipComponent } from '../core/connection-chip.component';
import { ConnectionStatusBannerComponent } from '../shared/connection-status-banner.component';
import { DocService } from '../core/doc/doc.service';
import { SurfaceService } from '../core/surface.service';
import { HapticService } from '../core/haptic.service';
import { LastSessionService } from '../core/last-session.service';
import { assertRoomCode } from '../core/room-join.service';
import { shouldRecordCache } from '../core/cache-record-guard';
import { ParticipantIdService } from '../core/participant-id.service';
import { TimerTickService } from '../core/timer-tick.service';
import { AvatarVoteRowComponent } from './avatar-vote-row.component';
import { resolveKeyboardCardAction, shouldHandleKeyEvent } from './estimating.keyboard';

/**
 * Estimating — ux.md §5.5.
 *
 * Pick-your-card screen. Presence of a vote is public (shown in the
 * avatar row); the value stays hidden until reveal.
 *
 * Features:
 *  - Title "Round N" uses the current round's 1-based index.
 *  - Elapsed time stopwatch counting up from round start.
 *  - Card grid with tap-to-vote / tap-again-to-unvote (ADR-0013).
 *  - Unanimous auto-reveal: when all online participants have voted,
 *    `revealedAt` is written automatically (ADR-0018).
 *  - Host-only manual Reveal button.
 *  - Auto-navigation to Lobby (with inline results) when `revealedAt` is written.
 */
@Component({
  selector: 'app-estimating',
  host: { class: 'ion-page' },
  imports: [
    AvatarVoteRowComponent,
    ConnectionChipComponent,
    ConnectionStatusBannerComponent,
    IonAccordion,
    IonAccordionGroup,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonChip,
    IonCol,
    IonContent,
    IonFooter,
    IonGrid,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonRow,
    IonTitle,
    IonToolbar,
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
        <ion-title>Estimating</ion-title>
        <ion-buttons slot="end">
          <ion-chip
            [color]="isViewer() ? 'medium' : 'primary'"
            [attr.aria-label]="isViewer() ? 'You are observing. Tap to switch to voter.' : 'You are a voter. Tap to switch to observer.'"
            [attr.aria-pressed]="isViewer()"
            (click)="onToggleRole()"
          >
            <ion-label>{{ isViewer() ? 'Observing' : 'Voter' }}</ion-label>
          </ion-chip>
          <app-connection-chip></app-connection-chip>
          <ion-button
            aria-label="More options"
            (click)="openActionSheet($event)"
          >
            <ion-icon slot="icon-only" name="ellipsis-horizontal-circle"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-grid fixed class="page-container">
        <ion-row><ion-col>
      <app-connection-status-banner />
      @if (currentRound(); as round) {
        <h1 class="title">Round {{ roundIndex() }}</h1>

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
          <p class="descriptor">{{ round.title }}</p>
        }

        @if (round.description) {
          <ion-accordion-group class="description-accordion-group">
            <ion-accordion value="description">
              <ion-item slot="header" lines="none" class="description-header">
                <ion-label>Details</ion-label>
              </ion-item>
              <div slot="content" class="description-body">
                {{ round.description }}
              </div>
            </ion-accordion>
          </ion-accordion-group>
        }

        @if (elapsedLabel(); as label) {
          <p class="elapsed" role="status" aria-live="off">{{ label }}</p>
        }

        <app-avatar-vote-row
          [participants]="onlineVoterParticipants()"
          [votedIds]="votedIds()"
        />

        @if (isViewer()) {
          <p class="observer-notice" role="status" aria-live="polite">
            You're observing this round
          </p>
        } @else {
          <h2 class="section">Pick your estimate</h2>

          <div
            class="grid"
            [class.abstained]="isAbstained()"
            role="group"
            aria-label="Choose your estimate"
          >
            @for (card of round.scale.cards; track card; let i = $index) {
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
                <ion-card-content class="card-face">
                  {{ card }}
                </ion-card-content>
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
        </ion-col></ion-row>
      </ion-grid>
    </ion-content>

    @if (isHost()) {
      <ion-footer class="cta-bar">
        <ion-toolbar>
          <ion-button
            expand="block"
            color="primary"
            [disabled]="!currentRound()"
            (click)="onReveal()"
          >
            Reveal Votes
          </ion-button>
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

      .title {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0.25rem 0 0.25rem;
      }
      .descriptor {
        margin: 0 0 0.75rem;
        color: var(--hnch-text-2);
        font-weight: 500;
      }
      .elapsed {
        font-size: 0.875rem;
        font-weight: 400;
        font-variant-numeric: tabular-nums;
        margin: 0.5rem 0 1rem;
        color: var(--hnch-muted);
      }
      .ticket-link {
        text-decoration: none;
        display: inline-block;
      }
      .ticket-chip {
        --background: var(--hnch-elev-1);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        margin: 0 0 0.5rem;
      }
      .description-accordion-group {
        margin: 0 0 0.75rem;
        background: var(--hnch-elev-1);
        border-radius: 8px;
        overflow: hidden;
      }
      .description-header {
        --background: var(--hnch-elev-1);
      }
      .description-body {
        padding: 0.75rem 1rem 1rem;
        color: var(--hnch-text-2);
        white-space: pre-wrap;
      }
      .section {
        margin: 1.5rem 0 0.5rem;
        font-size: 1.0625rem;
        font-weight: 600;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 0.75rem;
      }
      .card {
        margin: 0;
        border: 2px solid transparent;
        transition: border-color 0.15s ease, background 0.15s ease,
          transform 0.15s ease, box-shadow 0.15s ease;
      }
      .card.selected {
        border-color: var(--ion-color-primary);
        background: var(--ion-color-primary-tint);
        transform: scale(1.02);
        box-shadow: 0 2px 8px rgba(var(--ion-color-primary-rgb), 0.3);
      }
      @include hover-only {
        .grid:not(.abstained) .card:not(.selected):not(:focus-visible):hover {
          border-color: var(--hnch-sep-strong);
          background: var(--hnch-fill);
          cursor: pointer;
        }
      }
      .card.focused:not(.selected) {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: 2px;
      }
      .card:focus-visible {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: 2px;
      }
      .card-face {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 4.5rem;
        font-size: 1.75rem;
        font-weight: 700;
      }
      @media (prefers-reduced-motion: reduce) {
        .card {
          transition: none;
        }
      }
      .grid.abstained {
        opacity: 0.4;
      }
      @media (prefers-reduced-motion: reduce) {
        .grid.abstained {
          transition: none;
        }
      }
      .abstain-btn {
        margin-top: 1rem;
      }
      .empty {
        color: var(--ion-color-medium);
        margin: 2rem 0;
        text-align: center;
      }
      .observer-notice {
        margin: 2rem 0;
        text-align: center;
        color: var(--ion-color-medium);
        font-size: 1.1rem;
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

  protected readonly currentRound = this.docService.currentRound;
  protected readonly onlineParticipants = this.docService.onlineParticipants;

  // Tracks the last uuid written to the cache so the effect does not
  // re-fire on every Yjs doc mutation while connected to the same room.
  // Reset to null when status leaves 'connected' so a reconnect
  // re-writes and bumps the TTL.
  private lastRecordedUuid: string | null = null;

  constructor() {
    addIcons({
      'checkmark-circle': checkmarkCircle,
      'chevron-back-outline': chevronBackOutline,
      'close-circle-outline': closeCircleOutline,
      'ellipsis-horizontal-circle': ellipsisHorizontalCircle,
      'log-out-outline': logOutOutline,
      'remove-circle-outline': removeCircleOutline,
      'settings-outline': settingsOutline,
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

    // Auto-navigate to Lobby when round reaches a terminal state (revealed
    // or skipped) — covers unanimous auto-reveal, host manual reveal, and
    // host skip. Scoped to this component's lifetime.
    effect(() => {
      const round = this.docService.currentRound();
      if (round !== null && round !== undefined && isTerminalStatus(round.status)) {
        const activeCode = this.docService.roomCode();
        assertRoomCode(activeCode, 'estimating.autoNav');
        void this.router.navigate(['/lobby', activeCode], { replaceUrl: true });
      }
    });

    // Discard recovery: when the host writes `discardedAt` on the round this
    // peer is currently looking at, navigate back to Lobby. The active-round
    // projection (`currentRound()`) excludes discarded rounds, so the
    // primary auto-nav effect above does NOT see this transition when the
    // discarded round was the only one in the session. Looks at the raw
    // rounds array against the entry-round id captured at mount. See ADR
    // superseding ADR-0013.
    let entryRoundId: string | undefined;
    effect(() => {
      const round = this.docService.currentRound();
      if (entryRoundId === undefined && round !== null && round !== undefined) {
        entryRoundId = round.id;
        return;
      }
      if (entryRoundId === undefined) return;
      const tracked = this.docService.rounds().find((r) => r.id === entryRoundId);
      if (tracked !== undefined && tracked.status === 'discarded') {
        const activeCode = this.docService.roomCode();
        assertRoomCode(activeCode, 'estimating.discardRecovery');
        void this.router.navigate(['/lobby', activeCode], { replaceUrl: true });
      }
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

    // Unanimous auto-reveal: when all online voters have voted,
    // write `revealedAt`. Guard: require at least 1 online voter (ADR-0018).
    effect(() => {
      const round = this.docService.currentRound();
      const participants = this.docService.participants();
      const onlineIds = this.docService.onlineParticipantIds();
      if (shouldAutoReveal(round, participants, onlineIds)) {
        this.haptic.notificationSuccess();
        this.docService.revealRound(round!.id);
      }
    });
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
   * 1-based index of the current round within `rounds()`. Re-votes and
   * Next Round both append, so the array-index lookup is exact. Returns
   * `null` when there's no active round (transient — we just navigated
   * in).
   */
  protected readonly roundIndex = computed(() => {
    const round = this.currentRound();
    if (!round) return null;
    const rounds = this.docService.rounds();
    const idx = rounds.findIndex((r) => r.id === round.id);
    return idx >= 0 ? idx + 1 : null;
  });

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
      return 'Discard round and return to lobby';
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

  protected readonly elapsedLabel = computed<string | null>(() => {
    const round = this.docService.currentRound();
    if (!round || round.timerStartedAt === undefined) return null;
    const elapsed = this.timerTick.now() - round.timerStartedAt;
    return formatElapsed(Math.max(0, elapsed));
  });

  protected onToggleRole(): void {
    const id = this.myId();
    if (!id) return;
    this.haptic.impactLight();
    this.docService.toggleRole(id);
  }

  protected onCardTap(card: string): void {
    const id = this.myId();
    const round = this.currentRound();
    if (!id || !round) return;

    if (this.myVote() === card) {
      this.docService.clearVote(round.id, id);
    } else {
      this.docService.castVote(round.id, id, card);
    }
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
    const id = this.myId();
    const gateOk = shouldHandleKeyEvent({
      defaultPrevented: event.defaultPrevented,
      activeElement: document.activeElement,
      overlayPresent: !!document.querySelector(
        'ion-action-sheet:not(.overlay-hidden), ion-alert:not(.overlay-hidden), ion-modal:not(.overlay-hidden), ion-popover:not(.overlay-hidden), ion-loading:not(.overlay-hidden)',
      ),
      roundActive: !!round && canEnterTerminal(round.status),
      isViewer: this.isViewer(),
    });
    if (!gateOk || !round || !id) return;

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
        this.docService.castVote(round.id, id, action.card);
        this.focusedIndex.set(action.index);
        this.haptic.impactLight();
        queueMicrotask(() => this.focusCardAt(action.index));
        break;
      case 'clear':
        this.docService.clearVote(round.id, id);
        this.haptic.impactLight();
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
    const id = this.myId();
    const round = this.currentRound();
    if (!id || !round) return;
    // Toggle: if already abstained, clear; otherwise write sentinel.
    if (this.isAbstained()) {
      this.docService.clearVote(round.id, id);
    } else {
      this.docService.castVote(round.id, id, ABSTAIN_SENTINEL);
    }
    this.haptic.impactLight();
  }

  protected async onReveal(): Promise<void> {
    const round = this.currentRound();
    if (!round || !canEnterTerminal(round.status)) return;
    this.haptic.impactMedium();
    this.docService.revealRound(round.id);
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
    const round = this.currentRound();
    const myId = this.myId();
    if (this.isHost() && myId && round && canEnterTerminal(round.status)) {
      this.haptic.impactLight();
      this.docService.discardRound(round.id, myId);
    }
    void this.router.navigate(['/lobby', code]);
  }

  protected async openActionSheet(event: Event): Promise<void> {
    const items: { text: string; icon?: string; role?: string; handler?: () => void }[] = [
      {
        text: 'Session settings',
        icon: 'settings-outline',
        handler: () => {
          // Navigate to lobby (session settings sheet lives there).
          const code = this.docService.roomCode();
          assertRoomCode(code, 'estimating.openActionSheet[Session settings]');
          void this.router.navigate(['/lobby', code]);
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
      const round = this.currentRound();
      if (round && canEnterTerminal(round.status)) {
        items.splice(1, 0, {
          text: 'Skip round',
          icon: 'close-circle-outline',
          role: 'destructive',
          handler: () => {
            this.onSkip();
          },
        });
      }
      items.splice(items.length - 1, 0, {
        text: 'End session for everyone',
        icon: 'close-circle-outline',
        role: 'destructive',
        handler: () => {
          void this.confirmEndSession();
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

  private async confirmLeave(): Promise<void> {
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

  private onSkip(): void {
    const round = this.currentRound();
    if (!round) return;
    this.haptic.impactHeavy();
    this.docService.skipRound(round.id);
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
            this.haptic.impactHeavy();
            this.docService.endSessionForEveryone();
          },
        },
      ],
    });
    await alert.present();
  }
}

// ---------------------------------------------------------------------------
/**
 * Pure: parse a raw `ticketId` field into an http(s) URL string suitable
 * for an `<a href>`, or `null` when the value is absent or not a URL.
 * Trims whitespace, requires `http:` or `https:` protocol.
 */
export function parseTicketIdHref(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.host === '') return null;
    return trimmed;
  } catch {
    return null;
  }
}
