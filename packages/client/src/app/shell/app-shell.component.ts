import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonMenu, IonRouterOutlet, IonSplitPane } from '@ionic/angular/standalone';

import { ShellModeService } from './shell-mode.service';
import { RailComponent } from './rail/rail.component';

/**
 * App shell. Wraps ion-split-pane so the persistent rail nav appears
 * at lg+ (≥1024px) on every route, while mobile renders only the
 * router outlet. Rail is hidden on /onboarding via 'hidden' mode.
 *
 * All root-level effects (host election, session-end, theme) remain
 * in app.component.ts — they are truly root-level concerns independent
 * of the shell layout.
 */
@Component({
  selector: 'hnch-app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonSplitPane, IonMenu, IonRouterOutlet, RailComponent],
  template: `
    <ion-split-pane
      contentId="main"
      when="(min-width: 1024px)"
      [class.shell-rail-hidden]="mode() === 'hidden'"
    >
      <ion-menu side="start" contentId="main" type="overlay" [disabled]="mode() === 'hidden'">
        <hnch-rail [mode]="mode()" />
      </ion-menu>
      <ion-router-outlet id="main" />
    </ion-split-pane>
  `,
  styles: [
    `
      ion-split-pane {
        --side-min-width: 260px;
        --side-max-width: 280px;
        --side-width: 260px;
      }

      .shell-rail-hidden {
        --side-width: 0;

        ion-menu {
          display: none;
        }
      }
    `,
  ],
})
export class AppShellComponent {
  private readonly shellMode = inject(ShellModeService);

  protected readonly mode = this.shellMode.mode;
}
