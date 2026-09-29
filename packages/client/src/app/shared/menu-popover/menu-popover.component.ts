import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  PopoverController,
} from '@ionic/angular/standalone';

/** Single menu item — mirrors ActionSheet button shape. */
export interface MenuItem {
  text: string;
  /**
   * 'destructive' → danger label + icon.
   * 'cancel' → omitted from popover (backdrop tap already dismisses).
   * Any other string is passed through as-is.
   */
  role?: 'destructive' | 'cancel' | string;
  /** Ionicon name (e.g. 'settings-outline'). */
  icon?: string;
  handler?: () => void | boolean | Promise<void | boolean>;
}

/**
 * Popover menu rendered by SurfaceService on desktop to replace ActionSheets.
 *
 * Receives `items` and optional `header` as componentProps from PopoverController.
 * Cancel-role items are omitted — the popover dismisses via backdrop tap.
 *
 * A destructive item is a danger-colored *label*, matching the action sheet
 * it stands in for — not a solid danger row, which reads as an alarm rather
 * than as one choice in a menu.
 *
 * All Ionic imports individual per ionic.md conventions.
 */
@Component({
  selector: 'app-menu-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonList, IonListHeader, IonItem, IonLabel, IonIcon],
  template: `
    <ion-list [inset]="false" lines="none">
      @if (header()) {
        <ion-list-header>
          <ion-label>{{ header() }}</ion-label>
        </ion-list-header>
      }
      @for (item of visibleItems(); track item.text) {
        <ion-item
          button
          [detail]="false"
          [class.destructive]="item.role === 'destructive'"
          (click)="onItemClick(item)"
          [attr.aria-label]="item.text"
        >
          @if (item.icon) {
            <ion-icon slot="start" [name]="item.icon" aria-hidden="true" />
          }
          <ion-label>{{ item.text }}</ion-label>
        </ion-item>
      }
    </ion-list>
  `,
  styles: [
    `
      ion-list {
        padding-block: 6px;
        background: transparent;
      }
      ion-item {
        --background: transparent;
        --min-height: 44px;
        font-size: 15px;
      }
      ion-item ion-icon {
        margin-inline-end: 12px;
        color: var(--hnch-muted);
        font-size: 20px;
      }
      ion-item.destructive {
        --color: var(--hnch-danger-text);
      }
      ion-item.destructive ion-icon {
        color: var(--hnch-danger-text);
      }
    `,
  ],
})
export class MenuPopoverComponent {
  readonly items = input<MenuItem[]>([]);
  readonly header = input<string | undefined>(undefined);

  readonly visibleItems = computed(() => this.items().filter((i) => i.role !== 'cancel'));

  private readonly popoverCtrl = inject(PopoverController);

  async onItemClick(item: MenuItem): Promise<void> {
    await this.popoverCtrl.dismiss();
    await item.handler?.();
  }
}
