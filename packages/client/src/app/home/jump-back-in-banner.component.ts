import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { IonButton, IonIcon } from '@ionic/angular/standalone'
import { addIcons } from 'ionicons'
import { returnUpBackOutline, arrowForwardOutline } from 'ionicons/icons'

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
  imports: [IonButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="card"
      [class.stale]="stale()"
      role="button"
      tabindex="0"
      (click)="onTap()"
      (keydown.enter)="onTap()"
      (keydown.space)="onTap()"
    >
      <div class="top">
        <ion-icon
          class="badge"
          name="return-up-back-outline"
          aria-hidden="true"
        ></ion-icon>
        <span class="label">Jump back in</span>
        <span class="spacer"></span>
        <span class="code">{{ summary().roomCode }}</span>
      </div>
      <div class="body">
        <strong>{{ screenLabel() }}</strong>
        <span class="meta">Room {{ summary().roomCode }}</span>
      </div>
      <div class="bottom">
        <span class="spacer"></span>
        <ion-button
          size="default"
          [disabled]="resuming() && !stale()"
          (click)="onResume($event)"
        >
          Resume
          <ion-icon slot="end" name="arrow-forward-outline" aria-hidden="true"></ion-icon>
        </ion-button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-block-end: 20px;
      }
      .card {
        background: var(--hnch-surface);
        border-radius: 16px;
        padding: 16px;
        border: 0.5px solid var(--hnch-sep);
        display: flex;
        flex-direction: column;
        gap: 12px;
        cursor: pointer;
        transition: opacity 0.15s ease;
      }
      .card.stale {
        opacity: 0.6;
      }
      .top {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .badge {
        font-size: 14px;
        color: var(--hnch-accent);
      }
      .label {
        font-size: 13px;
        font-weight: 600;
        color: var(--hnch-accent);
        letter-spacing: 0.2px;
      }
      .spacer {
        flex: 1;
      }
      .code {
        font-family: 'SF Mono', 'Fira Mono', 'Roboto Mono', monospace;
        font-size: 12px;
        color: var(--hnch-muted);
        letter-spacing: 1px;
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .body strong {
        font-size: 18px;
        font-weight: 600;
        color: var(--hnch-text);
        line-height: 1.2;
      }
      .meta {
        font-size: 14px;
        color: var(--hnch-muted);
      }
      .bottom {
        display: flex;
        align-items: center;
        margin-block-start: 4px;
      }
      ion-button {
        --border-radius: 999px;
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

  constructor() {
    addIcons({
      'return-up-back-outline': returnUpBackOutline,
      'arrow-forward-outline': arrowForwardOutline,
    })
  }

  protected onTap(): void {
    if (this.resuming() && !this.stale()) return
    this.resumeRequested.emit()
  }

  protected onResume(event: Event): void {
    event.stopPropagation()
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
