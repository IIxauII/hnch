import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core'
import { Router } from '@angular/router'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFooter,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

import { DocService } from '../core/doc/doc.service'
import { ParticipantIdService } from '../core/participant-id.service'
import { AvatarVoteRowComponent } from './avatar-vote-row.component'

/**
 * Estimating — ux.md §5.5.
 *
 * Pick-your-card screen. Presence of a vote is public (shown in the
 * avatar row); the value stays hidden until the host taps Reveal.
 *
 * Phase 2 shape:
 *  - Title "Round N" uses the current round's 1-based index in
 *    `rounds()` so re-votes and next-rounds number correctly.
 *  - Descriptor from `currentRound.title` when present.
 *  - Timer display reads `settings.timerDurationMs` for visual realism
 *    only — `timerStartedAt` is never written here because timer-driven
 *    reveal is Phase 4 (plan §2.4). Countdown therefore stays pinned at
 *    the configured duration; we mark it `// Phase 4` below.
 *  - Card grid renders `currentRound.scale.cards`. Tapping a card
 *    casts/overwrites the vote; tapping the selected card clears it
 *    (ADR-0013: vote change allowed until reveal).
 *  - Host-only Reveal button. In Phase 2 the host is always you; the
 *    check still guards the button so Phase 3 joiners see the empty
 *    footer without further work.
 *  - Haptics on card tap (ux.md §7) are Phase 6; no plugin dependency
 *    added here.
 *
 * Back-nav defaults to /lobby. The session stays alive (plan §3.10);
 * only Lobby's Leave action tears it down.
 */
@Component({
  selector: 'app-estimating',
  imports: [
    AvatarVoteRowComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonFooter,
    IonHeader,
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
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (currentRound(); as round) {
        <h1 class="title">Round {{ roundIndex() }}</h1>
        @if (round.title) {
          <p class="descriptor">{{ round.title }}</p>
        }

        @if (timerLabel(); as label) {
          <!-- Phase 4: drive from round.timerStartedAt + settings.timerDurationMs. -->
          <p class="timer">{{ label }}</p>
        }

        <app-avatar-vote-row
          [participants]="onlineParticipants()"
          [votedIds]="votedIds()"
        />

        <h2 class="section">Pick your estimate</h2>

        <div class="grid">
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
      :host {
        display: block;
      }
      .title {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0.25rem 0 0.25rem;
      }
      .descriptor {
        margin: 0 0 1rem;
        color: var(--ion-color-medium);
      }
      .timer {
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
      .empty {
        color: var(--ion-color-medium);
        margin: 2rem 0;
        text-align: center;
      }
    `,
  ],
})
export class EstimatingPage {
  private readonly router = inject(Router)
  private readonly docService = inject(DocService)
  private readonly participantIdService = inject(ParticipantIdService)

  protected readonly currentRound = this.docService.currentRound
  protected readonly onlineParticipants = this.docService.onlineParticipants

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

  /**
   * Countdown label derived from `settings.timerDurationMs`. Phase 2
   * renders the configured duration verbatim — see the class docstring
   * and the template comment for why the value never decrements.
   * `null` hides the label entirely for `revealMode: 'manual'` sessions.
   */
  protected readonly timerLabel = computed<string | null>(() => {
    const settings = this.docService.settings()
    if (!settings || settings.revealMode !== 'timer') return null
    const ms = settings.timerDurationMs
    if (ms === undefined || ms <= 0) return null
    return formatCountdown(ms)
  })

  protected onCardTap(card: string): void {
    const id = this.myId()
    const round = this.currentRound()
    if (!id || !round) return

    if (this.myVote() === card) {
      this.docService.clearVote(round.id, id)
    } else {
      this.docService.castVote(round.id, id, card)
    }
  }

  protected async onReveal(): Promise<void> {
    const round = this.currentRound()
    if (!round) return
    this.docService.revealRound(round.id)
    // replaceUrl: back-nav from Revealed should pop to Lobby, not
    // bounce through the Estimating screen we just left
    // (plan §3.10).
    await this.router.navigate(['/revealed'], { replaceUrl: true })
  }
}

// ---------------------------------------------------------------------------
// Module-private formatters
// ---------------------------------------------------------------------------

/**
 * Format a millisecond duration as `M:SS` above 60s and `0:SS` below,
 * per ux.md §5.5. Sub-second values round down to 0:00 (the timer has
 * already expired at that point; Phase 4 deals with the reveal).
 */
function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
