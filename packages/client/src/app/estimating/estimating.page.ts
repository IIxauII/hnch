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
 * Estimating screen placeholder. Card grid, vote cast/change, avatar
 * row, and host-only Reveal button all land in Phase 2 once the doc
 * service is in place. See ux.md §4.4 and §5.
 */
@Component({
  selector: 'app-estimating',
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
          <ion-back-button defaultHref="/lobby"></ion-back-button>
        </ion-buttons>
        <ion-title>Estimating</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>Estimating placeholder — card grid lands in Phase 2.</p>
    </ion-content>
  `,
})
export class EstimatingPage {}
