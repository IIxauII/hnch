import { DecimalPipe } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core'
import type { ParticipantSnapshot, Round } from '@hnch/shared'
import {
  IonChip,
  IonItemGroup,
  IonLabel,
} from '@ionic/angular/standalone'

import { HapticService } from '../core/haptic.service'

/**
 * One card's worth of voters, ready for template rendering.
 * `scaleIndex` captures the card's position in the round's scale so
 * the group sort can tie-break "numerical" scales like Fibonacci by
 * their natural order rather than lexicographic string order.
 */
interface VoteGroup {
  readonly card: string
  readonly scaleIndex: number
  readonly voterNames: readonly string[]
}

/** Numeric vote cards; sentinel strings like `?` and `☕` are excluded. */
function numericValue(card: string): number | null {
  const n = parseFloat(card)
  return Number.isFinite(n) ? n : null
}

/**
 * Summary stats for a revealed round.
 */
export interface RoundStats {
  readonly average: number | null
  readonly median: number | null
  readonly agreementPct: number
}

/**
 * Compute average, median, and agreement percentage for a set of vote groups.
 * Non-numeric cards (?, ☕, etc.) are excluded from the numeric calculations
 * but count against agreement.
 */
export function computeStats(groups: readonly VoteGroup[]): RoundStats {
  const totalVoters = groups.reduce((n, g) => n + g.voterNames.length, 0)
  if (totalVoters === 0) return { average: null, median: null, agreementPct: 0 }

  // Numeric votes only
  const numericVotes: number[] = []
  for (const group of groups) {
    const n = numericValue(group.card)
    if (n !== null) {
      for (let i = 0; i < group.voterNames.length; i++) {
        numericVotes.push(n)
      }
    }
  }

  let average: number | null = null
  let median: number | null = null
  if (numericVotes.length > 0) {
    average = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length
    const sorted = [...numericVotes].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    median =
      sorted.length % 2 === 0
        ? (sorted[mid - 1]! + sorted[mid]!) / 2
        : sorted[mid]!
  }

  // Agreement: fraction who voted for the plurality card
  const maxVoters = groups.reduce((max, g) => Math.max(max, g.voterNames.length), 0)
  const agreementPct = Math.round((maxVoters / totalVoters) * 100)

  return { average, median, agreementPct }
}

/** Format a millisecond duration as `M:SS`. */
function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

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
    @for (group of voteGroups(); track group.card; let i = $index) {
      <ion-item-group
        class="group"
        [style.--i]="i"
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

    @if (didntVoteNames().length > 0) {
      <ion-item-group
        class="group didnt-vote"
        [style.--i]="voteGroups().length"
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

    @if (elapsedLabel(); as label) {
      <p class="elapsed" aria-label="Time elapsed: {{ label }}">
        <span aria-hidden="true">&#x23F1;</span> {{ label }}
      </p>
    }

    @if (stats(); as s) {
      <div class="stats" role="region" aria-label="Round statistics">
        @if (s.average !== null) {
          <span class="stat">Avg {{ s.average | number:'1.1-1' }}</span>
        }
        @if (s.median !== null) {
          <span class="stat">Med {{ s.median | number:'1.1-1' }}</span>
        }
        <span class="stat">{{ s.agreementPct }}% agreement</span>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .group {
        margin-top: 1rem;
        padding: 0.75rem 0;
        border-top: 1px solid var(--ion-color-step-150, rgba(0, 0, 0, 0.08));
      }
      .group:first-of-type {
        border-top: none;
        margin-top: 0;
      }
      .group.didnt-vote .card,
      .group.didnt-vote .count {
        color: var(--ion-color-medium);
      }
      .group.didnt-vote .card {
        font-weight: 600;
      }
      .group-header {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
      }
      .card {
        font-size: 1.5rem;
        font-weight: 700;
      }
      .count {
        color: var(--ion-color-medium);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
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
      }
      .stat {
        color: var(--ion-color-medium);
        font-size: 0.875rem;
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
  readonly round = input.required<Round>()
  readonly participants = input.required<readonly ParticipantSnapshot[]>()
  readonly myId = input<string | null>(null)

  private readonly haptic = inject(HapticService)

  /** Tracks which round the reveal-complete haptic has already fired for. */
  private hapticFiredForRound: string | null = null

  constructor() {
    // Fire haptic after the stagger animation completes once per round.
    effect(() => {
      const groups = this.voteGroups()
      const didntVote = this.didntVoteNames()
      const totalGroups = groups.length + (didntVote.length > 0 ? 1 : 0)
      if (totalGroups === 0) return
      const round = this.round()
      if (this.hapticFiredForRound === round.id) return
      this.hapticFiredForRound = round.id
      const delay = Math.max(0, totalGroups - 1) * 80 + 200
      setTimeout(() => this.haptic.notificationSuccess(), delay)
    })
  }

  /**
   * Name lookup by `participantId`. "You (name)" for the current user
   * mirrors the Lobby convention; everyone else is rendered verbatim.
   */
  private readonly nameById = computed<ReadonlyMap<string, string>>(() => {
    const mine = this.myId()
    const map = new Map<string, string>()
    for (const p of this.participants()) {
      map.set(p.id, p.id === mine ? `You (${p.displayName})` : p.displayName)
    }
    return map
  })

  /**
   * Groups sorted by count desc, tie-break by `scaleIndex` asc.
   * The `__didnt_vote__` sentinel is filtered out and rendered separately.
   */
  readonly voteGroups = computed<readonly VoteGroup[]>(() => {
    const round = this.round()
    const names = this.nameById()
    const scaleOrder = new Map<string, number>()
    round.scale.cards.forEach((card, i) => scaleOrder.set(card, i))

    const byCard = new Map<string, string[]>()
    for (const [participantId, card] of Object.entries(round.votes)) {
      const name = names.get(participantId) ?? participantId
      const bucket = byCard.get(card)
      if (bucket) {
        bucket.push(name)
      } else {
        byCard.set(card, [name])
      }
    }

    const groups: VoteGroup[] = []
    for (const [card, voterNames] of byCard) {
      groups.push({
        card,
        scaleIndex: scaleOrder.get(card) ?? Number.MAX_SAFE_INTEGER,
        voterNames: [...voterNames].sort(),
      })
    }

    groups.sort((a, b) => {
      const byCount = b.voterNames.length - a.voterNames.length
      return byCount !== 0 ? byCount : a.scaleIndex - b.scaleIndex
    })
    return groups
  })

  /**
   * Names of participants who have no entry in `round.votes`.
   */
  readonly didntVoteNames = computed<readonly string[]>(() => {
    const round = this.round()
    const voted = new Set(Object.keys(round.votes))
    const names = this.nameById()
    const out: string[] = []
    for (const p of this.participants()) {
      if (!voted.has(p.id)) out.push(names.get(p.id) ?? p.id)
    }
    out.sort()
    return out
  })

  /**
   * Elapsed voting time (revealedAt - timerStartedAt), or null if either
   * timestamp is absent.
   */
  readonly elapsedLabel = computed<string | null>(() => {
    const round = this.round()
    if (round.revealedAt === undefined || round.timerStartedAt === undefined) {
      return null
    }
    return formatElapsed(round.revealedAt - round.timerStartedAt)
  })

  /** Average, median, agreement for the vote groups. */
  readonly stats = computed<RoundStats | null>(() => {
    const groups = this.voteGroups()
    if (groups.length === 0) return null
    return computeStats(groups)
  })

  /** "N votes" / "1 vote" — used inside group headers. */
  voteCountLabel(n: number): string {
    return n === 1 ? '1 vote' : `${n} votes`
  }
}
