import { ChangeDetectionStrategy, Component } from '@angular/core'
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

/**
 * Home launchpad placeholder. Real content — Create Room card, Join
 * Room card, JumpBackInBanner shell, and the ⋯ action-sheet entry into
 * Settings — lands in commit #5 of the Phase 1 plan. See ux.md §3 and
 * the roadmap §3 exit bar.
 */
@Component({
  selector: 'app-home',
  imports: [IonContent, IonHeader, IonTitle, IonToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>hnch</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>Home placeholder — Create / Join cards land in commit #5.</p>
    </ion-content>
  `,
})
export class HomePage {}
