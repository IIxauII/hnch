import { ChangeDetectionStrategy, Component } from '@angular/core'
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

/**
 * Onboarding screen placeholder. The real form — name input, Continue
 * button, Preferences persistence, and pending-join-URL resume — lands
 * in commit #4 of the Phase 1 plan. See ux.md §4.1.
 */
@Component({
  selector: 'app-onboarding',
  imports: [IonContent, IonHeader, IonTitle, IonToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Welcome</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>Onboarding placeholder — implemented in commit #4.</p>
    </ion-content>
  `,
})
export class OnboardingPage {}
