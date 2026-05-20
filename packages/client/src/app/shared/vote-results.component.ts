import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  computeRoundStats,
  formatElapsed,
  isAbstainVote,
  isActiveParticipant,
  isConsensus,
  terminalState,
} from '@hnch/shared';
import type { ParticipantSnapshot, Round, RoundStats, SpreadLabel } from '@hnch/shared';
import { IonChip, IonItemGroup, IonLabel } from '@ionic/angular/standalone';

import { HapticService } from '../core/haptic.service';

/**
 * One card's worth of voters, ready for template rendering.
 * `scaleIndex` captures the card's position in the round's scale so
 * the group sort can tie-break "numerical" scales like Fibonacci by
 * their natural order rather than lexicographic string order.
 */
interface VoteGroup {
  readonly card: string;
  readonly scaleIndex: number;
  readonly voterNames: readonly string[];
}

interface ConfettiPiece {
  readonly id: number;
  readonly emoji: string;
  readonly angle: number;
  readonly distance: number;
  readonly rotate: number;
  readonly duration: number;
  readonly delay: number;
}

const CONFETTI_EMOJIS = ['🎉', '🎊', '🥳', '🪩', '✨', '🎈', '🌟'] as const;

/**
 * VoteResultsComponent — displays the full grouped vote-results view for a
 * single revealed round. Extracted from RevealedPage so Lobby can inline it.
 *
 * Inputs:
 *  - `round` — the revealed Round to display
 *  - `participants` — current participant list (for name lookup)
 *  - `myId` — this client's participant id (used to label "You (Name)")
 *
 * Fires the reveal-complete haptic once per round (tracked by round id) after
 * the stagger animation completes.
 */
@Component({
  selector: 'app-vote-results',
  imports: [DecimalPipe, IonChip, IonItemGroup, IonLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (group of voteGroups(); track group.card; let i = $index; let first = $first) {
      <ion-item-group
        class="group"
        [class.plurality]="first"
        [style.--i]="i"
        [style.--bar-width.%]="widthPct(group.voterNames.length)"
        [attr.aria-label]="voteCountLabel(group.voterNames.length) + ' for ' + group.card"
      >
        <div class="group-header">
          <span class="card">{{ group.card }}</span>
          <span class="count">({{ voteCountLabel(group.voterNames.length) }})</span>
        </div>
        <div class="chips">
          @for (name of group.voterNames; track name) {
            <ion-chip color="primary">
              <ion-label>{{ name }}</ion-label>
            </ion-chip>
          }
        </div>
      </ion-item-group>
    }

    @if (abstainedNames().length > 0) {
      <ion-item-group
        class="group abstained"
        [style.--i]="voteGroups().length"
        aria-label="Participants who abstained"
      >
        <div class="group-header">
          <span class="card">Abstained</span>
          <span class="count">({{ abstainedNames().length }})</span>
        </div>
        <div class="chips">
          @for (name of abstainedNames(); track name) {
            <ion-chip color="medium">
              <ion-label>{{ name }}</ion-label>
            </ion-chip>
          }
        </div>
      </ion-item-group>
    }

    @if (didntVoteNames().length > 0) {
      <ion-item-group
        class="group didnt-vote"
        [style.--i]="voteGroups().length + abstainedNames().length"
        aria-label="Participants who did not vote"
      >
        <div class="group-header">
          <span class="card">Didn't vote</span>
          <span class="count">({{ didntVoteNames().length }})</span>
        </div>
        <div class="chips">
          @for (name of didntVoteNames(); track name) {
            <ion-chip>
              <ion-label>{{ name }}</ion-label>
            </ion-chip>
          }
        </div>
      </ion-item-group>
    }

    @if (stats(); as s) {
      <div class="stats" role="region" aria-label="Round statistics">
        @switch (s.kind) {
          @case ('numeric') {
            <span class="stat">Avg {{ s.mean | number:'1.1-1' }}</span>
            <span class="stat">Med {{ s.median | number:'1.0-0' }}</span>
            <ion-chip
              [color]="spreadColor(s.spread)"
              class="spread-chip"
              [attr.aria-label]="'Consensus level: ' + spreadDisplay(s.spread)"
            >
              <ion-label>{{ spreadDisplay(s.spread) }}</ion-label>
            </ion-chip>
          }
          @case ('categorical') {
            <span class="stat">Most common: <strong>{{ s.mode }}</strong></span>
            <ion-chip
              [color]="spreadColor(s.spread)"
              class="spread-chip"
              [attr.aria-label]="'Consensus level: ' + spreadDisplay(s.spread)"
            >
              <ion-label>{{ spreadDisplay(s.spread) }}</ion-label>
            </ion-chip>
          }
        }
      </div>
    }

    @if (elapsedLabel(); as label) {
      <p class="elapsed" aria-label="Time elapsed: {{ label }}">
        <span aria-hidden="true">&#x23F1;</span> {{ label }}
      </p>
    }

    @if (consensus() && showOverlay()) {
      <div
        class="consensus-overlay"
        role="status"
        aria-live="polite"
        (click)="dismissOverlay()"
      >
        <div class="confetti-layer" aria-hidden="true">
          @for (piece of confettiPieces(); track piece.id) {
            <span
              class="confetti-piece"
              [style.--angle.deg]="piece.angle"
              [style.--distance.px]="piece.distance"
              [style.--rotate.deg]="piece.rotate"
              [style.--duration.ms]="piece.duration"
              [style.--delay.ms]="piece.delay"
            >{{ piece.emoji }}</span>
          }
        </div>
        <span class="consensus-text">hnch'd!
          @if (reducedMotion()) {<span aria-hidden="true"> 🎉</span>}
        </span>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }
      .group {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.35rem 0.5rem;
        border-bottom: 1px solid var(--ion-color-step-150, rgba(0, 0, 0, 0.08));
      }
      .group:last-of-type {
        border-bottom: none;
      }
      .group.abstained .card,
      .group.abstained .count {
        color: var(--ion-color-medium);
        opacity: 0.75;
      }
      .group.abstained .card {
        font-weight: 600;
      }
      .group::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: var(--bar-width, 0%);
        background: var(--ion-color-primary);
        opacity: 0.06;
        border-radius: 0.5rem;
        z-index: 0;
        pointer-events: none;
      }
      .group.plurality::before {
        opacity: 0.12;
      }
      .group.didnt-vote::before,
      .group.abstained::before {
        display: none;
      }
      .group-header,
      .chips {
        position: relative;
        z-index: 1;
      }
      .group.didnt-vote .card,
      .group.didnt-vote .count {
        color: var(--ion-color-medium);
      }
      .group.didnt-vote .card {
        font-weight: 600;
      }
      .group-header {
        flex: 0 0 auto;
        min-width: 5.5rem;
        display: flex;
        align-items: baseline;
        gap: 0.35rem;
      }
      .card {
        font-size: 1.15rem;
        font-weight: 700;
      }
      .count {
        color: var(--ion-color-medium);
        font-size: 0.8rem;
        white-space: nowrap;
      }
      .chips {
        flex: 1 1 auto;
        display: flex;
        flex-wrap: wrap;
        gap: 0.2rem;
      }
      .chips ion-chip {
        margin: 0;
        height: auto;
        min-height: 1.5rem;
        font-size: 0.8rem;
      }
      .elapsed {
        margin: 0.75rem 0 0;
        color: var(--ion-color-medium);
        font-size: 0.95rem;
      }
      .stats {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 0.5rem;
        align-items: center;
      }
      .stat {
        color: var(--ion-color-medium);
        font-size: 0.875rem;
      }
      .stats .spread-chip {
        margin: 0;
        height: auto;
        min-height: 1.5rem;
      }

      /* Reveal animation — ux.md §6: 80ms stagger, 200ms fade-in-up */
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .group {
        animation: fadeInUp 200ms ease-out both;
        animation-delay: calc(var(--i, 0) * 80ms);
      }
      @media (prefers-reduced-motion: reduce) {
        .group {
          animation: none;
        }
      }

      /* Consensus overlay */
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
      @keyframes hnchdConfetti {
        0% {
          opacity: 1;
          transform:
            rotate(0deg)
            translate(
              calc(cos(var(--angle)) * 0px),
              calc(sin(var(--angle)) * 0px)
            );
        }
        60% {
          opacity: 1;
        }
        100% {
          opacity: 0;
          transform:
            rotate(var(--rotate))
            translate(
              calc(cos(var(--angle)) * var(--distance)),
              calc(sin(var(--angle)) * var(--distance) + 60px)
            );
        }
      }
      .consensus-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        background: rgba(0, 0, 0, 0.45);
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
      .confetti-piece {
        position: absolute;
        top: 50%;
        left: 50%;
        font-size: 1.5rem;
        line-height: 1;
        animation: hnchdConfetti var(--duration) ease-out var(--delay) both;
        will-change: transform, opacity;
      }
      @media (prefers-reduced-motion: reduce) {
        .confetti-piece {
          display: none;
        }
      }
      .consensus-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 3rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--ion-color-success-contrast, #fff);
        background: var(--ion-color-success, #2dd36f);
        border-radius: 1.25rem;
        padding: 1rem 2rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
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
export class VoteResultsComponent {
  readonly round = input.required<Round>();
  readonly participants = input.required<readonly ParticipantSnapshot[]>();
  readonly myId = input<string | null>(null);

  private readonly haptic = inject(HapticService);
  private readonly destroyRef = inject(DestroyRef);

  /** Tracks which round the reveal-complete haptic has already fired for. */
  private hapticFiredForRound: string | null = null;

  /** True when all votes in the round are identical (and ≥ 2 voters), AND
   *  terminalState is 'revealed' (not 'skipped' — ADR-0040 skip-race guard). */
  readonly consensus = computed(() => {
    const r = this.round();
    return isConsensus(r) && terminalState(r) !== 'skipped';
  });

  /** Controls overlay visibility — resets per round, auto-dismisses after 3s. */
  readonly showOverlay = signal(false);

  readonly confettiPieces = signal<readonly ConfettiPiece[]>([]);

  /** Checked once at construction; mid-flight OS toggle is out of scope. */
  readonly reducedMotion = signal(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  private overlayDismissTimer: ReturnType<typeof setTimeout> | null = null;

  /** Guards the delayed haptic+overlay burst against stale-round firing. */
  private revealCelebrationTimer: ReturnType<typeof setTimeout> | null = null;

  /** Inner 120ms haptic bump — cleared alongside revealCelebrationTimer. */
  private revealHapticBumpTimer: ReturnType<typeof setTimeout> | null = null;

  /** Stored on class field so all teardown paths (round change, dismiss, destroy) can clear it. */
  private confettiInterval: ReturnType<typeof setInterval> | null = null;
  private confettiPieceCounter = 0;

  /** Eviction timers keyed by piece.id — cleared wholesale in stopConfetti(). */
  private readonly confettiEvictionTimers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.overlayDismissTimer !== null) {
        clearTimeout(this.overlayDismissTimer);
        this.overlayDismissTimer = null;
      }
      if (this.revealCelebrationTimer !== null) {
        clearTimeout(this.revealCelebrationTimer);
        this.revealCelebrationTimer = null;
      }
      if (this.revealHapticBumpTimer !== null) {
        clearTimeout(this.revealHapticBumpTimer);
        this.revealHapticBumpTimer = null;
      }
      this.stopConfetti();
    });

    // Reset overlay when round changes.
    effect(() => {
      // Read round.id to track round identity; void-discard so the bare
      // expression is permitted by no-unused-expressions.
      void this.round().id;
      this.showOverlay.set(false);
      if (this.overlayDismissTimer !== null) {
        clearTimeout(this.overlayDismissTimer);
        this.overlayDismissTimer = null;
      }
      if (this.revealCelebrationTimer !== null) {
        clearTimeout(this.revealCelebrationTimer);
        this.revealCelebrationTimer = null;
      }
      if (this.revealHapticBumpTimer !== null) {
        clearTimeout(this.revealHapticBumpTimer);
        this.revealHapticBumpTimer = null;
      }
      this.stopConfetti();
    });

    // Fire haptic after the stagger animation completes once per round.
    // On consensus, show overlay and auto-dismiss after 3s.
    effect(() => {
      const groups = this.voteGroups();
      const abstained = this.abstainedNames();
      const didntVote = this.didntVoteNames();
      const totalGroups =
        groups.length + (abstained.length > 0 ? 1 : 0) + (didntVote.length > 0 ? 1 : 0);
      if (totalGroups === 0) return;
      const round = this.round();
      if (this.hapticFiredForRound === round.id) return;
      this.hapticFiredForRound = round.id;
      const delay = Math.max(0, totalGroups - 1) * 80 + 200;
      const consensus = this.consensus();
      this.revealCelebrationTimer = setTimeout(() => {
        this.revealCelebrationTimer = null;
        this.haptic.notificationSuccess();
        if (consensus) {
          this.showOverlay.set(true);
          this.startConfetti();
          this.revealHapticBumpTimer = setTimeout(() => {
            this.revealHapticBumpTimer = null;
            this.haptic.impactMedium();
          }, 120);
          this.overlayDismissTimer = setTimeout(() => {
            this.showOverlay.set(false);
            this.overlayDismissTimer = null;
            this.stopConfetti();
          }, 3000);
        }
      }, delay);
    });
  }

  dismissOverlay(): void {
    this.showOverlay.set(false);
    if (this.overlayDismissTimer !== null) {
      clearTimeout(this.overlayDismissTimer);
      this.overlayDismissTimer = null;
    }
    this.stopConfetti();
  }

  private startConfetti(): void {
    if (this.reducedMotion()) return;
    this.confettiPieces.set([]);
    this.confettiPieceCounter = 0;

    const spawnBatch = (count: number): ConfettiPiece[] => {
      const pieces: ConfettiPiece[] = [];
      for (let i = 0; i < count; i++) {
        pieces.push(this.makeConfettiPiece());
      }
      return pieces;
    };

    const schedulePieceEviction = (piece: ConfettiPiece): void => {
      const t = setTimeout(
        () => {
          this.confettiEvictionTimers.delete(piece.id);
          this.confettiPieces.update((prev) => prev.filter((p) => p.id !== piece.id));
        },
        piece.duration + piece.delay + 50,
      );
      this.confettiEvictionTimers.set(piece.id, t);
    };

    const addPieces = (pieces: ConfettiPiece[]): void => {
      this.confettiPieces.update((prev) => [...prev, ...pieces]);
      for (const piece of pieces) {
        schedulePieceEviction(piece);
      }
    };

    // Immediate first batch so confetti appears instantly.
    addPieces(spawnBatch(10));

    this.confettiInterval = setInterval(() => {
      addPieces(spawnBatch(10));
    }, 1000);
  }

  private stopConfetti(): void {
    if (this.confettiInterval !== null) {
      clearInterval(this.confettiInterval);
      this.confettiInterval = null;
    }
    for (const t of this.confettiEvictionTimers.values()) {
      clearTimeout(t);
    }
    this.confettiEvictionTimers.clear();
    this.confettiPieces.set([]);
  }

  private makeConfettiPiece(): ConfettiPiece {
    const emoji = CONFETTI_EMOJIS[Math.floor(Math.random() * CONFETTI_EMOJIS.length)]!;
    return {
      id: ++this.confettiPieceCounter,
      emoji,
      angle: Math.random() * 360,
      distance: 60 + Math.random() * 120,
      rotate: Math.random() * 360,
      duration: 700 + Math.random() * 600,
      delay: Math.random() * 200,
    };
  }

  /**
   * Name lookup by `participantId`. "You (name)" for the current user
   * mirrors the Lobby convention; everyone else is rendered verbatim.
   */
  private readonly nameById = computed<ReadonlyMap<string, string>>(() => {
    const mine = this.myId();
    const map = new Map<string, string>();
    for (const p of this.participants()) {
      map.set(p.id, p.id === mine ? `You (${p.displayName})` : p.displayName);
    }
    return map;
  });

  /**
   * Groups sorted by count desc, tie-break by `scaleIndex` asc.
   * The `__didnt_vote__` sentinel is filtered out and rendered separately.
   */
  readonly voteGroups = computed<readonly VoteGroup[]>(() => {
    const round = this.round();
    const names = this.nameById();
    const scaleOrder = new Map<string, number>();
    round.scale.cards.forEach((card, i) => scaleOrder.set(card, i));

    const byCard = new Map<string, string[]>();
    for (const [participantId, card] of Object.entries(round.votes)) {
      // Abstain sentinel renders in its own group — exclude from numeric vote groups.
      if (isAbstainVote(card)) continue;
      const name = names.get(participantId) ?? participantId;
      const bucket = byCard.get(card);
      if (bucket) {
        bucket.push(name);
      } else {
        byCard.set(card, [name]);
      }
    }

    const groups: VoteGroup[] = [];
    for (const [card, voterNames] of byCard) {
      groups.push({
        card,
        scaleIndex: scaleOrder.get(card) ?? Number.MAX_SAFE_INTEGER,
        voterNames: [...voterNames].toSorted(),
      });
    }

    groups.sort((a, b) => {
      const byCount = b.voterNames.length - a.voterNames.length;
      return byCount !== 0 ? byCount : a.scaleIndex - b.scaleIndex;
    });
    return groups;
  });

  /**
   * Names of active participants whose vote equals ABSTAIN_SENTINEL.
   * Rendered in a muted "Abstained" group between numeric vote groups
   * and "Didn't vote" (ADR-0041 §3).
   */
  readonly abstainedNames = computed<readonly string[]>(() => {
    const round = this.round();
    const names = this.nameById();
    const out: string[] = [];
    for (const [participantId, card] of Object.entries(round.votes)) {
      if (!isAbstainVote(card)) continue;
      const p = this.participants().find((x) => x.id === participantId);
      if (p && isActiveParticipant(p)) {
        out.push(names.get(participantId) ?? participantId);
      }
    }
    out.sort();
    return out;
  });

  /**
   * Names of active participants (not kicked/left) who have no entry in
   * `round.votes`. Uses `isActiveParticipant` so departed participants don't
   * inflate the "didn't vote" count — raw `participants()` is still used for
   * chip name lookup (`nameById`) so kicked voters show their real names.
   *
   * Abstainers have an entry in `round.votes` (sentinel string), so they
   * naturally fall out of this set (ADR-0041 §3).
   */
  readonly didntVoteNames = computed<readonly string[]>(() => {
    const round = this.round();
    const voted = new Set(Object.keys(round.votes));
    const names = this.nameById();
    const out: string[] = [];
    for (const p of this.participants()) {
      if (isActiveParticipant(p) && !voted.has(p.id)) {
        out.push(names.get(p.id) ?? p.id);
      }
    }
    out.sort();
    return out;
  });

  /**
   * Elapsed voting time (revealedAt - timerStartedAt), or null if either
   * timestamp is absent.
   */
  readonly elapsedLabel = computed<string | null>(() => {
    const round = this.round();
    if (round.revealedAt === undefined || round.timerStartedAt === undefined) {
      return null;
    }
    return formatElapsed(round.revealedAt - round.timerStartedAt);
  });

  /** Stats computed via shared util — uses votes + scale directly. */
  readonly stats = computed<RoundStats>(() =>
    computeRoundStats(this.round().votes, this.round().scale),
  );

  /** "N votes" / "1 vote" — used inside group headers. */
  voteCountLabel(n: number): string {
    return n === 1 ? '1 vote' : `${n} votes`;
  }

  /** Denominator for distribution bars: cast non-abstain votes only (AC #3). */
  private readonly totalVoted = computed(
    () => Object.values(this.round().votes).filter((v) => !isAbstainVote(v)).length,
  );

  /** Bar width % for a group. Only called from @for over voteGroups so total >= 1. */
  widthPct(count: number): number {
    return (count / this.totalVoted()) * 100;
  }

  protected spreadColor(s: SpreadLabel): 'success' | 'warning' | 'danger' {
    return s === 'unanimous' ? 'success' : s === 'close' ? 'warning' : 'danger';
  }

  protected spreadDisplay(s: SpreadLabel): string {
    return s === 'unanimous' ? 'Unanimous' : s === 'close' ? 'Close' : 'Spread';
  }
}
