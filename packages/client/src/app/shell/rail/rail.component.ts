import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { ShellMode } from '../shell-mode.service';

/**
 * Rail host component. Placeholder stub — full implementation in B10.
 * Renders a minimal marker so AppShellComponent can compile and boot.
 */
@Component({
  selector: 'hnch-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="hnch-rail-stub">rail</div>`,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .hnch-rail-stub {
        padding: var(--hnch-sp-4, 16px);
        font: var(--hnch-eyebrow);
        color: var(--ion-color-step-600);
      }
    `,
  ],
})
export class RailComponent {
  readonly mode = input<ShellMode>('public');
}
