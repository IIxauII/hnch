import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { ParticipantSnapshot } from '@hnch/shared';

@Component({
  selector: 'app-avatar-vote-row',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" role="group" [attr.aria-label]="ariaLabel()">
      <div class="dots-row">
        <div class="dots" aria-hidden="true">
          @for (p of participants(); track p.id) {
            <span class="dot" [class.voted]="votedIds().has(p.id)">
              <span class="dot-initial">{{ initialOf(p) }}</span>
            </span>
          }
        </div>
        <span class="count">{{ votedCount() }} of {{ participants().length }} voted</span>
      </div>
      @if (showPendingLine()) {
        <p class="pending-line">Waiting on: {{ pendingNames() }}</p>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .row {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .dots-row {
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
      .count {
        color: var(--ion-color-medium);
        font-size: 0.95rem;
      }
      .pending-line {
        margin: 0;
        color: var(--ion-color-medium);
        font-size: 0.8125rem;
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

  // Pending = participants whose id is NOT in votedIds.
  protected readonly pendingParticipants = computed(() =>
    this.participants().filter((p) => !this.votedIds().has(p.id)),
  );

  // Reveal the "Waiting on:" line once at least half of voters have voted
  // (decision-time signal for the host) and at least one is still pending.
  protected readonly showPendingLine = computed(() => {
    const total = this.participants().length;
    if (total === 0) return false;
    const pending = this.pendingParticipants().length;
    if (pending === 0) return false;
    return this.votedCount() / total >= 0.5;
  });

  protected readonly pendingNames = computed(() =>
    this.pendingParticipants()
      .map((p) => (p.displayName ?? '').slice(0, 10))
      .join(', '),
  );

  protected initialOf(p: ParticipantSnapshot): string {
    return (p.displayName?.trim()?.[0] ?? '').toUpperCase();
  }
}
