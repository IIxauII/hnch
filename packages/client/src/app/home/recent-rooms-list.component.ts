import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatRoomCode } from '@hnch/shared';
import { IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, returnUpBackOutline } from 'ionicons/icons';

import type { ClientLastSessionEntry } from '../core/last-session.service';

/**
 * Formats a `lastSeenAt` epoch timestamp into a short relative string
 * (e.g. "5m ago", "2h ago", "3d ago"). Exported for unit testing.
 */
export function formatRelativeTime(lastSeenAt: number, now: number): string {
  const diffMs = now - lastSeenAt;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffDay >= 1) {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    return rtf.format(-diffDay, 'day');
  }
  if (diffHr >= 1) {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always', style: 'narrow' });
    return rtf.format(-diffHr, 'hour');
  }
  if (diffMin >= 1) {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always', style: 'narrow' });
    return rtf.format(-diffMin, 'minute');
  }
  return 'just now';
}

/**
 * Recent sessions — the rooms this device can still get back into, up to 5
 * (ADR-0044). One row per session, whatever the count: a single entry is a
 * one-row list rather than a separate banner component.
 *
 * Each row is two sibling controls, not one nested in the other: the row
 * itself rejoins, the trailing × forgets the entry. The × is always visible —
 * it used to hide behind a swipe on touch and a hover on desktop.
 *
 * Outputs:
 *   - `joinRequested` — emitted with the entry when a row is tapped.
 *   - `removeRequested` — emitted with the roomUuid when × is activated.
 */
@Component({
  selector: 'app-recent-rooms-list',
  imports: [IonButton, IonIcon, IonItem, IonLabel, IonList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-list inset="true" lines="none" class="recent-rooms" aria-label="Recent sessions">
      @for (entry of entries(); track entry.roomUuid) {
        <div class="row">
          <ion-item
            button="true"
            [detail]="false"
            class="recent-room-row"
            [disabled]="busy()"
            [attr.aria-label]="'Rejoin session ' + displayCode(entry.roomCode)"
            (click)="onJoin(entry)"
          >
            <div class="icon-tile icon-tile--accent" slot="start" aria-hidden="true">
              <ion-icon name="return-up-back-outline"></ion-icon>
            </div>
            <ion-label>
              <h3>{{ displayCode(entry.roomCode) }}</h3>
              <p>Active {{ relativeTime(entry.lastSeenAt) }}</p>
            </ion-label>
          </ion-item>
          <ion-button
            fill="clear"
            class="remove-btn"
            [attr.aria-label]="'Remove session ' + displayCode(entry.roomCode) + ' from this list'"
            (click)="onRemove($event, entry.roomUuid)"
          >
            <ion-icon slot="icon-only" name="close-outline" aria-hidden="true"></ion-icon>
          </ion-button>
        </div>
      }
    </ion-list>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      ion-list.recent-rooms {
        margin-block: 0;
        padding-block: 0;
        background: var(--hnch-elev-1);
      }
      .row {
        display: flex;
        align-items: center;
      }
      .row + .row {
        border-top: 0.55px solid var(--hnch-sep);
      }
      ion-item.recent-room-row {
        --inner-padding-top: 12px;
        --inner-padding-bottom: 12px;
        --inner-padding-end: 0;
        --padding-start: 16px;
        flex: 1 1 auto;
        min-width: 0;
      }
      ion-item h3 {
        margin: 0 0 2px;
        color: var(--hnch-text);
        font-size: 17px;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        letter-spacing: 0.04em;
      }
      ion-item p {
        margin: 0;
        color: var(--hnch-muted);
        font-size: 14px;
      }
      .remove-btn {
        --color: var(--hnch-muted);
        --padding-end: 10px;
        --padding-start: 10px;
        flex: 0 0 auto;
        min-width: 44px;
        min-height: 44px;
        margin: 0 4px 0 0;
      }
    `,
  ],
})
export class RecentRoomsListComponent {
  readonly entries = input.required<ClientLastSessionEntry[]>();

  /**
   * Home is busy getting into a session — this one, another of the list, or
   * one it is creating: rows stop accepting taps until it settles.
   */
  readonly busy = input<boolean>(false);

  readonly joinRequested = output<ClientLastSessionEntry>();
  readonly removeRequested = output<string>();

  constructor() {
    addIcons({ 'close-outline': closeOutline, 'return-up-back-outline': returnUpBackOutline });
  }

  protected displayCode(roomCode: string): string {
    return formatRoomCode(roomCode);
  }

  protected relativeTime(lastSeenAt: number): string {
    return formatRelativeTime(lastSeenAt, Date.now());
  }

  protected onJoin(entry: ClientLastSessionEntry): void {
    if (this.busy()) return;
    this.joinRequested.emit(entry);
  }

  protected onRemove(event: Event, roomUuid: string): void {
    event.stopPropagation();
    this.removeRequested.emit(roomUuid);
  }
}
