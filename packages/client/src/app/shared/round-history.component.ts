import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core'
import { formatElapsed } from '@hnch/shared'
import type { ParticipantSnapshot, Round } from '@hnch/shared'
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
} from '@ionic/angular/standalone'
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
  imports: [IonAccordion, IonAccordionGroup, IonButton, IonIcon, IonItem, IonLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length > 0) {
      <section class="history" aria-label="Round history">
        <h3 class="history-heading">History</h3>
        <ion-accordion-group
          [multiple]="false"
          expand="inset"
          class="history-accordion"
        >
          @for (entry of entries(); track entry.roundNumber) {
            <ion-accordion [value]="entry.roundId">
              <ion-item slot="header" [lines]="'none'">
                <ion-label>
                  <div class="round-header">
                    <span class="round-label">Round {{ entry.roundNumber }}</span>
                    @if (entry.title) {
                      <span class="round-title">: {{ entry.title }}</span>
                    }
                    <span class="round-summary"> — {{ entry.summary }}</span>
                    @if (entry.elapsed) {
                      <span class="round-elapsed"> — {{ entry.elapsed }}</span>
                    }
                  </div>
                </ion-label>
                @if (isHost()) {
                  <ion-button
                    fill="clear"
                    size="small"
                    class="edit-btn"
                    slot="end"
                    [attr.aria-label]="'Edit round ' + entry.roundNumber + ' descriptor'"
                    (click)="$event.stopPropagation(); editTriggered.emit(entry.roundId)"
                  >
                    <ion-icon name="pencil-outline" slot="icon-only" />
                  </ion-button>
                }
              </ion-item>
              <div class="accordion-body">
                <div class="vote-detail">
                  <p class="detail-label">Vote Distribution:</p>
                  <p class="detail-value">{{ entry.summary }}</p>
                </div>
                @if (entry.elapsed) {
                  <div class="vote-detail">
                    <p class="detail-label">Elapsed:</p>
                    <p class="detail-value">{{ entry.elapsed }}</p>
                  </div>
                }
              </div>
            </ion-accordion>
          }
        </ion-accordion-group>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .history {
        margin-top: 1.5rem;
      }
      .history-heading {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--ion-color-step-600);
        margin: 0 0 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .history-accordion {
        --ion-accordion-background: transparent;
      }
      .round-header {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        font-size: 0.875rem;
      }
      .round-label {
        font-weight: 600;
        color: var(--ion-color-step-600);
      }
      .round-title,
      .round-summary,
      .round-elapsed {
        color: var(--ion-color-step-600);
      }
      .edit-btn {
        --padding-start: 0.25rem;
        --padding-end: 0.25rem;
        height: 1.25rem;
      }
      .accordion-body {
        padding: 1rem 1.5rem;
        font-size: 0.875rem;
      }
      .vote-detail {
        margin-bottom: 0.5rem;
      }
      .vote-detail:last-child {
        margin-bottom: 0;
      }
      .detail-label {
        margin: 0 0 0.25rem;
        font-weight: 600;
        color: var(--ion-color-step-600);
      }
      .detail-value {
        margin: 0;
        color: var(--ion-color-step-500);
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
