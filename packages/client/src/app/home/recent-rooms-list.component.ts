import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatRoomCode } from '@hnch/shared';
import {
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { returnUpBackOutline, trashOutline } from 'ionicons/icons';

import { SurfaceService } from '../core/surface.service';
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
 * Recent rooms list — renders up to 5 room history entries as swipeable
 * rows (ADR-0044). Used on Home when `entries.length >= 2`; replaced by
 * JumpBackInBanner for single-entry case.
 *
 * Outputs:
 *   - `joinRequested` — emitted with the entry when a row is tapped.
 *   - `removeRequested` — emitted with the roomUuid when swipe-Remove or
 *     × button is activated.
 *
 * Mobile: swipe-left reveals Ionic IonItemOption "Remove" button.
 * Portal/web: a × button is shown on `:hover` / `:focus-within`.
 */
@Component({
  selector: 'app-recent-rooms-list',
  standalone: true,
  imports: [IonList, IonItemSliding, IonItem, IonItemOptions, IonItemOption, IonLabel, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-list inset="true" class="recent-rooms" aria-label="Recent rooms">
      @for (entry of entries(); track entry.roomUuid) {
        <ion-item-sliding>
          <ion-item
            button="true"
            detail="true"
            class="recent-room-row"
            [attr.aria-label]="'Rejoin room ' + entry.roomCode"
            (click)="onJoin(entry)"
          >
            <div class="icon-tile icon-tile--accent" slot="start" aria-hidden="true">
              <ion-icon name="return-up-back-outline"></ion-icon>
            </div>
            <ion-label>
              <h2>{{ displayCode(entry.roomCode) }}</h2>
              <p>{{ relativeTime(entry.lastSeenAt) }}</p>
            </ion-label>
            @if (!isMobile()) {
              <button
                class="remove-btn"
                slot="end"
                [attr.aria-label]="'Remove room ' + entry.roomCode + ' from history'"
                (click)="onRemove($event, entry.roomUuid)"
              >
                <ion-icon name="trash-outline" aria-hidden="true"></ion-icon>
              </button>
            }
          </ion-item>
          @if (isMobile()) {
            <ion-item-options side="end">
              <ion-item-option
                color="danger"
                [attr.aria-label]="'Remove room ' + entry.roomCode"
                (click)="onRemove($event, entry.roomUuid)"
              >
                Remove
              </ion-item-option>
            </ion-item-options>
          }
        </ion-item-sliding>
      }
    </ion-list>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      ion-list.recent-rooms {
        background: transparent;
        margin-block-start: 8px;
      }
      ion-item.recent-room-row {
        --inner-padding-top: 12px;
        --inner-padding-bottom: 12px;
        --padding-start: 16px;
      }
      ion-item h2 {
        font-size: 17px;
        font-weight: 600;
        color: var(--hnch-text);
        margin: 0 0 2px;
      }
      ion-item p {
        font-size: 14px;
        color: var(--hnch-muted);
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
        background: var(--hnch-accent);
        color: var(--hnch-accent-ink);
      }
      .icon-tile ion-icon {
        font-size: 20px;
      }
      /* × remove button — portal/web only, hidden by default */
      .remove-btn {
        display: none;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 8px;
        color: var(--hnch-muted);
        font-size: 18px;
      }
      ion-item:hover .remove-btn,
      ion-item:focus-within .remove-btn {
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `,
  ],
})
export class RecentRoomsListComponent {
  private readonly surface = inject(SurfaceService);

  readonly entries = input.required<ClientLastSessionEntry[]>();

  readonly joinRequested = output<ClientLastSessionEntry>();
  readonly removeRequested = output<string>();

  protected readonly isMobile = computed(() => this.surface.mode() === 'mobile');

  constructor() {
    addIcons({ 'return-up-back-outline': returnUpBackOutline, 'trash-outline': trashOutline });
  }

  protected displayCode(roomCode: string): string {
    return formatRoomCode(roomCode);
  }

  protected relativeTime(lastSeenAt: number): string {
    return formatRelativeTime(lastSeenAt, Date.now());
  }

  protected onJoin(entry: ClientLastSessionEntry): void {
    this.joinRequested.emit(entry);
  }

  protected onRemove(event: Event, roomUuid: string): void {
    event.stopPropagation();
    this.removeRequested.emit(roomUuid);
  }
}
