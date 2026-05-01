import { DecimalPipe } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core'
import { computeRoundStats, isActiveParticipant, isConsensus } from '@hnch/shared'
import type { ParticipantSnapshot, Round, RoundStats, SpreadLabel } from '@hnch/shared'
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

    @if (stats(); as s) {
      <div class="stats" role="region" aria-label="Round statistics">
        @switch (s.kind) {
          @case ('numeric') {
            <span class="stat">Avg {{ s.mean | number:'1.1-1' }}</span>
            <span class="stat">Med {{ s.median | number:'1.0-0' }}</span>
            <ion-chip [color]="spreadColor(s.spread)" class="spread-chip">
              <ion-label>{{ spreadDisplay(s.spread) }}</ion-label>
            </ion-chip>
          }
          @case ('categorical') {
            <span class="stat">Most common: <strong>{{ s.mode }}</strong></span>
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
        aria-label="Consensus reached"
        (click)="showOverlay.set(false)"
      >
        <span class="consensus-text" aria-hidden="true">Consensus!</span>
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
      .consensus-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        background: rgba(0, 0, 0, 0.45);
        cursor: pointer;
        animation: none;
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
  readonly round = input.required<Round>()
  readonly participants = input.required<readonly ParticipantSnapshot[]>()
  readonly myId = input<string | null>(null)

  private readonly haptic = inject(HapticService)
  private readonly destroyRef = inject(DestroyRef)

  /** Tracks which round the reveal-complete haptic has already fired for. */
  private hapticFiredForRound: string | null = null

  /** True when all votes in the round are identical (and ≥ 2 voters). */
  readonly consensus = computed(() => isConsensus(this.round()))

  /** Controls overlay visibility — resets per round, auto-dismisses after 3s. */
  readonly showOverlay = signal(false)

  private overlayDismissTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.overlayDismissTimer !== null) {
        clearTimeout(this.overlayDismissTimer)
        this.overlayDismissTimer = null
      }
    })
    // Reset overlay when round changes.
    effect(() => {
      const roundId = this.round().id
      // Access roundId to track; reset overlay for new round.
      void roundId
      this.showOverlay.set(false)
      if (this.overlayDismissTimer !== null) {
        clearTimeout(this.overlayDismissTimer)
        this.overlayDismissTimer = null
      }
    })

    // Fire haptic after the stagger animation completes once per round.
    // On consensus, show overlay and auto-dismiss after 3s.
    effect(() => {
      const groups = this.voteGroups()
      const didntVote = this.didntVoteNames()
      const totalGroups = groups.length + (didntVote.length > 0 ? 1 : 0)
      if (totalGroups === 0) return
      const round = this.round()
      if (this.hapticFiredForRound === round.id) return
      this.hapticFiredForRound = round.id
      const delay = Math.max(0, totalGroups - 1) * 80 + 200
      const consensus = this.consensus()
      setTimeout(() => {
        this.haptic.notificationSuccess()
        if (consensus) {
          this.showOverlay.set(true)
          setTimeout(() => this.haptic.impactMedium(), 120)
          this.overlayDismissTimer = setTimeout(() => {
            this.showOverlay.set(false)
            this.overlayDismissTimer = null
          }, 3000)
        }
      }, delay)
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
   * Names of active participants (not kicked/left) who have no entry in
   * `round.votes`. Uses `isActiveParticipant` so departed participants don't
   * inflate the "didn't vote" count — raw `participants()` is still used for
   * chip name lookup (`nameById`) so kicked voters show their real names.
   */
  readonly didntVoteNames = computed<readonly string[]>(() => {
    const round = this.round()
    const voted = new Set(Object.keys(round.votes))
    const names = this.nameById()
    const out: string[] = []
    for (const p of this.participants()) {
      if (isActiveParticipant(p) && !voted.has(p.id)) {
        out.push(names.get(p.id) ?? p.id)
      }
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

  /** Stats computed via shared util — uses votes + scale directly. */
  readonly stats = computed<RoundStats>(() =>
    computeRoundStats(this.round().votes, this.round().scale),
  )

  /** "N votes" / "1 vote" — used inside group headers. */
  voteCountLabel(n: number): string {
    return n === 1 ? '1 vote' : `${n} votes`
  }

  protected spreadColor(s: SpreadLabel): 'success' | 'warning' | 'danger' {
    return s === 'unanimous' ? 'success' : s === 'close' ? 'warning' : 'danger'
  }

  protected spreadDisplay(s: SpreadLabel): string {
    return s === 'unanimous' ? 'Unanimous' : s === 'close' ? 'Close' : 'Spread'
  }
}
