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
 * Lobby screen placeholder. Wiring to the Yjs doc (participants list,
 * settings summary, Start Round button) lands in Phase 2; share sheet
 * and QR display land in Phase 5. See ux.md §5 (Lobby section).
 */
@Component({
  selector: 'app-lobby',
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
        <ion-title>Lobby</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>Lobby placeholder — doc wiring lands in Phase 2.</p>
    </ion-content>
  `,
})
export class LobbyPage {}
