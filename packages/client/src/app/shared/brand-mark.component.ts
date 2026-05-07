import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core'

/**
 * BrandMark — rounded-square "hnch" tile with accent corner dot.
 *
 * Mirrors ionic-screens.jsx:265–278.
 *
 * Usage:
 *   <app-brand-mark [size]="56" />
 *   <app-brand-mark [size]="40" />
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
      <span class="brand-text" [style.font-size.px]="fontSize()">hnch</span>
      <span
        class="accent-dot"
        [style.width.px]="dotSize()"
        [style.height.px]="dotSize()"
      ></span>
    </div>
  `,
  styles: [`
    :host {
      display: inline-block;
      line-height: 0;
    }

    .brand-tile {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--ion-text-color);
      color: var(--ion-background-color);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
      font-weight: 700;
      letter-spacing: -0.02em;
      overflow: visible;
      flex-shrink: 0;
    }

    .brand-text {
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1;
      user-select: none;
    }

    .accent-dot {
      position: absolute;
      bottom: -3px;
      right: -3px;
      border-radius: 50%;
      background: var(--hnch-accent);
      border: 2px solid var(--ion-background-color);
      flex-shrink: 0;
    }
  `],
})
export class BrandMarkComponent {
  readonly size = input<number>(56)

  protected readonly borderRadius = computed(() => Math.round(this.size() * 0.28))
  protected readonly fontSize = computed(() => Math.round(this.size() * 0.28))
  protected readonly dotSize = computed(() => Math.round(this.size() * 0.30))
}
