import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core'
import { Router } from '@angular/router'
import { participantRole } from '@hnch/shared'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonLabel,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

import { ConnectionChipComponent } from '../core/connection-chip.component'
import { DocService } from '../core/doc/doc.service'
import { HapticService } from '../core/haptic.service'
import { LastSessionService } from '../core/last-session.service'
import { ParticipantIdService } from '../core/participant-id.service'
import { TimerTickService } from '../core/timer-tick.service'
import { AvatarVoteRowComponent } from './avatar-vote-row.component'

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
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonChip,
    IonContent,
    IonFooter,
    IonHeader,
    IonLabel,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/lobby"></ion-back-button>
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
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (currentRound(); as round) {
        <h1 class="title">Round {{ roundIndex() }}</h1>
        @if (round.title) {
          <p class="descriptor">{{ round.title }}</p>
        }

        @if (elapsedLabel(); as label) {
          <p class="elapsed" role="status" aria-live="off">{{ label }}</p>
        }

        <app-avatar-vote-row
          [participants]="onlineParticipants()"
          [votedIds]="votedIds()"
        />

        @if (isViewer()) {
          <p class="observer-notice" role="status" aria-live="polite">
            You're observing this round
          </p>
        } @else {
          <h2 class="section">Pick your estimate</h2>

          <div class="grid" role="group" aria-label="Choose your estimate">
            @for (card of round.scale.cards; track card) {
              <ion-card
                button
                class="card"
                [class.selected]="card === myVote()"
                [attr.aria-pressed]="card === myVote()"
                [attr.aria-label]="'Card ' + card"
                (click)="onCardTap(card)"
              >
                <ion-card-content class="card-face">
                  {{ card }}
                </ion-card-content>
              </ion-card>
            }
          </div>
        }
      } @else {
        <p class="empty">No active round.</p>
      }
    </ion-content>

    @if (isHost()) {
      <ion-footer>
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
      .title {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0.25rem 0 0.25rem;
      }
      .descriptor {
        margin: 0 0 1rem;
        color: var(--ion-color-medium);
      }
      .elapsed {
        font-size: 2rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        margin: 0.5rem 0 1rem;
        color: var(--ion-color-medium);
      }
      .section {
        margin: 1.5rem 0 0.5rem;
        font-size: 1rem;
        font-weight: 600;
        color: var(--ion-color-medium);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.75rem;
      }
      .card {
        margin: 0;
        border: 2px solid transparent;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .card.selected {
        border-color: var(--ion-color-primary);
        background: var(--ion-color-primary-tint);
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
  private readonly router = inject(Router)
  private readonly docService = inject(DocService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly haptic = inject(HapticService)
  private readonly lastSessionService = inject(LastSessionService)
  private readonly timerTick = inject(TimerTickService)

  protected readonly currentRound = this.docService.currentRound
  protected readonly onlineParticipants = this.docService.onlineParticipants

  constructor() {
    // Bump `hnch.lastSession` so a reopen lands on Estimating rather
    // than Lobby (plan §3.8). Safe to call unconditionally — the
    // service no-ops if `roomCode` / `roomUuid` aren't populated (e.g.
    // deep-link with no active session, which shouldn't happen).
    const code = this.docService.roomCode()
    const uuid = this.docService.meta()?.roomUuid
    if (code && uuid) {
      void this.lastSessionService.record({
        roomCode: code,
        roomUuid: uuid,
        lastScreen: 'estimating',
      })
    }

    // Auto-navigate to Lobby when `revealedAt` is written — covers
    // unanimous auto-reveal and host manual reveal. Scoped to this
    // component's lifetime.
    effect(() => {
      const round = this.docService.currentRound()
      if (round?.revealedAt !== undefined) {
        void this.router.navigate(['/lobby'], { replaceUrl: true })
      }
    })

    // Unanimous auto-reveal: when all online voters have voted,
    // write `revealedAt`. Viewers are excluded from the count.
    // Guard: require at least 1 online voter with a vote (ADR-0018).
    effect(() => {
      const round = this.docService.currentRound()
      if (!round || round.revealedAt !== undefined) return
      const online = this.docService.onlineParticipantIds()
      if (online.size === 0) return
      const allParticipants = this.docService.participants()
      // Online voters only — exclude viewers
      const onlineVoterIds = new Set(
        allParticipants
          .filter((p) => online.has(p.id) && participantRole(p) !== 'viewer')
          .map((p) => p.id),
      )
      if (onlineVoterIds.size === 0) return
      const votedCount = Object.keys(round.votes).filter((id) => onlineVoterIds.has(id)).length
      if (votedCount >= onlineVoterIds.size) {
        this.haptic.notificationSuccess()
        this.docService.revealRound(round.id)
      }
    })
  }

  private readonly myId = this.participantIdService.id

  /**
   * 1-based index of the current round within `rounds()`. Re-votes and
   * Next Round both append, so the array-index lookup is exact. Returns
   * `null` when there's no active round (transient — we just navigated
   * in).
   */
  protected readonly roundIndex = computed(() => {
    const round = this.currentRound()
    if (!round) return null
    const rounds = this.docService.rounds()
    const idx = rounds.findIndex((r) => r.id === round.id)
    return idx >= 0 ? idx + 1 : null
  })

  /** The current user's card, or `null` when they haven't voted yet. */
  protected readonly myVote = computed<string | null>(() => {
    const id = this.myId()
    const round = this.currentRound()
    if (!id || !round) return null
    return round.votes[id] ?? null
  })

  /**
   * Set of participantIds that have a vote in the current round,
   * filtered against awareness. A peer that cast a vote and then
   * silently dropped (no close frame, just a dead connection) keeps
   * its entry in `round.votes` — ADR-0011 treats the cast vote as
   * authoritative — but we don't want the avatar row to keep showing
   * them as "voted" when the tally won't include them on reveal.
   * Revealed chips (§3.7) intentionally skip this filter because
   * there the tally *is* the post-reveal record.
   */
  protected readonly votedIds = computed<ReadonlySet<string>>(() => {
    const round = this.currentRound()
    if (!round) return new Set()
    const online = this.docService.onlineParticipantIds()
    return new Set(Object.keys(round.votes).filter((id) => online.has(id)))
  })

  protected readonly isHost = computed(() => {
    const myId = this.myId()
    const hostId = this.docService.settings()?.hostParticipantId
    return !!myId && !!hostId && myId === hostId
  })

  /** True when the current user's effective role is `'viewer'`. */
  protected readonly isViewer = computed(() => {
    const myId = this.myId()
    if (!myId) return false
    const me = this.docService.participants().find((p) => p.id === myId)
    return me ? participantRole(me) === 'viewer' : false
  })

  /**
   * Elapsed voting time label (M:SS counting up), or `null` before the
   * round's stopwatch has started. Driven by the 4 Hz wall-clock tick.
   */
  protected readonly elapsedLabel = computed<string | null>(() => {
    const round = this.docService.currentRound()
    if (!round || round.timerStartedAt === undefined) return null
    const elapsed = this.timerTick.now() - round.timerStartedAt
    return formatElapsed(Math.max(0, elapsed))
  })

  protected onToggleRole(): void {
    const id = this.myId()
    if (!id) return
    this.haptic.impactLight()
    this.docService.toggleRole(id)
  }

  protected onCardTap(card: string): void {
    const id = this.myId()
    const round = this.currentRound()
    if (!id || !round) return

    if (this.myVote() === card) {
      this.docService.clearVote(round.id, id)
    } else {
      this.docService.castVote(round.id, id, card)
    }
    this.haptic.impactLight()
  }

  protected async onReveal(): Promise<void> {
    const round = this.currentRound()
    if (!round) return
    this.haptic.impactMedium()
    this.docService.revealRound(round.id)
    // replaceUrl: back-nav from Lobby (results view) should pop to the
    // screen before Estimating, not bounce back here (plan §3.10).
    await this.router.navigate(['/lobby'], { replaceUrl: true })
  }
}

// ---------------------------------------------------------------------------
// Module-private formatters
// ---------------------------------------------------------------------------

/** Format a millisecond duration as `M:SS`. */
function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
