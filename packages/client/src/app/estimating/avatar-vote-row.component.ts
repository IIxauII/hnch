import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { resolveAvatarColor, resolveAvatarInkColor, type ParticipantSnapshot } from '@hnch/shared';

import { avatarInitial } from '../shared/name-initial';

@Component({
  selector: 'app-avatar-vote-row',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" role="group" [attr.aria-label]="ariaLabel()">
      <div class="dots-row">
        <div class="dots" aria-hidden="true">
          @for (p of participants(); track p.id) {
            <span
              class="dot"
              [class.voted]="votedIds().has(p.id)"
              [style.--avatar-color]="colorOf(p)"
            >
              <span
                class="dot-initial"
                [style.color]="votedIds().has(p.id) ? inkOf(p) : null"
              >{{ initialOf(p) }}</span>
            </span>
          }
        </div>
        <span class="count">{{ countLabel() }}</span>
      </div>
      @if (showPendingLine()) {
        <p class="pending-line">Waiting for {{ pendingNames() }}</p>
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
        gap: 4px;
      }
      .dots-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 12px;
        min-height: 32px;
      }
      .dots {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .dots:empty {
        display: none;
      }
      .dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 1.5px solid var(--hnch-sep-strong);
        background: transparent;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      /* The edge is the fill pulled toward the text color, as on the avatar:
         a dark fill on a dark surface has no edge of its own. */
      .dot.voted {
        background: var(--avatar-color, var(--hnch-accent));
        border-color: var(--avatar-color, var(--hnch-accent));
      }
      @supports (color: color-mix(in srgb, red, blue)) {
        .dot.voted {
          border-color: color-mix(
            in srgb,
            var(--avatar-color, var(--hnch-accent)) 72%,
            var(--hnch-text)
          );
        }
      }
      .dot-initial {
        color: var(--hnch-muted);
        font-size: 0.75rem;
        font-weight: 600;
        line-height: 1;
      }
      .count {
        color: var(--hnch-muted);
        font-size: 0.9375rem;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      /* Names wrap: the line exists to be read, and an ellipsis ate the names. */
      .pending-line {
        max-width: 100%;
        margin: 0;
        color: var(--hnch-muted);
        font-size: 0.8125rem;
        line-height: 1.35;
        overflow-wrap: anywhere;
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

  /**
   * "2 of 3 voted". With nobody to wait for — everyone here is observing —
   * "0 of 0 voted" is arithmetic, not information.
   */
  protected readonly countLabel = computed(() => {
    const total = this.participants().length;
    if (total === 0 && this.votedCount() === 0) return 'No voters yet';
    return `${this.votedCount()} of ${total} voted`;
  });

  protected readonly ariaLabel = this.countLabel;

  // Pending = participants whose id is NOT in votedIds.
  protected readonly pendingParticipants = computed(() =>
    this.participants().filter((p) => !this.votedIds().has(p.id)),
  );

  // Show the "Waiting for …" line once at least half of the voters have voted
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
      .map((p) => p.displayName)
      .join(', '),
  );

  protected initialOf(p: ParticipantSnapshot): string {
    return avatarInitial(p.displayName);
  }

  /** Resolved avatar color (ADR-0043). Falls back to deterministic hash of `p.id`. */
  protected colorOf(p: ParticipantSnapshot): string {
    return resolveAvatarColor(p.avatarColor, p.id);
  }

  protected inkOf(p: ParticipantSnapshot): '#000' | '#fff' {
    return resolveAvatarInkColor(p.avatarColor, p.id);
  }
}
