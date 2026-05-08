import { Injectable, inject } from '@angular/core';
import { ActionSheetController } from '@ionic/angular/standalone';

/**
 * A single item in an action menu.
 */
export interface ActionMenuItem {
  /** Stable identifier returned when the user selects this item. */
  id: string;
  /** Display label. */
  label: string;
  /** Destructive items render in danger color; cancel dismisses the sheet. */
  role?: 'destructive' | 'cancel';
  /** Optional Ionicon name shown alongside the label. */
  icon?: string;
}

/**
 * ActionMenuService — thin wrapper around `ActionSheetController` that
 * exposes a type-safe `open()` method returning the selected item's `id`
 * (or `null` when the sheet is cancelled / dismissed without selection).
 *
 * Provided in root so every page / component shares one instance.
 */
@Injectable({ providedIn: 'root' })
export class ActionMenuService {
  private readonly actionSheetCtrl = inject(ActionSheetController);

  /**
   * Opens an action sheet with the given items.
   *
   * @param items  List of menu items to display.
   * @param opts   Optional header text.
   * @returns      The selected item's `id`, or `null` if cancelled / dismissed.
   */
  async open(items: ActionMenuItem[], opts?: { header?: string }): Promise<string | null> {
    const sheet = await this.actionSheetCtrl.create({
      ...(opts?.header !== undefined && { header: opts.header }),
      buttons: items.map((item) => ({
        text: item.label,
        ...(item.role !== undefined && { role: item.role }),
        ...(item.icon !== undefined && { icon: item.icon }),
        data: item.id,
      })),
    });

    await sheet.present();
    const { data, role } = await sheet.onWillDismiss<string>();

    // role === 'cancel' or role === 'backdrop' means no selection
    if (role === 'cancel' || role === 'backdrop' || data === undefined) {
      return null;
    }
    return data;
  }
}
