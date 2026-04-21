import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core'
import { Router } from '@angular/router'
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import {
  addOutline,
  arrowForwardOutline,
  ellipsisHorizontalCircle,
  returnUpBackOutline,
} from 'ionicons/icons'

import {
  JumpBackInBannerComponent,
  type JumpBackInSummary,
} from './jump-back-in-banner.component'

/**
 * Home launchpad — ux.md §5.2.
 *
 * Two primary entry points (Create, Join) and a ⋯ action sheet that
 * currently only exposes Settings. The JumpBackInBanner shell is
 * rendered iff `jumpBackInSummary()` is non-null; Phase 3 will wire
 * that signal to the local session cache. Until then the banner
 * stays hidden — its DOM is loaded and ready to accept state
 * without further template churn.
 *
 * "Create Room" logs a Phase 2 marker and no-ops; real room
 * creation (Yjs doc, relay connect, participantId) lands in Phase 2
 * per the roadmap exit bar.
 */
@Component({
  selector: 'app-home',
  imports: [
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
    JumpBackInBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>hnch</ion-title>
        <ion-buttons slot="end">
          <ion-button
            aria-label="More options"
            (click)="openActionSheet()"
          >
            <ion-icon
              slot="icon-only"
              name="ellipsis-horizontal-circle"
            ></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (jumpBackInSummary(); as summary) {
        <app-jump-back-in-banner
          [summary]="summary"
          (resumeRequested)="onResumeJumpBack()"
        />
      }

      <ion-card button (click)="onCreateRoom()">
        <ion-card-content>
          <div class="row">
            <ion-icon name="add-outline" aria-hidden="true"></ion-icon>
            <div class="text">
              <strong>Create Room</strong>
              <span>Start a new session</span>
            </div>
          </div>
        </ion-card-content>
      </ion-card>

      <ion-card button (click)="onJoinRoom()">
        <ion-card-content>
          <div class="row">
            <ion-icon name="arrow-forward-outline" aria-hidden="true"></ion-icon>
            <div class="text">
              <strong>Join Room</strong>
              <span>Enter a code or scan QR</span>
            </div>
          </div>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      ion-icon {
        font-size: 1.5rem;
        color: var(--ion-color-primary);
      }
      .text {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
    `,
  ],
})
export class HomePage {
  private readonly router = inject(Router)
  private readonly actionSheetCtrl = inject(ActionSheetController)

  /**
   * Backed-out-session summary for the Jump-back-in banner. Null in
   * Phase 1 — wired to the local session cache in Phase 3.
   */
  protected readonly jumpBackInSummary = signal<JumpBackInSummary | null>(null)

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'arrow-forward-outline': arrowForwardOutline,
      'ellipsis-horizontal-circle': ellipsisHorizontalCircle,
      'return-up-back-outline': returnUpBackOutline,
    })
  }

  protected onCreateRoom(): void {
    // Phase 2: mint Yjs doc, connect to relay, navigate to /lobby.
    // Phase 1 is navigation scaffolding only.
    console.debug('create room — phase 2')
  }

  protected async onJoinRoom(): Promise<void> {
    await this.router.navigate(['/join'])
  }

  protected onResumeJumpBack(): void {
    // Phase 3: reconnect the cached session and push the recorded
    // screen. No-op while the summary signal is null.
    console.debug('resume jump-back — phase 3')
  }

  protected async openActionSheet(): Promise<void> {
    const sheet = await this.actionSheetCtrl.create({
      header: 'hnch',
      buttons: [
        {
          text: 'Settings',
          handler: () => {
            void this.router.navigate(['/settings'])
          },
        },
        {
          text: 'Cancel',
          role: 'cancel',
        },
      ],
    })
    await sheet.present()
  }
}
