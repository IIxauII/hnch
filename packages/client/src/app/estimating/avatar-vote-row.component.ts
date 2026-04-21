import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core'

import type { ParticipantSnapshot } from '@hnch/shared'

/**
 * Compact "who has voted" indicator for the Estimating screen —
 * ux.md §5.5 avatar row.
 *
 * Filled dot = participant has cast a vote this round; open dot =
 * connected but no vote yet. Tapping the row is (Phase 3+) supposed
 * to open a popover grouping voters vs. non-voters; in Phase 2 the
 * row is still tappable for layout parity but the popover isn't wired
 * yet — the single-participant case would render a trivial list and
 * a real popover adds no value until joiners exist.
 *
 * Kept as a standalone component so Phase 3 can feed in a real
 * participants list without touching the Estimating screen's template.
 */
@Component({
  selector: 'app-avatar-vote-row',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" role="group" [attr.aria-label]="ariaLabel()">
      <div class="dots" aria-hidden="true">
        @for (p of participants(); track p.id) {
          <span
            class="dot"
            [class.voted]="votedIds().has(p.id)"
          ></span>
        }
      </div>
      <span class="count">
        {{ votedCount() }} of {{ participants().length }} voted
      </span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .dots {
        display: flex;
        gap: 0.35rem;
      }
      .dot {
        width: 0.75rem;
        height: 0.75rem;
        border-radius: 50%;
        border: 1.5px solid var(--ion-color-medium);
        background: transparent;
      }
      .dot.voted {
        background: var(--ion-color-primary);
        border-color: var(--ion-color-primary);
      }
      .count {
        color: var(--ion-color-medium);
        font-size: 0.95rem;
      }
    `,
  ],
})
export class AvatarVoteRowComponent {
  /**
   * All session participants, in any order. The row shows one dot per
   * entry, in the order given.
   */
  readonly participants = input.required<readonly ParticipantSnapshot[]>()

  /**
   * Set of `participantId`s who have cast a vote this round. Derived
   * once at the call site from `Object.keys(round.votes)` so this
   * component stays decoupled from the round shape.
   */
  readonly votedIds = input.required<ReadonlySet<string>>()

  protected readonly votedCount = computed(() => this.votedIds().size)

  protected readonly ariaLabel = computed(
    () => `${this.votedCount()} of ${this.participants().length} voted`,
  )
}
