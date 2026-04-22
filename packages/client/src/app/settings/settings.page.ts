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
 * App Settings screen placeholder. Display-name editor, theme picker,
 * version / licenses / privacy all land in Phase 6. See ux.md §3
 * and §7.
 */
@Component({
  selector: 'app-settings',
  host: { class: 'ion-page' },
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
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>Settings placeholder — editor and theme picker land in Phase 6.</p>
    </ion-content>
  `,
})
export class SettingsPage {}
