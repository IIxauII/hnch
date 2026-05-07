import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { returnUpBackOutline } from 'ionicons/icons'

import type { LastSessionScreen } from '../core/last-session.service'

/**
 * Jump-back-in banner — ux.md §5.2.
 *
 * Renders as a third row inside the parent's `ion-list.actions`,
 * matching the Create Room / Join Room rows. The host element uses
 * `display: contents` so the inner `ion-item` flows directly into the
 * grouped inset list. The `app-jump-back-in-banner` selector is
 * preserved as an e2e locator.
 */
export interface JumpBackInSummary {
  /** Room code rendered as part of the row subtitle. */
  readonly roomCode: string
  /** Which in-session screen the rejoin will land on. */
  readonly lastScreen: LastSessionScreen
}

@Component({
  selector: 'app-jump-back-in-banner',
  imports: [IonIcon, IonItem, IonLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-item
      button="true"
      detail="true"
      [class.stale]="stale()"
      [disabled]="resuming() && !stale()"
      (click)="onTap()"
    >
      <div class="icon-tile icon-tile--accent" slot="start" aria-hidden="true">
        <ion-icon name="return-up-back-outline"></ion-icon>
      </div>
      <ion-label>
        <h2>Jump back in</h2>
        <p>{{ screenLabel() }} · {{ summary().roomCode }}</p>
      </ion-label>
    </ion-item>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      ion-item {
        --inner-padding-top: 12px;
        --inner-padding-bottom: 12px;
        --padding-start: 16px;
        /* Wrapped ion-item is :last-child of its host element, so
           Ionic's shadow ':host(:not(:last-child))' rule misses and
           the row's bottom separator is suppressed. Force it on with
           !important to beat the shadow ':host' specificity. */
        --inner-border-width: 0 0 1px 0 !important;
      }
      ion-item h2 {
        font-size: 17px;
        font-weight: 600;
        color: var(--ion-text-color);
        margin: 0 0 2px;
      }
      ion-item p {
        font-size: 14px;
        color: var(--ion-color-step-600);
        margin: 0;
      }
      .icon-tile {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-inline-end: 12px;
      }
      .icon-tile--accent {
        background: var(--ion-color-primary);
        color: var(--ion-color-primary-contrast);
      }
      .icon-tile ion-icon {
        font-size: 20px;
      }
      ion-item.stale {
        opacity: 0.6;
      }
    `,
  ],
})
export class JumpBackInBannerComponent {
  readonly summary = input.required<JumpBackInSummary>()

  /**
   * True when the session is stale (relay reported unknown-room).
   * Row renders dimmed; tapping it clears the entry.
   */
  readonly stale = input<boolean>(false)

  /**
   * While `true` the row is `disabled` so repeated taps can't stack
   * up a queue of `resumeRequested` events. The parent (`HomePage`)
   * toggles this for the duration of its `onResumeJumpBack` handler.
   */
  readonly resuming = input<boolean>(false)

  readonly resumeRequested = output<void>()

  /** Human-readable copy for the screen the rejoin will land on. */
  protected readonly screenLabel = computed(() => screenCopy(this.summary().lastScreen))

  constructor() {
    addIcons({
      'return-up-back-outline': returnUpBackOutline,
    })
  }

  protected onTap(): void {
    if (this.resuming() && !this.stale()) return
    this.resumeRequested.emit()
  }
}

function screenCopy(screen: LastSessionScreen): string {
  switch (screen) {
    case 'lobby':
      return 'In the lobby'
    case 'estimating':
      return 'Estimating now'
  }
}
