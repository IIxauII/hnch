import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core'

import { AccentService } from '../core/accent.service'
import { ACCENTS, type AccentKey } from '../core/accent.tokens'
import { HapticService } from '../core/haptic.service'

/**
 * Responsive accent swatch grid — 5×2 on mobile, single row on ≥768px.
 *
 * Reads active AccentKey from AccentService. Tap to change accent.
 * Active state: inset bg ring + accent halo.
 *
 * See ionic-screens.jsx:670–688 and plan §accent-swatch-grid.
 */
@Component({
  selector: 'app-accent-swatch-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- role="group" + role="button" + aria-pressed: each swatch independently tabbable -->
    <div class="swatch-grid" role="group" aria-label="Accent color">
      @for (entry of accentEntries; track entry.key) {
        <button
          class="swatch"
          [class.active]="accentService.accent() === entry.key"
          [style.background]="entry.def.base"
          [attr.aria-label]="entry.def.label"
          [attr.aria-pressed]="accentService.accent() === entry.key"
          (click)="selectAccent(entry.key)"
        >
          @if (accentService.accent() === entry.key) {
            <span class="check" aria-hidden="true">✓</span>
          }
        </button>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .swatch-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }

    @media (min-width: 768px) {
      .swatch-grid {
        grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
      }
    }

    .swatch {
      aspect-ratio: 1;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      position: relative;
      transition: box-shadow 0.15s ease;
      /* Remove default button bg */
      background-clip: padding-box;
    }

    .swatch:focus-visible {
      outline: 2px solid var(--hnch-accent);
      outline-offset: 2px;
    }

    .swatch.active {
      box-shadow:
        inset 0 0 0 3px var(--hnch-bg),
        0 0 0 2px var(--hnch-accent);
    }

    .check {
      color: var(--hnch-bg);
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      pointer-events: none;
    }
  `],
})
export class AccentSwatchGridComponent {
  protected readonly accentService = inject(AccentService)
  private readonly haptics = inject(HapticService)

  protected readonly accentEntries: { key: AccentKey; def: (typeof ACCENTS)[AccentKey] }[] =
    (Object.entries(ACCENTS) as [AccentKey, (typeof ACCENTS)[AccentKey]][]).map(
      ([key, def]) => ({ key, def }),
    )

  protected selectAccent(key: AccentKey): void {
    this.haptics.impactLight()
    void this.accentService.setAccent(key)
  }
}
