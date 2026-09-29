import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { resolveAvatarColor, resolveAvatarInkColor } from '@hnch/shared';

import { nameInitial } from './name-initial';

/**
 * Participant avatar — the display name's initial on the participant's
 * color (ADR-0043). The same mark the Estimating vote row uses, so a person
 * looks the same in the Lobby roster as they do while voting.
 *
 * Decorative: the name is always rendered next to it, so the element is
 * hidden from assistive tech.
 *
 * Usage:
 *   <app-avatar [participantId]="p.id" [name]="p.displayName" [color]="p.avatarColor" />
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'fontSize()',
    '[style.background]': 'fill()',
    '[style.--avatar-fill]': 'fill()',
    '[style.color]': 'ink()',
    '[class.dimmed]': 'dimmed()',
  },
  template: `{{ initial() }}`,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        /* An edge in the fill's own hue, pulled toward the text color. A
           dark fill on a dark surface has none of its own — Graphite on a
           dark card was a letter floating in the row. */
        box-shadow: inset 0 0 0 1.5px
          color-mix(in srgb, var(--avatar-fill, transparent) 72%, var(--hnch-text));
        font-weight: 600;
        line-height: 1;
        user-select: none;
      }
      :host(.dimmed) {
        opacity: 0.45;
      }
    `,
  ],
})
export class AvatarComponent {
  /** Seeds the deterministic fallback color when `color` is missing or invalid. */
  readonly participantId = input.required<string>();
  readonly name = input.required<string>();
  /** Wire value from the participant record — a palette key or `#rrggbb`. */
  readonly color = input<string | undefined>(undefined);
  readonly size = input<number>(32);
  /** Offline participants render faded. */
  readonly dimmed = input<boolean>(false);

  protected readonly initial = computed(() => nameInitial(this.name()) || '?');
  protected readonly fill = computed(() => resolveAvatarColor(this.color(), this.participantId()));
  protected readonly ink = computed(() =>
    resolveAvatarInkColor(this.color(), this.participantId()),
  );
  protected readonly fontSize = computed(() => Math.round(this.size() * 0.44));
}
