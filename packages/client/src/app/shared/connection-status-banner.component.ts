import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { IonIcon, IonToast } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { syncOutline } from 'ionicons/icons';

import { DocService } from '../core/doc/doc.service';

/** The connection states the banner tells apart. */
export type BannerSyncStatus = 'connected' | 'offline' | 'connecting' | 'disconnected';

/**
 * How long a first connection may take before the banner mentions it. A
 * connection that comes up within a second is not worth a flash of text.
 */
export const CONNECTING_BANNER_DELAY_MS = 1_000;

/**
 * True while a session is attached, its connection is not up, and it is
 * still being tried for.
 *
 * `rejected` — the relay has refused this connection for good, and the relay
 * client has stopped trying. The status stays at `disconnected`, but nothing
 * is being waited for: saying "Connecting…" would go on saying it forever.
 */
export function isWaitingForConnection(status: BannerSyncStatus, rejected = false): boolean {
  if (rejected) return false;
  return status === 'connecting' || status === 'disconnected';
}

/**
 * What the banner says, or `null` when there is nothing to say.
 *
 * A connection that was up and dropped is "Reconnecting…" straight away —
 * what is on screen may be stale and the user should know. One that has
 * never been up is "Connecting…", and only once it is taking a while. That
 * covers the pauses between attempts too (`disconnected`): to the person
 * waiting they are the same wait.
 *
 * Exported for unit testing.
 */
export function computeBannerLabel(
  reconnecting: boolean,
  status: BannerSyncStatus,
  waitingLongEnough: boolean,
  rejected = false,
): string | null {
  if (reconnecting) return 'Reconnecting…';
  if (isWaitingForConnection(status, rejected) && waitingLongEnough) return 'Connecting…';
  return null;
}

/**
 * Connection banner — plan §3.9 / issue #42. The one place the app reports
 * on its connection.
 *
 * Renders a bar at the top of `<ion-content>` while the session is not
 * connected, and stays in view when the page scrolls. On the way back
 * (reconnecting true → false) it shows a brief "Reconnected" toast.
 *
 * It replaces a second indicator, a chip in the toolbar, that said the same
 * thing five seconds later and pushed into the title on a phone.
 *
 * Placement: caller drops `<app-connection-status-banner />` first inside
 * the page's content column.
 */
@Component({
  selector: 'app-connection-status-banner',
  imports: [IonIcon, IonToast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.visible]': 'label() !== null' },
  template: `
    @if (label(); as text) {
      <div
        class="banner"
        role="status"
        aria-live="polite"
        data-testid="connection-status-banner"
      >
        <ion-icon name="sync-outline" class="banner-icon" aria-hidden="true"></ion-icon>
        {{ text }}
      </div>
    }

    <ion-toast
      [isOpen]="recentlyReconnected()"
      message="Reconnected"
      position="top"
      [duration]="1500"
    ></ion-toast>
  `,
  styles: [
    `
      :host(.visible) {
        display: block;
        position: sticky;
        top: 0;
        z-index: 10;
        margin-block-end: 12px;
      }
      /* Opaque: the page scrolls underneath it. */
      .banner {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 40px;
        padding: 8px 12px;
        border: 0.5px solid rgba(var(--ion-color-warning-rgb), 0.45);
        border-radius: 12px;
        background: var(--hnch-bg);
        background: color-mix(in srgb, var(--ion-color-warning) 18%, var(--hnch-bg));
        box-shadow: var(--hnch-shadow-1);
        color: var(--hnch-text);
        font-size: 0.9375rem;
        font-weight: 500;
      }
      .banner-icon {
        flex: 0 0 auto;
        color: var(--hnch-warning-text);
        font-size: 1.125rem;
      }
    `,
  ],
})
export class ConnectionStatusBannerComponent {
  private readonly docService = inject(DocService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly reconnecting = this.docService.reconnecting;

  /**
   * True once the connection has been down — connecting, or between two
   * attempts — continuously for {@link CONNECTING_BANNER_DELAY_MS}.
   */
  private readonly waitingLongEnough = signal(false);

  /** The relay has refused the connection; nobody is trying any more. */
  private readonly rejected = computed(() => this.docService.lastRejection() !== null);

  protected readonly label = computed<string | null>(() =>
    computeBannerLabel(
      this.reconnecting(),
      this.docService.syncStatus(),
      this.waitingLongEnough(),
      this.rejected(),
    ),
  );

  /**
   * Flipped to `true` on the falling edge of `reconnecting()` (true → false).
   * Cleared after 1500 ms so the toast dismisses naturally.
   */
  protected readonly recentlyReconnected = signal(false);

  constructor() {
    addIcons({ 'sync-outline': syncOutline });

    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    let connectingTimer: ReturnType<typeof setTimeout> | null = null;

    // Detect falling edge (true → false) via closure-tracked `previous`.
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

    // One effect owns the "connecting" delay. The clock starts when the
    // connection goes down and runs through every retry; only coming up (or
    // the session going away) stops it.
    let waiting = false;
    effect(() => {
      const nowWaiting = isWaitingForConnection(this.docService.syncStatus(), this.rejected());
      if (nowWaiting === waiting) return;
      waiting = nowWaiting;
      if (connectingTimer !== null) {
        clearTimeout(connectingTimer);
        connectingTimer = null;
      }
      if (nowWaiting) {
        connectingTimer = setTimeout(() => {
          this.waitingLongEnough.set(true);
          connectingTimer = null;
        }, CONNECTING_BANNER_DELAY_MS);
      } else {
        this.waitingLongEnough.set(false);
      }
    });

    this.destroyRef.onDestroy(() => {
      if (clearTimer !== null) clearTimeout(clearTimer);
      if (connectingTimer !== null) clearTimeout(connectingTimer);
    });
  }
}
