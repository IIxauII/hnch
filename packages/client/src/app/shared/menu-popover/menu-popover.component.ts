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
   * 'destructive' → danger color.
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
 * Standalone; all Ionic imports individual per ionic.md conventions.
 */
@Component({
  selector: 'app-menu-popover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonList, IonListHeader, IonItem, IonLabel, IonIcon],
  template: `
    <ion-list [inset]="false">
      @if (header()) {
        <ion-list-header>
          <ion-label>{{ header() }}</ion-label>
        </ion-list-header>
      }
      @for (item of visibleItems(); track item.text) {
        <ion-item
          button
          [color]="item.role === 'destructive' ? 'danger' : undefined"
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
