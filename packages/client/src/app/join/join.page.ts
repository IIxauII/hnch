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
 * Join Room screen placeholder. Manual code entry lands in Phase 3;
 * QR scan and invite-URL deep link in Phase 5. See ux.md §4.3.
 */
@Component({
  selector: 'app-join',
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
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>Join Room</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>Join Room placeholder — manual entry wired in Phase 3.</p>
    </ion-content>
  `,
})
export class JoinPage {}
