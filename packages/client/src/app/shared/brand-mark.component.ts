import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * BrandMark — the "Hump" logo on a rounded tile: a hunch-shaped bell curve
 * with a spark above its peak. Same artwork as `assets/icon/favicon.svg`.
 *
 * Colors come from the `--hnch-brand-*` tokens (fixed brand colors, inverted
 * in dark mode), not the user's accent.
 *
 * Usage:
 *   <app-brand-mark [size]="64" />
 *   <app-brand-mark [size]="32" />
 */
@Component({
  selector: 'app-brand-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="brand-tile"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.border-radius.px]="borderRadius()"
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" [attr.width]="glyphSize()" [attr.height]="glyphSize()">
        <path
          class="curve"
          d="M10 81H22C34 81 36 41 50 41S66 81 78 81H90"
          [attr.stroke-width]="strokeWidth()"
        ></path>
        <circle class="spark" cx="50" cy="21" [attr.r]="sparkRadius()"></circle>
      </svg>
    </div>
  `,
  styles: [
    `
    :host {
      display: inline-block;
      line-height: 0;
    }

    .brand-tile {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--hnch-brand-tile);
      flex-shrink: 0;
    }

    .curve {
      fill: none;
      stroke: var(--hnch-brand-ink);
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .spark {
      fill: var(--hnch-brand-spark);
    }
  `,
  ],
})
export class BrandMarkComponent {
  readonly size = input<number>(56);

  /** Small tiles get heavier strokes so the mark stays legible. */
  private readonly small = computed(() => this.size() <= 40);

  protected readonly borderRadius = computed(() => Math.round(this.size() * 0.22));
  protected readonly glyphSize = computed(() => Math.round(this.size() * 0.8));
  protected readonly strokeWidth = computed(() => (this.small() ? 11 : 9));
  protected readonly sparkRadius = computed(() => (this.small() ? 10 : 8));
}
