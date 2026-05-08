import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { ShellMode } from '../shell-mode.service';
import { RailPublicComponent } from './rail-public.component';
import { RailSessionComponent } from './rail-session.component';

/**
 * Rail host. Selects public vs session content based on the mode input.
 * Renders nothing in 'hidden' mode (rail is already display:none via shell CSS).
 */
@Component({
  selector: 'hnch-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RailPublicComponent, RailSessionComponent],
  template: `
    @switch (mode()) {
      @case ('public') {
        <hnch-rail-public />
      }
      @case ('session') {
        <hnch-rail-session />
      }
      @default {
        <!-- hidden mode — render nothing -->
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        background: var(--ion-background-color);
      }
    `,
  ],
})
export class RailComponent {
  readonly mode = input<ShellMode>('public');
}
