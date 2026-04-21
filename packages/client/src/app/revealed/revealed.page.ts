import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core'
import { Router } from '@angular/router'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonItemGroup,
  IonLabel,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

import { DocService } from '../core/doc/doc.service'
import { LastSessionService } from '../core/last-session.service'
import { ParticipantIdService } from '../core/participant-id.service'
import {
  RoundStartSheetComponent,
  type RoundStartSubmission,
} from '../round-start/round-start.sheet'

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

const DIDNT_VOTE_KEY = '__didnt_vote__'

/**
 * Revealed — ux.md §5.6.
 *
 * Grouped vote-results view. Groups sort by count descending; ties
 * break on the card's position within the round's scale (so
 * Fibonacci's `5` sorts before `8` before `13` without needing a
 * number parser that would choke on `?` or `☕`). Non-voters — only
 * reachable in Phase 2 by clearing a vote pre-reveal — are collected
 * under a muted "Didn't vote" trailing group.
 *
 * Host footer shows two actions:
 *   - **Re-vote** — creates a new round carrying `parentRoundId`,
 *     inheriting `title` / `description` / `ticketId` from the
 *     revealed round (ADR-0013). Navigates to `/estimating`.
 *   - **Next Round** — opens the round-start half-sheet fresh, no
 *     parent and no descriptor prefill. Reuses the same
 *     `app-round-start-sheet` as the Lobby (plan §3.7).
 *
 * Back-nav defaults to `/lobby`; per plan §3.10 the session stays
 * alive, so returning to Lobby leaves the history chain intact.
 */
@Component({
  selector: 'app-revealed',
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonFooter,
    IonHeader,
    IonItemGroup,
    IonLabel,
    IonModal,
    IonTitle,
    IonToolbar,
    RoundStartSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/lobby"></ion-back-button>
        </ion-buttons>
        <ion-title>Revealed</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (revealedRound(); as round) {
        <h1 class="title">Round {{ roundIndex() }} Results</h1>
        @if (round.title) {
          <p class="descriptor">{{ round.title }}</p>
        }

        @for (group of voteGroups(); track group.card) {
          <ion-item-group class="group">
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
          <ion-item-group class="group didnt-vote">
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
      } @else {
        <p class="empty">No revealed round yet.</p>
      }
    </ion-content>

    @if (isHost()) {
      <ion-footer>
        <ion-toolbar>
          <div class="footer-row">
            <ion-button
              expand="block"
              fill="outline"
              [disabled]="!revealedRound()"
              (click)="onRevote()"
            >
              Re-vote
            </ion-button>
            <ion-button
              expand="block"
              color="primary"
              [disabled]="!revealedRound()"
              (click)="openNextRound()"
            >
              Next Round
            </ion-button>
          </div>
        </ion-toolbar>
      </ion-footer>
    }

    <ion-modal
      #nextRoundModal
      [isOpen]="nextRoundOpen()"
      [breakpoints]="[0, 0.6, 0.95]"
      [initialBreakpoint]="0.6"
      (didDismiss)="nextRoundOpen.set(false)"
    >
      <ng-template>
        <app-round-start-sheet
          [roundNumber]="nextRoundNumber()"
          (submitted)="onNextRound($event)"
        />
      </ng-template>
    </ion-modal>
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
      .group {
        margin-top: 1rem;
        padding: 0.75rem 0;
        border-top: 1px solid var(--ion-color-step-150, rgba(0, 0, 0, 0.08));
      }
      .group:first-of-type {
        border-top: none;
        margin-top: 0;
      }
      .group.didnt-vote {
        opacity: 0.65;
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
      .footer-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem;
      }
      .empty {
        color: var(--ion-color-medium);
        margin: 2rem 0;
        text-align: center;
      }
    `,
  ],
})
export class RevealedPage {
  private readonly router = inject(Router)
  private readonly docService = inject(DocService)
  private readonly participantIdService = inject(ParticipantIdService)
  private readonly lastSessionService = inject(LastSessionService)

  private readonly rounds = this.docService.rounds
  private readonly participantsSignal = this.docService.participants
  private readonly settings = this.docService.settings

  private readonly myId = this.participantIdService.id

  /** Round-start modal visibility, two-way bound to `ion-modal`. */
  protected readonly nextRoundOpen = signal(false)

  constructor() {
    // Plan §3.8: a reopen after the reveal lands back here rather
    // than Lobby. The write bumps `lastSeenAt`, and the host's Next
    // Round / Re-vote handlers do their own writes via Estimating's
    // constructor when the nav lands there.
    const code = this.docService.roomCode()
    const uuid = this.docService.meta()?.roomUuid
    if (code && uuid) {
      void this.lastSessionService.record({
        roomCode: code,
        roomUuid: uuid,
        lastScreen: 'revealed',
      })
    }
  }

  /**
   * The round whose results we're showing — the current round on the
   * projection (which after reveal is the most recent round). `null`
   * if the projection has no rounds, which in practice happens only
   * when the user deep-links to `/revealed` without a session.
   */
  protected readonly revealedRound = this.docService.currentRound

  /** 1-based index of `revealedRound` inside `rounds()`. */
  protected readonly roundIndex = computed(() => {
    const round = this.revealedRound()
    if (!round) return null
    const idx = this.rounds().findIndex((r) => r.id === round.id)
    return idx >= 0 ? idx + 1 : null
  })

  protected readonly isHost = computed(() => {
    const myId = this.myId()
    const hostId = this.settings()?.hostParticipantId
    return !!myId && !!hostId && myId === hostId
  })

  /**
   * Name lookup by `participantId`. "You (name)" for the current user
   * mirrors the Lobby's convention; everyone else is rendered verbatim.
   */
  private readonly nameById = computed<ReadonlyMap<string, string>>(() => {
    const mine = this.myId()
    const map = new Map<string, string>()
    for (const p of this.participantsSignal()) {
      map.set(p.id, p.id === mine ? `You (${p.displayName})` : p.displayName)
    }
    return map
  })

  /**
   * Groups sorted by count desc, tie-break by `scaleIndex` asc. The
   * `__didnt_vote__` sentinel is filtered out here and rendered as its
   * own trailing group (see `didntVoteNames`).
   */
  protected readonly voteGroups = computed<readonly VoteGroup[]>(() => {
    const round = this.revealedRound()
    if (!round) return []

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
      if (card === DIDNT_VOTE_KEY) continue
      groups.push({
        card,
        // Unknown cards (custom scale edits mid-session, etc.) sort
        // to the end by giving them a synthetic high index.
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
   * Names of participants who have no entry in `round.votes`. Phase 2
   * only populates this when the user clears their vote pre-reveal
   * (see plan §3.9); Phase 4 will populate it for timer-expiry
   * joiners as well — the rendering path is identical.
   */
  protected readonly didntVoteNames = computed<readonly string[]>(() => {
    const round = this.revealedRound()
    if (!round) return []
    const voted = new Set(Object.keys(round.votes))
    const names = this.nameById()
    const out: string[] = []
    for (const p of this.participantsSignal()) {
      if (!voted.has(p.id)) out.push(names.get(p.id) ?? p.id)
    }
    out.sort()
    return out
  })

  /** 1-based number for the "Start Round N" sheet title on Next Round. */
  protected readonly nextRoundNumber = computed(() => this.rounds().length + 1)

  private readonly modalRef = viewChild<IonModal>('nextRoundModal')

  /**
   * Re-vote path (ADR-0013). Appends a new round with
   * `parentRoundId = revealedRound.id`, inheriting `title` /
   * `description` / `ticketId` so the descriptor carries over to
   * Estimating without another trip through the round-start sheet.
   */
  protected async onRevote(): Promise<void> {
    const round = this.revealedRound()
    if (!round) return

    this.docService.startRound({
      parentRoundId: round.id,
      ...(round.title !== undefined && { title: round.title }),
      ...(round.description !== undefined && { description: round.description }),
      ...(round.ticketId !== undefined && { ticketId: round.ticketId }),
    })
    // replaceUrl: back-nav from the new Estimating should pop to
    // Lobby, not to the Revealed screen we just left (plan §3.10).
    await this.router.navigate(['/estimating'], { replaceUrl: true })
  }

  protected openNextRound(): void {
    this.nextRoundOpen.set(true)
  }

  protected async onNextRound(submission: RoundStartSubmission): Promise<void> {
    this.docService.startRound({
      ...(submission.title !== null && { title: submission.title }),
    })
    await this.modalRef()?.dismiss()
    this.nextRoundOpen.set(false)
    // replaceUrl: back-nav from the new Estimating should pop to
    // Lobby, not to this Revealed screen (plan §3.10).
    await this.router.navigate(['/estimating'], { replaceUrl: true })
  }

  /**
   * "N votes" / "1 vote" — used inside the group headers.
   */
  protected voteCountLabel(n: number): string {
    return n === 1 ? '1 vote' : `${n} votes`
  }
}
