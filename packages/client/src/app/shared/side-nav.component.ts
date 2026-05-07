import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core'
import { RouterLink, RouterLinkActive } from '@angular/router'
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { homeOutline, peopleOutline, settingsOutline } from 'ionicons/icons'

import { DocService } from '../core/doc/doc.service'

addIcons({ homeOutline, peopleOutline, settingsOutline })

/**
 * SideNavComponent — permanent left-rail nav rendered inside ion-menu
 * when the split-pane is open (≥992px / lg breakpoint).
 */
@Component({
  selector: 'app-side-nav',
  host: { class: 'ion-page' },
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar,
    RouterLink,
    RouterLinkActive,
  ],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-title>hnch</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-item
          button="true"
          routerLink="/home"
          routerLinkActive="active-link"
          [routerLinkActiveOptions]="{ exact: false }"
          aria-label="Home"
        >
          <ion-icon slot="start" name="home-outline" aria-hidden="true"></ion-icon>
          <ion-label>Home</ion-label>
        </ion-item>
        @if (activeSessionCode(); as code) {
          <ion-item
            button="true"
            [routerLink]="['/lobby', code]"
            routerLinkActive="active-link"
            aria-label="Active session"
          >
            <ion-icon slot="start" name="people-outline" aria-hidden="true"></ion-icon>
            <ion-label>Active session
              <p>{{ code }}</p>
            </ion-label>
          </ion-item>
        }
        <ion-item
          button="true"
          routerLink="/settings"
          routerLinkActive="active-link"
          aria-label="Settings"
        >
          <ion-icon slot="start" name="settings-outline" aria-hidden="true"></ion-icon>
          <ion-label>Settings</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
  styles: [`
    .active-link {
      --background: var(--ion-background-color-step-100);
    }
  `],
})
export class SideNavComponent {
  private readonly docService = inject(DocService)

  protected readonly activeSessionCode = computed(() =>
    this.docService.hasSession() ? this.docService.roomCode() : null
  )
}
