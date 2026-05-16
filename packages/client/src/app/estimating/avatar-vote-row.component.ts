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
          <span class="dot-cell">
            <span class="dot" [class.voted]="votedIds().has(p.id)">
              <span class="dot-initial">{{ initialOf(p) }}</span>
            </span>
            <span class="dot-label">{{ labelOf(p) }}</span>
          </span>
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
        flex-wrap: wrap;
        gap: 0.35rem;
        row-gap: 0.5rem;
      }
      .dot-cell {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
        /* Mobile: cell shrinks to dot width so spacing stays uniform. */
        width: 1.5rem;
      }
      .dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 50%;
        border: 1.5px solid var(--ion-color-medium);
        background: transparent;
      }
      .dot.voted {
        background: var(--ion-color-primary);
        border-color: var(--ion-color-primary);
      }
      .dot-initial {
        font-size: 0.625rem;
        font-weight: 600;
        line-height: 1;
        color: var(--ion-color-medium);
      }
      .dot.voted .dot-initial {
        color: #fff;
      }
      .dot-label {
        display: none;
      }
      /* $bp-md = 768px — see packages/client/src/theme/_breakpoints.scss */
      @media (min-width: 768px) {
        .dots {
          gap: 0.5rem;
        }
        /* Fixed cell width on portal so dot spacing is uniform
           regardless of label length. Labels overflow-ellipsis
           inside the cell. */
        .dot-cell {
          width: 4rem;
        }
        .dot-label {
          display: block;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 0.6875rem;
          color: var(--ion-color-medium);
          text-align: center;
        }
      }
      .count {
        color: var(--ion-color-medium);
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

  protected initialOf(p: ParticipantSnapshot): string {
    return (p.displayName?.trim()?.[0] ?? '').toUpperCase();
  }

  protected labelOf(p: ParticipantSnapshot): string {
    return (p.displayName ?? '').slice(0, 10);
  }
}
