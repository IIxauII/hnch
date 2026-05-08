import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Session rail content placeholder.
 * Full implementation in B12 (SessionContextBlock + Leave/End footer).
 */
@Component({
  selector: 'hnch-rail-session',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="hnch-rail-session-stub">session rail</div>`,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .hnch-rail-session-stub {
        padding: var(--hnch-sp-4, 16px);
        font: var(--hnch-eyebrow);
        color: var(--ion-color-step-600);
      }
    `,
  ],
})
export class RailSessionComponent {}
