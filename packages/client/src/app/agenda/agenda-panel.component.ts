import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { AgendaItem } from '@hnch/shared';
import {
  IonBadge,
  IonButton,
  IonChip,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowDownOutline,
  arrowUpOutline,
  banOutline,
  checkmarkCircleOutline,
  chevronForwardOutline,
  createOutline,
  ellipsisHorizontalOutline,
  pencilOutline,
  skipForwardOutline,
} from 'ionicons/icons';

import { SurfaceService } from '../core/surface.service';

/**
 * AgendaPanelComponent — ordered list of agenda items (ADR-0042).
 *
 * Desktop: always-expanded list with host-only edit controls.
 * Mobile: collapsed "Next up: {title}" chip; tap expands to inline list.
 *
 * Visibility: all participants see the list.
 * Edit controls: visible only when `isHost` is true.
 *
 * Emits actions to parent rather than calling DocService directly,
 * keeping the component easily testable.
 */
@Component({
  selector: 'app-agenda-panel',
  imports: [IonBadge, IonButton, IonChip, IonIcon, IonItem, IonLabel, IonList, IonNote],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (surface.mode() === 'mobile' && !expanded()) {
      <!-- Mobile collapsed: "Next up" chip -->
      <div class="next-up-bar">
        @if (nextItem()) {
          <ion-chip
            class="next-up-chip"
            color="primary"
            (click)="expanded.set(true)"
            [attr.aria-label]="'Agenda: Next up ' + nextItemLabel() + '. Tap to expand.'"
            role="button"
            tabindex="0"
            (keydown.enter)="expanded.set(true)"
            (keydown.space)="expanded.set(true)"
          >
            <ion-icon name="chevron-forward-outline" aria-hidden="true" />
            <ion-label>Next up: {{ nextItemLabel() }}</ion-label>
          </ion-chip>
        } @else if (pendingCount() === 0 && items().length > 0) {
          <ion-chip
            class="next-up-chip"
            color="medium"
            (click)="expanded.set(true)"
            aria-label="Agenda complete. Tap to view."
            role="button"
            tabindex="0"
            (keydown.enter)="expanded.set(true)"
            (keydown.space)="expanded.set(true)"
          >
            <ion-icon name="checkmark-circle-outline" aria-hidden="true" />
            <ion-label>Agenda complete</ion-label>
          </ion-chip>
        } @else if (isHost()) {
          <ion-chip
            class="next-up-chip"
            color="medium"
            (click)="addRequested.emit()"
            aria-label="No agenda items. Tap to add."
            role="button"
            tabindex="0"
          >
            <ion-icon name="add-outline" aria-hidden="true" />
            <ion-label>Add agenda</ion-label>
          </ion-chip>
        }
      </div>
    } @else {
      <!-- Expanded list (always on desktop; toggled on mobile) -->
      <section
        class="agenda-panel"
        aria-label="Agenda"
      >
        <div class="agenda-header">
          <h3 class="agenda-heading">Agenda</h3>
          <div class="agenda-header-actions">
            @if (surface.mode() === 'mobile') {
              <ion-button
                fill="clear"
                size="small"
                (click)="expanded.set(false)"
                aria-label="Collapse agenda"
              >
                <ion-icon name="chevron-forward-outline" slot="icon-only" class="collapse-icon" aria-hidden="true" />
              </ion-button>
            }
            @if (isHost()) {
              <ion-button
                fill="clear"
                size="small"
                color="primary"
                (click)="addRequested.emit()"
                aria-label="Add agenda item"
              >
                <ion-icon name="add-outline" slot="icon-only" aria-hidden="true" />
              </ion-button>
            }
          </div>
        </div>

        @if (visibleItems().length === 0) {
          <p class="agenda-empty">
            {{ isHost() ? 'No agenda items. Tap + to add.' : 'No agenda items.' }}
          </p>
        } @else {
          <ion-list lines="inset" class="agenda-list" aria-label="Agenda items">
            @for (item of visibleItems(); track item.id; let i = $index) {
              <ion-item
                class="agenda-item"
                [class.agenda-item--consumed]="item.state === 'consumed'"
                [class.agenda-item--skipped]="item.state === 'skipped'"
                [class.agenda-item--cancelled]="item.state === 'cancelled'"
                [attr.aria-label]="itemAriaLabel(item)"
              >
                <div slot="start" class="state-badge-wrapper" aria-hidden="true">
                  @switch (item.state) {
                    @case ('pending') {
                      <span class="state-dot state-dot--pending" aria-hidden="true"></span>
                    }
                    @case ('consumed') {
                      <ion-icon name="checkmark-circle-outline" class="state-icon state-icon--consumed" aria-hidden="true" />
                    }
                    @case ('skipped') {
                      <ion-icon name="skip-forward-outline" class="state-icon state-icon--skipped" aria-hidden="true" />
                    }
                    @case ('cancelled') {
                      <ion-icon name="ban-outline" class="state-icon state-icon--cancelled" aria-hidden="true" />
                    }
                  }
                </div>

                <ion-label class="item-label">
                  <span class="item-title">{{ itemDisplayTitle(item) }}</span>
                  @if (item.ticketId && item.title) {
                    <ion-badge class="ticket-badge" color="medium" aria-label="Ticket {{ item.ticketId }}">{{ item.ticketId }}</ion-badge>
                  }
                  @if (item.description) {
                    <p class="item-description">{{ item.description }}</p>
                  }
                </ion-label>

                @if (isHost() && item.state === 'pending') {
                  <div slot="end" class="item-actions" aria-label="Actions for {{ itemDisplayTitle(item) }}">
                    @if (i > pendingStartIndex()) {
                      <ion-button
                        fill="clear"
                        size="small"
                        (click)="reorderUpRequested.emit(item.id)"
                        [attr.aria-label]="'Move ' + itemDisplayTitle(item) + ' up'"
                      >
                        <ion-icon name="arrow-up-outline" slot="icon-only" aria-hidden="true" />
                      </ion-button>
                    }
                    @if (i < pendingEndIndex()) {
                      <ion-button
                        fill="clear"
                        size="small"
                        (click)="reorderDownRequested.emit(item.id)"
                        [attr.aria-label]="'Move ' + itemDisplayTitle(item) + ' down'"
                      >
                        <ion-icon name="arrow-down-outline" slot="icon-only" aria-hidden="true" />
                      </ion-button>
                    }
                    <ion-button
                      fill="clear"
                      size="small"
                      (click)="editRequested.emit(item)"
                      [attr.aria-label]="'Edit ' + itemDisplayTitle(item)"
                    >
                      <ion-icon name="pencil-outline" slot="icon-only" aria-hidden="true" />
                    </ion-button>
                    <ion-button
                      fill="clear"
                      size="small"
                      (click)="skipRequested.emit(item.id)"
                      [attr.aria-label]="'Skip ' + itemDisplayTitle(item)"
                    >
                      <ion-icon name="skip-forward-outline" slot="icon-only" aria-hidden="true" />
                    </ion-button>
                    <ion-button
                      fill="clear"
                      size="small"
                      color="danger"
                      (click)="cancelRequested.emit(item.id)"
                      [attr.aria-label]="'Cancel ' + itemDisplayTitle(item)"
                    >
                      <ion-icon name="ban-outline" slot="icon-only" aria-hidden="true" />
                    </ion-button>
                  </div>
                }
              </ion-item>
            }
          </ion-list>
        }

        @if (hasCancelled()) {
          <ion-button
            fill="clear"
            size="small"
            class="show-cancelled-btn"
            (click)="showCancelled.set(!showCancelled())"
            [attr.aria-label]="showCancelled() ? 'Hide cancelled items' : 'Show cancelled items'"
            [attr.aria-pressed]="showCancelled()"
          >
            {{ showCancelled() ? 'Hide cancelled' : 'Show cancelled' }}
          </ion-button>
        }
      </section>
    }
  `,
  styles: [
    `
      .next-up-bar {
        padding: 0.25rem 0;
      }
      .next-up-chip {
        cursor: pointer;
      }
      .agenda-panel {
        margin-top: 1rem;
        margin-bottom: 0.5rem;
      }
      .agenda-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.25rem;
      }
      .agenda-heading {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--ion-color-medium);
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .agenda-header-actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .collapse-icon {
        transform: rotate(90deg);
      }
      .agenda-empty {
        font-size: 0.875rem;
        color: var(--ion-color-medium);
        padding: 0.5rem 0;
        margin: 0;
        font-style: italic;
      }
      .agenda-list {
        margin: 0;
      }
      .state-badge-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
      }
      .state-dot {
        display: inline-block;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
      }
      .state-dot--pending {
        background: var(--ion-color-primary);
      }
      .state-icon {
        font-size: 1rem;
      }
      .state-icon--consumed {
        color: var(--ion-color-success);
      }
      .state-icon--skipped {
        color: var(--ion-color-medium);
      }
      .state-icon--cancelled {
        color: var(--ion-color-danger);
        opacity: 0.6;
      }
      .item-label {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .item-title {
        font-size: 0.9rem;
      }
      .ticket-badge {
        font-size: 0.7rem;
        padding: 2px 6px;
        border-radius: 4px;
        width: fit-content;
      }
      .item-description {
        font-size: 0.8rem;
        color: var(--ion-color-medium);
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 20ch;
      }
      .item-actions {
        display: flex;
        align-items: center;
      }
      .agenda-item--consumed ion-label {
        opacity: 0.65;
      }
      .agenda-item--skipped ion-label {
        opacity: 0.5;
        text-decoration: line-through;
      }
      .agenda-item--cancelled ion-label {
        opacity: 0.4;
        text-decoration: line-through;
      }
      .show-cancelled-btn {
        margin-top: 0.25rem;
      }
    `,
  ],
})
export class AgendaPanelComponent {
  protected readonly surface = inject(SurfaceService);

  /** Full agenda list (all states), sorted by sortKey. */
  readonly items = input.required<readonly AgendaItem[]>();

  /** Whether this client is the host. */
  readonly isHost = input<boolean>(false);

  /** Fires when host taps Add. */
  readonly addRequested = output<void>();

  /** Fires when host taps pencil on an item. */
  readonly editRequested = output<AgendaItem>();

  /** Fires when host taps Skip on an item. */
  readonly skipRequested = output<string>();

  /** Fires when host taps Cancel on an item. */
  readonly cancelRequested = output<string>();

  /** Fires when host taps ↑ on an item. */
  readonly reorderUpRequested = output<string>();

  /** Fires when host taps ↓ on an item. */
  readonly reorderDownRequested = output<string>();

  /** Mobile expand/collapse state. Desktop always shows. */
  protected readonly expanded = signal(false);

  /** Whether to show cancelled items. */
  protected readonly showCancelled = signal(false);

  /** First pending agenda item. */
  protected readonly nextItem = computed(() => {
    for (const item of this.items()) {
      if (item.state === 'pending') return item;
    }
    return null;
  });

  protected readonly nextItemLabel = computed(() => {
    const item = this.nextItem();
    if (!item) return '';
    return item.title ?? item.ticketId ?? '';
  });

  protected readonly pendingCount = computed(
    () => this.items().filter((i) => i.state === 'pending').length,
  );

  protected readonly hasCancelled = computed(() =>
    this.items().some((i) => i.state === 'cancelled'),
  );

  /** Items to render: exclude cancelled unless toggle is on. */
  protected readonly visibleItems = computed(() => {
    const show = this.showCancelled();
    return this.items().filter((i) => show || i.state !== 'cancelled');
  });

  /** Index of first pending item in visibleItems (for reorder boundary). */
  protected readonly pendingStartIndex = computed(() => {
    const items = this.visibleItems();
    for (let i = 0; i < items.length; i++) {
      if (items[i]!.state === 'pending') return i;
    }
    return -1;
  });

  /** Index of last pending item in visibleItems (for reorder boundary). */
  protected readonly pendingEndIndex = computed(() => {
    const items = this.visibleItems();
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i]!.state === 'pending') return i;
    }
    return -1;
  });

  protected itemDisplayTitle(item: AgendaItem): string {
    return item.title ?? item.ticketId ?? '(untitled)';
  }

  protected itemAriaLabel(item: AgendaItem): string {
    const title = this.itemDisplayTitle(item);
    const state = item.state === 'pending' ? '' : `, ${item.state}`;
    const ticket = item.ticketId && item.title ? `, ${item.ticketId}` : '';
    return `${title}${ticket}${state}`;
  }

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'arrow-down-outline': arrowDownOutline,
      'arrow-up-outline': arrowUpOutline,
      'ban-outline': banOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'create-outline': createOutline,
      'ellipsis-horizontal-outline': ellipsisHorizontalOutline,
      'pencil-outline': pencilOutline,
      'skip-forward-outline': skipForwardOutline,
    });
  }
}
