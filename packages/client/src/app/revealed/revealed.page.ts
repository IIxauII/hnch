import { ChangeDetectionStrategy, Component } from '@angular/core'
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

/**
 * Revealed screen placeholder. Grouped-by-value results, Re-vote (which
 * creates a round with parentRoundId, per ADR-0013), and Next Round all
 * land in Phase 2. See ux.md §4.4.
 */
@Component({
  selector: 'app-revealed',
  imports: [
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/estimating"></ion-back-button>
        </ion-buttons>
        <ion-title>Revealed</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>Revealed placeholder — grouped results land in Phase 2.</p>
    </ion-content>
  `,
})
export class RevealedPage {}
