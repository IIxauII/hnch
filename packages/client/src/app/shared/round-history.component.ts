import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatElapsed, formatRoundLabel, resolveRoundLineage, terminalState } from '@hnch/shared';
import type { AgendaItem, ParticipantSnapshot, Round } from '@hnch/shared';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { pencilOutline } from 'ionicons/icons';

import { DocService } from '../core/doc/doc.service';

/** One entry in the compact history list. */
interface HistoryEntry {
  readonly roundId: string;
  readonly roundNumber: number;
  /** Combined `ticketId · title` label (or one of them, or null). */
  readonly label: string | null;
  readonly summary: string;
  readonly elapsed: string | null;
  readonly skipped: boolean;
  /** `"re-vote"` for non-root chain members; `null` for chain root / standalone (issue #111). */
  readonly lineageLabel: string | null;
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
        <h3 class="history-heading">History</h3>
        <ul class="history-list" role="list">
          @for (entry of entries(); track entry.roundNumber) {
            <li class="history-item" [class.skipped]="entry.skipped">
              <span class="round-label">Round {{ entry.roundNumber }}</span>
              @if (entry.lineageLabel) {
                <span class="revote-badge"> ({{ entry.lineageLabel }})</span>
              }
              @if (entry.label) {
                <span class="round-title">: {{ entry.label }}</span>
              }
              @if (entry.skipped) {
                <span class="round-skipped"> — Skipped</span>
              } @else {
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
        margin-top: 1.5rem;
      }
      .history-heading {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--ion-color-medium);
        margin: 0 0 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .history-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .history-item {
        font-size: 0.875rem;
        color: var(--ion-color-medium);
        padding: 0.25rem 0;
        border-top: 1px solid var(--ion-color-step-100, rgba(0, 0, 0, 0.06));
      }
      .history-item:first-child {
        border-top: none;
      }
      .round-label {
        font-weight: 600;
        color: var(--hnch-text);
      }
      .round-title {
        color: var(--hnch-text);
      }
      .round-summary,
      .round-elapsed {
        color: var(--ion-color-medium);
      }
      .revote-badge {
        color: var(--ion-color-medium);
        font-style: italic;
      }
      .edit-btn {
        --padding-start: 0.25rem;
        --padding-end: 0.25rem;
        height: 1.25rem;
        vertical-align: middle;
      }
      .history-item.skipped {
        opacity: 0.55;
      }
      .round-skipped {
        color: var(--ion-color-medium);
        font-style: italic;
      }
    `,
  ],
})
export class RoundHistoryComponent {
  private readonly docService = inject(DocService);

  readonly rounds = input.required<readonly Round[]>();
  /**
   * Full rounds list from the doc, used to resolve `parentRoundId` chains
   * for the re-vote breadcrumb (issue #111). Defaults to `rounds` when
   * omitted — callers that already pass the full doc rounds need not set it.
   */
  readonly allRounds = input<readonly Round[]>([]);
  /** Reserved for future name-based display; unused in compact summary mode. */
  readonly participants = input<readonly ParticipantSnapshot[]>([]);
  readonly isHost = input<boolean>(false);
  readonly editTriggered = output<string>();

  /** Agenda item map for backref fallback (ADR-0042). */
  private readonly agendaMap = computed<ReadonlyMap<string, AgendaItem>>(() => {
    const map = new Map<string, AgendaItem>();
    for (const item of this.docService.agenda()) {
      map.set(item.id, item);
    }
    return map;
  });

  constructor() {
    addIcons({ 'pencil-outline': pencilOutline });
  }

  readonly entries = computed<readonly HistoryEntry[]>(() => {
    // Include rounds that have reached a terminal state (revealed or skipped).
    const terminal = this.rounds().filter((r) => terminalState(r) !== null);
    // Reverse chronological — newest rounds first in the history list.
    const reversed = [...terminal].toReversed();
    // Fall back to local rounds when `allRounds` not provided.
    const lineageSource = this.allRounds().length > 0 ? this.allRounds() : this.rounds();

    return reversed.map((round, revIdx) => {
      const originalIndex = terminal.length - 1 - revIdx;
      const roundNumber = originalIndex + 1;
      const isSkipped = terminalState(round) === 'skipped';
      const lineageLabel = resolveRoundLineage(round.id, lineageSource) !== null ? 're-vote' : null;

      // Fallback: when round has no title/ticketId but has an agendaItemId,
      // resolve the agenda item for the display label (ADR-0042).
      let label = formatRoundLabel(round);
      if (label === null && round.agendaItemId !== undefined) {
        const agendaItem = this.agendaMap().get(round.agendaItemId);
        if (agendaItem !== undefined) {
          label = formatRoundLabel({
            title: agendaItem.title,
            ticketId: agendaItem.ticketId,
          } as Round);
        }
      }

      if (isSkipped) {
        return {
          roundId: round.id,
          roundNumber,
          label,
          summary: '',
          elapsed: null,
          skipped: true,
          lineageLabel,
        };
      }

      const summary = buildVoteSummary(round.votes, round.scale.cards);
      const elapsed =
        round.revealedAt !== undefined && round.timerStartedAt !== undefined
          ? formatElapsed(round.revealedAt - round.timerStartedAt)
          : null;

      return {
        roundId: round.id,
        roundNumber,
        label,
        summary,
        elapsed,
        skipped: false,
        lineageLabel,
      };
    });
  });
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

/** Compact vote summary: "card×count, card×count" sorted by count desc. */
function buildVoteSummary(votes: Record<string, string>, scaleCards: readonly string[]): string {
  const countByCard = new Map<string, number>();
  for (const card of Object.values(votes)) {
    countByCard.set(card, (countByCard.get(card) ?? 0) + 1);
  }
  const scaleOrder = new Map<string, number>(scaleCards.map((c, i) => [c, i]));
  const groups = [...countByCard.entries()].toSorted((a, b) => {
    const byCount = b[1] - a[1];
    if (byCount !== 0) return byCount;
    return (scaleOrder.get(a[0]) ?? 9999) - (scaleOrder.get(b[0]) ?? 9999);
  });
  return groups.length > 0
    ? groups.map(([card, count]) => `${card}×${count}`).join(', ')
    : 'No votes';
}
