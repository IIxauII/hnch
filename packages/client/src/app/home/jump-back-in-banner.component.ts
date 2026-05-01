import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { IonCard, IonCardContent, IonIcon } from '@ionic/angular/standalone'

import type { LastSessionScreen } from '../core/last-session.service'

/**
 * Jump-back-in banner — ux.md §5.2.
 *
 * Renders when {@link LastSessionService} resolves a non-expired
 * cache entry on Home. The parent controls visibility through an
 * `@if` so this component never appears for cold-start users.
 *
 * The summary is a presentation-layer shape that mirrors the cache
 * minus the fields the banner doesn't render (`roomUuid`,
 * `lastSeenAt`).
 */
export interface JumpBackInSummary {
  /** Room code for the large body copy. */
  readonly roomCode: string
  /** Which in-session screen the rejoin will land on. */
  readonly lastScreen: LastSessionScreen
}

@Component({
  selector: 'app-jump-back-in-banner',
  imports: [IonCard, IonCardContent, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-card
      button
      [disabled]="resuming() && !stale()"
      [class.stale]="stale()"
      (click)="resumeRequested.emit()"
    >
      <ion-card-content>
        <div class="row">
          <ion-icon
            name="return-up-back-outline"
            [class.hidden]="stale()"
            aria-hidden="true"
          ></ion-icon>
          <div class="text">
            <strong>Jump back in</strong>
            <span>Room {{ summary().roomCode }}</span>
            <span class="screen">{{ screenLabel() }}</span>
          </div>
        </div>
      </ion-card-content>
    </ion-card>
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
      ion-icon.hidden {
        display: none;
      }
      .text {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .screen {
        color: var(--ion-color-medium);
        font-size: 0.85rem;
      }
      ion-card.stale {
        opacity: 0.6;
      }
    `,
  ],
})
export class JumpBackInBannerComponent {
  readonly summary = input.required<JumpBackInSummary>()

  /**
   * True when the session is stale (relay reported unknown-room).
   * Banner renders dimmed; tapping it clears the entry.
   */
  readonly stale = input<boolean>(false)

  /**
   * While `true` the card is `disabled` so repeated taps can't stack
   * up a queue of `resumeRequested` events. The parent (`HomePage`)
   * toggles this for the duration of its `onResumeJumpBack` handler.
   */
  readonly resuming = input<boolean>(false)

  readonly resumeRequested = output<void>()

  /** Human-readable copy for the screen the rejoin will land on. */
  protected readonly screenLabel = computed(() => screenCopy(this.summary().lastScreen))
}

function screenCopy(screen: LastSessionScreen): string {
  switch (screen) {
    case 'lobby':
      return 'In the lobby'
    case 'estimating':
      return 'Estimating now'
  }
}
