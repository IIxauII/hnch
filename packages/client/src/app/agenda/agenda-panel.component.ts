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
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowDownOutline,
  arrowUpOutline,
  checkmarkCircleOutline,
  ellipsisHorizontal,
  pencilOutline,
  playSkipForwardOutline,
  trashOutline,
} from 'ionicons/icons';

import { SurfaceService } from '../core/surface.service';
import type { MenuItem } from '../shared/menu-popover/menu-popover.component';

/**
 * How an item's state is spoken. A story is `consumed` once its round has
 * ended, and a round that was skipped ends too (ADR-0045) — so the word is
 * "done", not "estimated".
 */
const STATE_WORD: Record<AgendaItem['state'], string> = {
  pending: '',
  consumed: 'done',
  skipped: 'skipped',
  cancelled: 'removed',
};

/**
 * AgendaPanelComponent — the ordered list of stories queued for estimation
 * (ADR-0042, ADR-0045).
 *
 * One layout on every surface: the list, then "Add story". Everyone sees the
 * list; only the host gets the controls. A pending story's actions live
 * behind a single ⋯ button (action sheet on touch, popover with a pointer)
 * rather than five icon buttons per row, which did not fit a phone and gave
 * no hint what each glyph did.
 *
 * Emits actions to parent rather than calling DocService directly,
 * keeping the component easily testable.
 */
@Component({
  selector: 'app-agenda-panel',
  imports: [IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="agenda-panel">
      @if (visibleItems().length === 0) {
        <p class="empty-state agenda-empty">
          {{
            isHost()
              ? 'Queue the stories you plan to estimate. Each round picks up the next one.'
              : 'No stories queued yet.'
          }}
        </p>
      } @else {
        <ion-list lines="none" class="agenda-list" aria-label="Stories">
          @for (item of visibleItems(); track item.id; let i = $index) {
            <ion-item
              class="agenda-item"
              [class.agenda-item--pending]="item.state === 'pending'"
              [class.agenda-item--consumed]="item.state === 'consumed'"
              [class.agenda-item--skipped]="item.state === 'skipped'"
              [class.agenda-item--cancelled]="item.state === 'cancelled'"
            >
              <div slot="start" class="state-badge-wrapper" aria-hidden="true">
                @switch (item.state) {
                  @case ('pending') {
                    <span class="state-dot state-dot--pending"></span>
                  }
                  @case ('consumed') {
                    <ion-icon name="checkmark-circle-outline" class="state-icon state-icon--consumed" />
                  }
                  @case ('skipped') {
                    <ion-icon name="play-skip-forward-outline" class="state-icon" />
                  }
                  @case ('cancelled') {
                    <ion-icon name="trash-outline" class="state-icon" />
                  }
                }
              </div>

              <ion-label class="item-label">
                <span class="item-title">
                  {{ itemDisplayTitle(item) }}
                  @if (stateWord(item); as word) {
                    <!-- The state is an icon on screen; this is its text. -->
                    <span class="visually-hidden">, {{ word }}</span>
                  }
                </span>
                <span class="item-tags">
                  @if (i === pendingStartIndex()) {
                    <ion-badge class="next-badge">Next</ion-badge>
                  }
                  @if (item.ticketId && item.title) {
                    <ion-badge class="ticket-badge" color="medium" aria-label="Ticket {{ item.ticketId }}">{{ item.ticketId }}</ion-badge>
                  }
                </span>
                @if (item.description) {
                  <p class="item-description">{{ item.description }}</p>
                }
              </ion-label>

              @if (isHost() && item.state === 'pending') {
                <ion-button
                  slot="end"
                  fill="clear"
                  class="item-menu-btn"
                  [attr.aria-label]="'Actions for ' + itemDisplayTitle(item)"
                  (click)="openItemMenu(item, i, $event)"
                >
                  <ion-icon name="ellipsis-horizontal" slot="icon-only" aria-hidden="true" />
                </ion-button>
              }
            </ion-item>
          }
        </ion-list>
      }

      @if (isHost() || hasCancelled()) {
        <div class="agenda-footer">
          @if (isHost()) {
            <ion-button
              fill="clear"
              size="small"
              class="add-btn"
              (click)="addRequested.emit()"
            >
              <ion-icon name="add-outline" slot="start" aria-hidden="true" />
              Add story
            </ion-button>
          }
          @if (hasCancelled()) {
            <ion-button
              fill="clear"
              size="small"
              color="medium"
              class="show-cancelled-btn"
              (click)="showCancelled.set(!showCancelled())"
              [attr.aria-pressed]="showCancelled()"
            >
              {{ showCancelled() ? 'Hide removed' : 'Show removed' }}
            </ion-button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .agenda-empty {
        padding-block: 0 4px;
      }
      .agenda-list {
        margin: 0;
        padding: 0;
        background: transparent;
      }
      ion-item.agenda-item {
        --background: transparent;
        --inner-padding-end: 0;
        --min-height: 48px;
        --padding-start: 0;
      }
      ion-item.agenda-item + ion-item.agenda-item {
        border-top: 0.55px solid var(--hnch-sep);
      }
      .state-badge-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.25rem;
        margin-inline-end: 12px;
      }
      .state-dot {
        display: inline-block;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
      }
      .state-dot--pending {
        background: var(--hnch-accent-text);
      }
      .state-icon {
        color: var(--hnch-muted);
        font-size: 1.125rem;
      }
      .state-icon--consumed {
        color: var(--hnch-success-text);
      }
      .item-label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-block: 10px;
        white-space: normal;
      }
      .item-title {
        color: var(--hnch-text);
        font-size: 1rem;
        line-height: 1.3;
        overflow-wrap: anywhere;
      }
      .item-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .item-tags:empty {
        display: none;
      }
      .ticket-badge,
      .next-badge {
        padding: 3px 6px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
      }
      .ticket-badge {
        font-family: ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, Consolas, monospace;
      }
      .next-badge {
        --background: rgba(var(--hnch-accent-text-rgb), 0.16);
        --color: var(--hnch-accent-text);
      }
      .item-description {
        display: -webkit-box;
        margin: 0;
        overflow: hidden;
        color: var(--hnch-muted);
        font-size: 0.875rem;
        line-height: 1.35;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
      }
      /* Dots at the row's edge, 44px target reaching inwards — as in the roster. */
      .item-menu-btn {
        --color: var(--hnch-muted);
        --padding-end: 0;
        --padding-start: 20px;
        min-width: 44px;
        min-height: 44px;
        margin: 0;
      }
      .agenda-item--consumed .item-title,
      .agenda-item--skipped .item-title,
      .agenda-item--cancelled .item-title {
        color: var(--hnch-muted);
      }
      .agenda-item--skipped .item-title,
      .agenda-item--cancelled .item-title {
        text-decoration: line-through;
      }
      .agenda-footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
        margin: 4px -8px -8px;
      }
      .agenda-footer ion-button {
        margin: 0;
        font-size: 0.9375rem;
      }
    `,
  ],
})
export class AgendaPanelComponent {
  private readonly surface = inject(SurfaceService);

  /** Full agenda list (all states), sorted by sortKey. */
  readonly items = input.required<readonly AgendaItem[]>();

  /** Whether this client is the host. */
  readonly isHost = input<boolean>(false);

  /** Fires when host taps Add story. */
  readonly addRequested = output<void>();

  /** Fires when host picks Edit on an item. */
  readonly editRequested = output<AgendaItem>();

  /** Fires when host picks Skip on an item. */
  readonly skipRequested = output<string>();

  /** Fires when host picks Remove on an item. */
  readonly cancelRequested = output<string>();

  /** Fires when host picks Move up on an item. */
  readonly reorderUpRequested = output<string>();

  /** Fires when host picks Move down on an item. */
  readonly reorderDownRequested = output<string>();

  /** Whether to show removed (cancelled) items. */
  protected readonly showCancelled = signal(false);

  protected readonly hasCancelled = computed(() =>
    this.items().some((i) => i.state === 'cancelled'),
  );

  /** Items to render: exclude cancelled unless toggle is on. */
  protected readonly visibleItems = computed(() => {
    const show = this.showCancelled();
    return this.items().filter((i) => show || i.state !== 'cancelled');
  });

  /** Index of first pending item in visibleItems — the story the next round picks up. */
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

  /**
   * What the story is listed as. The form asks for a title or a ticket ID,
   * but the doc is written by every client: one with neither is named the
   * way a round without a title is.
   */
  protected itemDisplayTitle(item: AgendaItem): string {
    return item.title ?? item.ticketId ?? 'Untitled story';
  }

  /** The item's state in a word, or the empty string while it is pending. */
  protected stateWord(item: AgendaItem): string {
    return STATE_WORD[item.state];
  }

  /**
   * The actions for one pending story. Move up / Move down only appear when
   * there is somewhere to move to, so the menu never offers a no-op.
   */
  protected menuFor(item: AgendaItem, index: number): MenuItem[] {
    const items: MenuItem[] = [];
    if (index > this.pendingStartIndex()) {
      items.push({
        text: 'Move up',
        icon: 'arrow-up-outline',
        handler: () => this.reorderUpRequested.emit(item.id),
      });
    }
    if (index < this.pendingEndIndex()) {
      items.push({
        text: 'Move down',
        icon: 'arrow-down-outline',
        handler: () => this.reorderDownRequested.emit(item.id),
      });
    }
    items.push(
      {
        text: 'Edit',
        icon: 'pencil-outline',
        handler: () => this.editRequested.emit(item),
      },
      {
        text: 'Skip',
        icon: 'play-skip-forward-outline',
        handler: () => this.skipRequested.emit(item.id),
      },
      {
        text: 'Remove',
        icon: 'trash-outline',
        role: 'destructive',
        handler: () => this.cancelRequested.emit(item.id),
      },
      { text: 'Cancel', role: 'cancel' },
    );
    return items;
  }

  protected async openItemMenu(item: AgendaItem, index: number, event: Event): Promise<void> {
    await this.surface.openSheetOrPopover({
      header: this.itemDisplayTitle(item),
      items: this.menuFor(item, index),
      triggerEvent: event,
    });
  }

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'arrow-down-outline': arrowDownOutline,
      'arrow-up-outline': arrowUpOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'ellipsis-horizontal': ellipsisHorizontal,
      'pencil-outline': pencilOutline,
      'play-skip-forward-outline': playSkipForwardOutline,
      'trash-outline': trashOutline,
    });
  }
}
