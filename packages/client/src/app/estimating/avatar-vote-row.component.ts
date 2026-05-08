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
        border: 1.5px solid var(--ion-color-step-600);
        background: transparent;
      }
      .dot.voted {
        background: var(--ion-color-primary);
        border-color: var(--ion-color-primary);
      }
      .count {
        color: var(--ion-color-step-600);
        font-size: 0.95rem;
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
