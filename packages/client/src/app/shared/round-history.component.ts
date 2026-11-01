import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatRoundLabel, isAbstainVote, isRecordedStatus, roundNumber } from '@hnch/shared';
import type { AgendaItem, ParticipantSnapshot, Round } from '@hnch/shared';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { pencilOutline } from 'ionicons/icons';

import { DocService } from '../core/doc/doc.service';
import { roundElapsedLabel } from '../core/elapsed-label';
import { revoteLabel } from './revote-label';

/** One entry in the compact history list. */
interface HistoryEntry {
  readonly roundId: string;
  readonly roundNumber: number;
  /** Combined `ticketId · title` label (or one of them, or null). */
  readonly label: string | null;
  readonly summary: string;
  readonly elapsed: string | null;
  readonly skipped: boolean;
  /** `"Re-vote"` for a round that re-votes an earlier one; `null` otherwise (#111). */
  readonly lineageLabel: string | null;
}

/**
 * RoundHistoryComponent — compact summary list of past rounds.
 *
 * Inputs:
 *  - `rounds` — the rounds to list (caller passes every finished round
 *    except the most recent, which VoteResultsComponent covers in full)
 *  - `allRounds` — the doc's full rounds list; source of each round's number
 *    and of the re-vote lineage
 *  - `participants` — participant list (reserved for future name display)
 *
 * Renders one row per round, newest first: number, name, vote summary, time.
 * Only rounds that *produced an entry* appear — revealed and skipped. A
 * discarded round is a tombstone (ADR-0046) and an active one is not history
 * yet, so neither is listed.
 */
@Component({
  selector: 'app-round-history',
  imports: [IonButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length > 0) {
      <ul class="history-list" role="list">
        @for (entry of entries(); track entry.roundId) {
          <li class="history-item" [class.skipped]="entry.skipped">
            <div class="history-text">
              <div class="history-main">
                <span class="round-label">Round {{ entry.roundNumber }}</span>
                @if (entry.lineageLabel) {
                  <span class="revote-badge">{{ entry.lineageLabel }}</span>
                }
                @if (entry.label) {
                  <span class="round-title">{{ entry.label }}</span>
                }
              </div>
              <div class="history-meta">
                @if (entry.skipped) {
                  <span class="round-skipped">Skipped</span>
                } @else {
                  <span class="round-summary">{{ entry.summary }}</span>
                  @if (entry.elapsed) {
                    <span class="round-elapsed">{{ entry.elapsed }}</span>
                  }
                }
              </div>
            </div>
            @if (isHost()) {
              @if (entry.skipped) {
                <!-- Keeps the columns of a skipped row in line with the rows that have a button. -->
                <span class="edit-spacer" aria-hidden="true"></span>
              } @else {
                <ion-button
                  fill="clear"
                  class="edit-btn"
                  [attr.aria-label]="'Edit round ' + entry.roundNumber"
                  (click)="editTriggered.emit(entry.roundId)"
                >
                  <ion-icon name="pencil-outline" slot="icon-only" aria-hidden="true" />
                </ion-button>
              }
            }
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .history-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .history-item {
        display: flex;
        align-items: center;
        min-height: 44px;
        border-top: 0.55px solid var(--hnch-sep);
        font-size: 0.9375rem;
      }
      .history-item:first-child {
        border-top: none;
      }
      .history-text {
        display: flex;
        flex: 1 1 auto;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 2px 12px;
        min-width: 0;
        padding: 8px 0;
      }
      .history-main {
        display: flex;
        flex: 1 1 12rem;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 2px 8px;
        min-width: 0;
      }
      /* Takes a line of its own when it does not fit beside the name, and
         wraps within it when it does not fit the line either: a round with
         many different votes has a long summary. */
      .history-meta {
        display: flex;
        flex: 0 1 auto;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 2px 12px;
        min-width: 0;
        color: var(--hnch-muted);
        font-variant-numeric: tabular-nums;
      }
      .round-label {
        color: var(--hnch-text);
        font-weight: 600;
        white-space: nowrap;
      }
      .round-title {
        min-width: 0;
        color: var(--hnch-text);
        overflow-wrap: anywhere;
      }
      .revote-badge {
        padding: 1px 6px;
        border-radius: 6px;
        background: var(--hnch-fill);
        color: var(--hnch-muted);
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
      }
      .round-summary {
        min-width: 0;
      }
      .round-elapsed,
      .round-skipped {
        white-space: nowrap;
      }
      /* Pencil at the row's edge, 44px target reaching inwards — as in the roster. */
      .edit-btn,
      .edit-spacer {
        flex: 0 0 auto;
        width: 44px;
        margin: 0;
      }
      .edit-btn {
        --color: var(--hnch-muted);
        --padding-end: 0;
        --padding-start: 20px;
        min-height: 44px;
        font-size: 0.875rem;
      }
      .history-item.skipped .history-main {
        opacity: 0.7;
      }
    `,
  ],
})
export class RoundHistoryComponent {
  private readonly docService = inject(DocService);

  readonly rounds = input.required<readonly Round[]>();
  /**
   * Full rounds list from the doc. Each round's number is worked out against
   * *this* list (`roundNumber`), so a row reads "Round 3" for the round that
   * was "Round 3" on the Estimating screen, whatever was filtered out of
   * `rounds`. Also resolves `parentRoundId` chains for the re-vote badge
   * (#111). Defaults to `rounds` when omitted.
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
    const source = this.allRounds().length > 0 ? this.allRounds() : this.rounds();

    const listed = this.rounds().filter((r) => isRecordedStatus(r.status));

    // Reverse chronological — newest rounds first in the history list.
    return listed.toReversed().map((round) => {
      const number = roundNumber(round, source);
      const isSkipped = round.status === 'skipped';
      const lineageLabel = revoteLabel(round.id, source);

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
          roundNumber: number,
          label,
          summary: '',
          elapsed: null,
          skipped: true,
          lineageLabel,
        };
      }

      return {
        roundId: round.id,
        roundNumber: number,
        label,
        summary: buildVoteSummary(round.votes, round.scale.cards),
        elapsed: roundElapsedLabel(round),
        skipped: false,
        lineageLabel,
      };
    });
  });
}

// Module-private helpers

/**
 * Compact vote summary: "card×count, card×count" sorted by count desc, then
 * scale order. Abstentions are not a card — the sentinel never reaches the
 * screen (ADR-0041); they trail the cards as a plain count.
 */
function buildVoteSummary(votes: Record<string, string>, scaleCards: readonly string[]): string {
  const countByCard = new Map<string, number>();
  let abstained = 0;
  for (const card of Object.values(votes)) {
    if (isAbstainVote(card)) {
      abstained += 1;
      continue;
    }
    countByCard.set(card, (countByCard.get(card) ?? 0) + 1);
  }
  const scaleOrder = new Map<string, number>(scaleCards.map((c, i) => [c, i]));
  const groups = [...countByCard.entries()].toSorted((a, b) => {
    const byCount = b[1] - a[1];
    if (byCount !== 0) return byCount;
    return (scaleOrder.get(a[0]) ?? 9999) - (scaleOrder.get(b[0]) ?? 9999);
  });

  const parts = groups.map(([card, count]) => `${card}×${count}`);
  if (abstained > 0) parts.push(`${abstained} abstained`);
  return parts.length > 0 ? parts.join(', ') : 'No votes';
}
