import { ChangeDetectionStrategy, Component } from '@angular/core';

import { PublicNavBlockComponent } from './public-nav-block.component';

/**
 * Public rail content: wordmark + Home/Settings nav.
 * Rendered when ShellMode is 'public'.
 * Delegates nav rendering to PublicNavBlockComponent (shared with session rail).
 */
@Component({
  selector: 'hnch-rail-public',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PublicNavBlockComponent],
  template: `
    <div class="rail-public">
      <hnch-public-nav-block />
      <div class="rail-eyebrow" aria-hidden="true">PUBLIC</div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .rail-public {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-3, 12px);
        padding: var(--hnch-sp-5, 24px) var(--hnch-sp-4, 16px);
        height: 100%;
      }

      .rail-eyebrow {
        font: var(--hnch-eyebrow);
        letter-spacing: var(--hnch-eyebrow-tracking);
        color: var(--ion-color-step-600);
        text-transform: uppercase;
      }
    `,
  ],
})
export class RailPublicComponent {}
