import { ChangeDetectionStrategy, Component } from '@angular/core'
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone'

/**
 * Root shell. Provides the `ion-app` container and the single nav stack
 * (`ion-router-outlet`). Per ux.md §2 the app uses a single nav stack —
 * no tabs, no side menu — so this shell stays deliberately minimal.
 */
@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent {}
