import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  computeRoundStats,
  formatElapsed,
  isAbstainVote,
  isActiveParticipant,
  isConsensus,
} from '@hnch/shared';
import type { ParticipantSnapshot, Round, RoundStats, SpreadLabel } from '@hnch/shared';
import { IonChip, IonItemGroup, IonLabel } from '@ionic/angular/standalone';

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
            <span class="stat">
              <span class="stat-label">Avg</span>
              <strong class="stat-value">{{ s.mean | number:'1.1-1' }}</strong>
            </span>
            <span class="stat">
              <span class="stat-label">Med</span>
              <strong class="stat-value">{{ s.median | number:'1.0-0' }}</strong>
            </span>
            <ion-chip
              [color]="spreadColor(s.spread)"
              class="spread-chip"
              [attr.aria-label]="'Consensus level: ' + spreadDisplay(s.spread)"
            >
              <ion-label>{{ spreadDisplay(s.spread) }}</ion-label>
            </ion-chip>
          }
          @case ('categorical') {
            <span class="stat">
              <span class="stat-label">Most common</span>
              <strong class="stat-value">{{ s.mode }}</strong>
            </span>
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
        align-items: center;
        gap: 0.35rem;
      }
      .card {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2rem;
        padding: 2px 8px;
        border-radius: 6px;
        border: 1.5px solid var(--hnch-sep-strong);
        background: var(--hnch-elev-2);
        box-shadow: var(--hnch-shadow-1);
        font-size: 1rem;
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
        display: inline-flex;
        align-items: baseline;
        gap: 0.25rem;
        font-size: 0.875rem;
      }
      .stat-label {
        color: var(--ion-color-medium);
        font-size: 0.8rem;
      }
      .stat-value {
        color: var(--hnch-text, var(--ion-text-color));
        font-size: 1rem;
        font-weight: 600;
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
    `,
  ],
})
export class VoteResultsComponent {
  readonly round = input.required<Round>();
  readonly participants = input.required<readonly ParticipantSnapshot[]>();
  readonly myId = input<string | null>(null);

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
    if (
      round.status !== 'revealed' ||
      round.terminalAt === undefined ||
      round.timerStartedAt === undefined
    ) {
      return null;
    }
    return formatElapsed(round.terminalAt - round.timerStartedAt);
  });

  /**
   * Stats computed via shared util. Abstain-sentinel votes are stripped before
   * the call so they don't skew spread calculations or surface 'hnch_abstain'
   * as a mode string in the UI (ADR-0041 §2).
   */
  readonly stats = computed<RoundStats>(() => {
    const r = this.round();
    const votes = Object.fromEntries(Object.entries(r.votes).filter(([, v]) => !isAbstainVote(v)));
    return computeRoundStats(votes, r.scale);
  });

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
