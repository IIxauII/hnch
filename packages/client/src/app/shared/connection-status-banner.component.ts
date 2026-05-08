import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { IonIcon, IonToast } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { syncOutline } from 'ionicons/icons';

import { DocService } from '../core/doc/doc.service';

/**
 * Inline reconnecting banner — plan §3.9 / issue #42.
 *
 * Renders a full-width warning bar inside `<ion-content>` when
 * `docService.reconnecting()` is true. On the falling edge (true →
 * false) it shows a brief "Reconnected" success toast.
 *
 * Placement: caller drops `<app-connection-status-banner />` at the
 * top of `<ion-content>` content so it scrolls with the page and
 * never overlaps the footer.
 */
@Component({
  selector: 'app-connection-status-banner',
  imports: [IonIcon, IonToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (reconnecting()) {
      <div
        class="banner"
        role="status"
        aria-live="polite"
        data-testid="connection-status-banner"
      >
        <ion-icon name="sync-outline" class="banner-icon" aria-hidden="true"></ion-icon>
        Reconnecting…
      </div>
    }

    <ion-toast
      [isOpen]="recentlyReconnected()"
      message="Reconnected"
      position="top"
      color="success"
      [duration]="1500"
    ></ion-toast>
  `,
  styles: [
    `
      .banner {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background: var(--ion-color-warning-tint);
        color: var(--ion-color-warning-contrast);
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 500;
        margin-bottom: 0.75rem;
      }
      .banner-icon {
        font-size: 1.1rem;
        flex-shrink: 0;
      }
    `,
  ],
})
export class ConnectionStatusBannerComponent {
  private readonly docService = inject(DocService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly reconnecting = this.docService.reconnecting;

  /**
   * Flipped to `true` on the falling edge of `reconnecting()` (true → false).
   * Cleared after 1500 ms so the toast dismisses naturally.
   */
  protected readonly recentlyReconnected = signal(false);

  constructor() {
    addIcons({ 'sync-outline': syncOutline });

    let clearTimer: ReturnType<typeof setTimeout> | null = null;

    // Detect falling edge (true → false) via closure-tracked `previous`.
    // Same pattern as connection-chip.component.ts:137-150.
    let previous = false;
    effect(() => {
      const current = this.reconnecting();
      if (previous && !current) {
        // Falling edge: transition from reconnecting → connected.
        if (clearTimer !== null) {
          clearTimeout(clearTimer);
          clearTimer = null;
        }
        this.recentlyReconnected.set(true);
        clearTimer = setTimeout(() => {
          this.recentlyReconnected.set(false);
          clearTimer = null;
        }, 1500);
      }
      previous = current;
    });

    this.destroyRef.onDestroy(() => {
      if (clearTimer !== null) clearTimeout(clearTimer);
    });
  }
}
