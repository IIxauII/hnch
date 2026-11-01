import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  formatRoundElapsed,
  formatRoundStats,
  isAbstainVote,
  isActiveParticipant,
  isConsensus,
  participantRole,
  roundStatsFor,
} from '@hnch/shared';
import type {
  ParticipantSnapshot,
  Round,
  RoundStats,
  RoundStatsDisplay,
  SpreadLabel,
} from '@hnch/shared';
import { IonChip, IonIcon, IonItemGroup, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { timerOutline } from 'ionicons/icons';

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

/**
 * VoteResultsComponent — pure presenter for the grouped vote-results view
 * of a single revealed round. Extracted from RevealedPage so Lobby can
 * inline it.
 *
 * Celebration state (overlay, confetti, haptics) is owned by LobbyPage via
 * CelebrationService — this component is a pure results presenter.
 *
 * Inputs:
 *  - `round` — the revealed Round to display
 *  - `participants` — current participant list (for name lookup)
 *  - `myId` — this client's participant id (used to label "You (Name)")
 */
@Component({
  selector: 'app-vote-results',
  imports: [IonChip, IonIcon, IonItemGroup, IonLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (empty()) {
      <p class="no-votes">No votes were cast.</p>
    }

    <div class="groups">
      @for (group of voteGroups(); track group.card; let i = $index; let first = $first) {
        <ion-item-group
          class="group"
          [class.plurality]="first && hasLeader()"
          [style.--i]="i"
          [style.--bar-width.%]="widthPct(group.voterNames.length)"
          [attr.aria-label]="voteCountLabel(group.voterNames.length) + ' for ' + group.card"
        >
          <div class="group-header">
            <span class="card">{{ group.card }}</span>
            <span class="count">{{ voteCountLabel(group.voterNames.length) }}</span>
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
          </div>
          <div class="chips">
            @for (name of didntVoteNames(); track name) {
              <ion-chip color="medium">
                <ion-label>{{ name }}</ion-label>
              </ion-chip>
            }
          </div>
        </ion-item-group>
      }
    </div>

    @if (statsDisplay(); as s) {
      <dl class="stats" aria-label="Round statistics">
        @switch (s.kind) {
          @case ('numeric') {
            <div class="stat">
              <dt class="stat-label">Average</dt>
              <dd class="stat-value">{{ s.mean }}</dd>
            </div>
            <div class="stat">
              <dt class="stat-label">Median</dt>
              <dd class="stat-value">{{ s.median }}</dd>
            </div>
          }
          @case ('categorical') {
            <!-- Absent on a tie: no card was the most common one. -->
            @if (s.mode !== null) {
              <div class="stat">
                <dt class="stat-label">Most common</dt>
                <dd class="stat-value">{{ s.mode }}</dd>
              </div>
            }
          }
        }
        <!-- The label is what keeps "Close" from reading as a close button. -->
        <div class="stat">
          <dt class="stat-label">Agreement</dt>
          <dd class="stat-chip">
            <ion-chip
              [color]="spreadColor(stats()!.spread)"
              class="spread-chip"
              [attr.aria-label]="'Consensus level: ' + s.spread"
            >
              <ion-label>{{ s.spread }}</ion-label>
            </ion-chip>
          </dd>
        </div>
      </dl>
    }

    @if (elapsedLabel(); as label) {
      <p class="elapsed" aria-label="Time elapsed: {{ label }}">
        <ion-icon name="timer-outline" aria-hidden="true"></ion-icon>
        <span>{{ label }}</span>
      </p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }
      .no-votes {
        margin: 0;
        color: var(--hnch-muted);
        font-size: 0.9375rem;
      }
      .groups {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .group {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 44px;
        padding: 4px 0 12px;
      }
      /*
       * Distribution bar (#123): a track under the row with the share
       * filled in. It used to be the row's background, where its end landed
       * in the middle of a name.
       */
      .group::before,
      .group::after {
        content: '';
        position: absolute;
        bottom: 2px;
        left: 0;
        height: 4px;
        border-radius: 2px;
        pointer-events: none;
      }
      .group::before {
        width: 100%;
        background: var(--hnch-fill);
      }
      .group::after {
        width: var(--bar-width, 0%);
        background: var(--hnch-accent-text);
        opacity: 0.45;
      }
      .group.plurality::after {
        opacity: 1;
      }
      .group.didnt-vote,
      .group.abstained {
        padding-block-end: 4px;
      }
      .group.didnt-vote::before,
      .group.didnt-vote::after,
      .group.abstained::before,
      .group.abstained::after {
        display: none;
      }
      .group-header {
        flex: 0 0 auto;
        min-width: 6rem;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .card {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2.25rem;
        padding: 3px 8px;
        border-radius: 8px;
        border: 1px solid var(--hnch-sep-strong);
        background: var(--hnch-elev-2);
        box-shadow: var(--hnch-shadow-1);
        color: var(--hnch-text);
        font-size: 1rem;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }
      .group.abstained .card,
      .group.didnt-vote .card {
        border: none;
        background: none;
        box-shadow: none;
        padding: 0;
        border-radius: 0;
        min-width: unset;
        color: var(--hnch-muted);
        font-size: 0.875rem;
        font-weight: 600;
      }
      .count {
        color: var(--hnch-muted);
        font-size: 0.8125rem;
        white-space: nowrap;
      }
      .chips {
        flex: 1 1 auto;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        min-width: 0;
      }
      .chips ion-chip {
        margin: 0;
        height: auto;
        min-height: 1.75rem;
        max-width: 100%;
        font-size: 0.8125rem;
      }
      .chips ion-chip ion-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .stats {
        display: flex;
        flex-wrap: wrap;
        gap: 12px 24px;
        margin: 16px 0 0;
        padding: 12px 0 0;
        border-top: 0.55px solid var(--hnch-sep);
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .stat-label {
        color: var(--hnch-muted);
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .stat-value {
        margin: 0;
        color: var(--hnch-text);
        font-size: 1.25rem;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        line-height: 1.4;
      }
      .stat-chip {
        display: flex;
        align-items: center;
        min-height: 1.75rem;
        margin: 0;
      }
      .stats .spread-chip {
        margin: 0;
        height: auto;
        min-height: 1.75rem;
        font-size: 0.8125rem;
        font-weight: 600;
        /* A status, not a control. */
        cursor: default;
        pointer-events: none;
        text-transform: capitalize;
      }
      .elapsed {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 12px 0 0;
        color: var(--hnch-muted);
        font-size: 0.875rem;
        font-variant-numeric: tabular-nums;
      }
      .elapsed ion-icon {
        font-size: 1rem;
      }

      /* Reveal animation — ux.md §2: 80ms stagger, 200ms fade-in-up */
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
    `,
  ],
})
export class VoteResultsComponent {
  readonly round = input.required<Round>();
  readonly participants = input.required<readonly ParticipantSnapshot[]>();
  readonly myId = input<string | null>(null);

  constructor() {
    addIcons({ 'timer-outline': timerOutline });
  }

  /**
   * True when all votes are identical (and ≥ 2 voters), AND the round was
   * actually revealed (not skipped — ADR-0040 skip-race guard), AND the
   * vote set is not all-abstain (ADR-0041 §2 — sentinel-string equality
   * is not a meaningful planning-poker consensus).
   */
  readonly consensus = computed(() => {
    const r = this.round();
    const values = Object.values(r.votes);
    if (values.length >= 2 && values.every(isAbstainVote)) return false;
    return isConsensus(r) && r.status !== 'skipped';
  });

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
   * Names of active voters (not kicked/left, not observing) who have no entry
   * in `round.votes`. Uses `isActiveParticipant` so departed participants
   * don't inflate the "didn't vote" count — raw `participants()` is still used
   * for chip name lookup (`nameById`) so kicked voters show their real names.
   *
   * Observers are left out (ADR-0041 §3, ADR-0020): nobody was waiting for
   * their vote, so reporting them as not having voted reads as a reproach.
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
      if (!isActiveParticipant(p) || participantRole(p) === 'viewer') continue;
      if (!voted.has(p.id)) out.push(names.get(p.id) ?? p.id);
    }
    out.sort();
    return out;
  });

  /**
   * Nothing to list: no votes, no abstentions, and nobody who was expected
   * to vote — a round revealed with only observers in the session. Said in
   * words, so the card is not a lone timer.
   */
  protected readonly empty = computed(
    () =>
      this.voteGroups().length === 0 &&
      this.abstainedNames().length === 0 &&
      this.didntVoteNames().length === 0,
  );

  /** Elapsed voting time, or null when the round has no knowable duration. */
  readonly elapsedLabel = computed<string | null>(() => formatRoundElapsed(this.round()));

  /**
   * Stats for the round. Abstain stripping lives behind `roundStatsFor`, so
   * the sentinel can neither surface as a mode nor skew the spread
   * (ADR-0041 §2).
   */
  readonly stats = computed<RoundStats>(() => roundStatsFor(this.round()));

  /** Display strings for the stat row — shared with the CLI and the export. */
  readonly statsDisplay = computed<RoundStatsDisplay>(() => formatRoundStats(this.stats()));

  /** "N votes" / "1 vote" — used inside group headers. */
  voteCountLabel(n: number): string {
    return n === 1 ? '1 vote' : `${n} votes`;
  }

  /** Denominator for distribution bars: cast non-abstain votes only. */
  private readonly totalVoted = computed(
    () => Object.values(this.round().votes).filter((v) => !isAbstainVote(v)).length,
  );

  /**
   * True when one card got more votes than any other. A tie has no leader,
   * so no row is singled out.
   */
  protected readonly hasLeader = computed(() => {
    const [first, second] = this.voteGroups();
    if (first === undefined) return false;
    return second === undefined || first.voterNames.length > second.voterNames.length;
  });

  /** Bar width % for a group. Only called from @for over voteGroups so total >= 1. */
  widthPct(count: number): number {
    return (count / this.totalVoted()) * 100;
  }

  /**
   * Ionic colour for the spread chip. Deliberately *not* part of the shared
   * round-presentation module — Ionic colour names are surface vocabulary,
   * not presentation-neutral (#509). Called only from inside the
   * `@if (statsDisplay(); as s)` block, where `stats()` is non-null.
   */
  protected spreadColor(s: SpreadLabel): 'success' | 'warning' | 'danger' {
    return s === 'unanimous' ? 'success' : s === 'close' ? 'warning' : 'danger';
  }
}
