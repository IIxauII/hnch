import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { ParticipantSnapshot } from '@hnch/shared';

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
        margin-block: var(--hnch-sp-3);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--hnch-sp-3);
      }
      .dots {
        display: flex;
        gap: var(--hnch-sp-1);
        flex-wrap: wrap;
      }
      .dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1.5px solid var(--ion-color-medium);
        background: transparent;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .dot.voted {
        background: var(--ion-color-primary);
        border-color: var(--ion-color-primary);
      }
      .count {
        color: var(--hnch-muted);
        font: var(--hnch-body-sm);
      }
      @media (prefers-reduced-motion: reduce) {
        .dot {
          transition: none;
        }
      }
    `,
  ],
})
export class AvatarVoteRowComponent {
  readonly participants = input.required<readonly ParticipantSnapshot[]>();
  readonly votedIds = input.required<ReadonlySet<string>>();

  protected readonly votedCount = computed(() => this.votedIds().size);

  protected readonly ariaLabel = computed(
    () => `${this.votedCount()} of ${this.participants().length} voted`,
  );
}
