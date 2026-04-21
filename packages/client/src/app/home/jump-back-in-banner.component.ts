import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { IonCard, IonCardContent, IonIcon } from '@ionic/angular/standalone'

/**
 * Jump-back-in banner shell per ux.md §5.2.
 *
 * Shown when the user has a non-expired backed-out session in local
 * state (relay snapshot TTL is 24h per ADR-0012). Phase 1 only ships
 * the DOM shell — no state source is wired yet; Phase 3 will populate
 * this once the session cache exists. The parent controls visibility
 * via an `@if` so the banner never renders in v1 Phase 1.
 */
export interface JumpBackInSummary {
  readonly roomCode: string
  readonly participantCount: number
  readonly currentScreen: string
  readonly expired: boolean
}

@Component({
  selector: 'app-jump-back-in-banner',
  imports: [IonCard, IonCardContent, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-card
      button
      (click)="resumeRequested.emit()"
      [class.expired]="summary().expired"
    >
      <ion-card-content>
        <div class="row">
          <ion-icon name="return-up-back-outline" aria-hidden="true"></ion-icon>
          <div class="text">
            <strong>Jump back in</strong>
            <span>
              Room {{ summary().roomCode }} •
              {{ summary().participantCount }} people
            </span>
            <span class="screen">{{ summary().currentScreen }}</span>
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
      .text {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .screen {
        color: var(--ion-color-medium);
        font-size: 0.85rem;
      }
      ion-card.expired {
        opacity: 0.55;
      }
    `,
  ],
})
export class JumpBackInBannerComponent {
  readonly summary = input.required<JumpBackInSummary>()
  readonly resumeRequested = output<void>()
}
