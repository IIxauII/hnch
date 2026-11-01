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
 * Connection banner (#42). The one place the app reports
 * on its connection.
 *
 * Renders a bar at the top of `<ion-content>` while the session is not
 * connected, and stays in view when the page scrolls. Once the session has
 * been got back into it shows a brief "Reconnected" toast — not when the
 * wait ended because the relay refused the connection, or because the
 * session was left.
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
      /* Behind a check of its own: a second declaration is no fallback for
         one that holds a var() — where the mix is not understood the value
         is dropped when it is computed, and the bar would be see-through. */
      @supports (color: color-mix(in srgb, red, blue)) {
        .banner {
          background: color-mix(in srgb, var(--ion-color-warning) 18%, var(--hnch-bg));
        }
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
   * Flipped to `true` when a connection that was being made again has got
   * back into the session. Cleared after 1500 ms so the toast dismisses
   * naturally.
   */
  protected readonly recentlyReconnected = signal(false);

  constructor() {
    addIcons({ 'sync-outline': syncOutline });

    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    let connectingTimer: ReturnType<typeof setTimeout> | null = null;

    // Waiting for the connection to come back: from the moment it is being
    // made again until the session has been got back into — or the wait
    // ends some other way. That the socket is up again is not it: the relay
    // takes a socket before it turns a wrong password or a full session
    // away (ADR-0035), and only a socket it keeps is ever brought in sync.
    let awaited = false;
    effect(() => {
      const reconnecting = this.reconnecting();
      const back = this.docService.joined();
      const over = this.rejected() || this.docService.syncStatus() === 'offline';
      if (reconnecting) {
        awaited = true;
        return;
      }
      if (!awaited || over) {
        awaited = false;
        return;
      }
      if (!back) return;

      awaited = false;
      if (clearTimer !== null) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
      this.recentlyReconnected.set(true);
      clearTimer = setTimeout(() => {
        this.recentlyReconnected.set(false);
        clearTimer = null;
      }, 1500);
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
