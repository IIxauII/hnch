import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core'
import { formatElapsed } from '@hnch/shared'
import type { ParticipantSnapshot, Round } from '@hnch/shared'
import { IonButton, IonIcon } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { pencilOutline } from 'ionicons/icons'

/** One entry in the compact history list. */
interface HistoryEntry {
  readonly roundId: string
  readonly roundNumber: number
  readonly title: string | undefined
  readonly summary: string
  readonly elapsed: string | null
}

/**
 * RoundHistoryComponent — compact summary list of past revealed rounds.
 *
 * Inputs:
 *  - `rounds` — all revealed rounds to display (caller passes all revealed
 *    rounds except the most recent, which VoteResultsComponent covers in full)
 *  - `participants` — participant list (reserved for future name display)
 *
 * Renders one line per round in reverse chronological order:
 *   "Round N: [title] — card×count, card×count — M:SS"
 * Rounds without `revealedAt` are skipped.
 */
@Component({
  selector: 'app-round-history',
  imports: [IonButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length > 0) {
      <section class="history" aria-label="Round history">
        <ul class="history-list" role="list">
          @for (entry of entries(); track entry.roundNumber) {
            <li class="history-item">
              <span class="round-label">Round {{ entry.roundNumber }}</span>
              @if (entry.title) {
                <span class="round-title">: {{ entry.title }}</span>
              }
              <span class="round-summary"> — {{ entry.summary }}</span>
              @if (entry.elapsed) {
                <span class="round-elapsed"> — {{ entry.elapsed }}</span>
              }
              @if (isHost()) {
                <ion-button
                  fill="clear"
                  size="small"
                  class="edit-btn"
                  [attr.aria-label]="'Edit round ' + entry.roundNumber + ' descriptor'"
                  (click)="editTriggered.emit(entry.roundId)"
                >
                  <ion-icon name="pencil-outline" slot="icon-only" />
                </ion-button>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .history {
        margin-top: 0;
      }
      .history-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .history-item {
        font-size: var(--hnch-text-caption);
        color: var(--ion-color-medium);
        padding: 0.25rem 0;
        border-top: 1px solid var(--ion-color-step-100, rgba(0, 0, 0, 0.06));
      }
      .history-item:first-child {
        border-top: none;
      }
      .round-label {
        font-size: var(--hnch-text-body);
        font-weight: var(--hnch-font-weight-semibold);
        color: var(--ion-color-medium);
      }
      .round-title,
      .round-summary,
      .round-elapsed {
        font-size: var(--hnch-text-caption);
        color: var(--ion-color-medium);
      }
      .edit-btn {
        --padding-start: 0.25rem;
        --padding-end: 0.25rem;
        height: 1.25rem;
        vertical-align: middle;
      }
    `,
  ],
})
export class RoundHistoryComponent {
  readonly rounds = input.required<readonly Round[]>()
  /** Reserved for future name-based display; unused in compact summary mode. */
  readonly participants = input<readonly ParticipantSnapshot[]>([])
  readonly isHost = input<boolean>(false)
  readonly editTriggered = output<string>()

  constructor() {
    addIcons({ 'pencil-outline': pencilOutline })
  }

  readonly entries = computed<readonly HistoryEntry[]>(() => {
    // All rounds in the array already have revealedAt (caller's contract),
    // but we guard defensively.
    const revealed = this.rounds().filter((r) => r.revealedAt !== undefined)
    // Reverse chronological — newest rounds first in the history list.
    const reversed = [...revealed].reverse()

    return reversed.map((round, revIdx) => {
      // Round number = position among ALL rounds passed in (before reversing).
      // We use the original array position for stable numbering.
      const originalIndex = revealed.length - 1 - revIdx
      const roundNumber = originalIndex + 1

      // Compact vote summary: "card×count, card×count" sorted by count desc
      const countByCard = new Map<string, number>()
      for (const card of Object.values(round.votes)) {
        countByCard.set(card, (countByCard.get(card) ?? 0) + 1)
      }
      const scaleOrder = new Map<string, number>()
      round.scale.cards.forEach((card, i) => scaleOrder.set(card, i))

      const groups = [...countByCard.entries()].sort((a, b) => {
        const byCount = b[1] - a[1]
        if (byCount !== 0) return byCount
        return (scaleOrder.get(a[0]) ?? 9999) - (scaleOrder.get(b[0]) ?? 9999)
      })

      const summary =
        groups.length > 0
          ? groups.map(([card, count]) => `${card}×${count}`).join(', ')
          : 'No votes'

      const elapsed =
        round.revealedAt !== undefined && round.timerStartedAt !== undefined
          ? formatElapsed(round.revealedAt - round.timerStartedAt)
          : null

      return { roundId: round.id, roundNumber, title: round.title, summary, elapsed }
    })
  })
}
