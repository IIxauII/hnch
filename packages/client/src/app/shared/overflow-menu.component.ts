import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core'
import {
  IonItem,
  IonLabel,
  IonList,
  PopoverController,
} from '@ionic/angular/standalone'

export interface OverflowMenuItem {
  /** Item id. Must be non-empty — empty/falsy collides with the backdrop-dismiss sentinel in onDidDismiss. */
  id: string
  label: string
  role?: 'destructive' | 'cancel'
  disabled?: boolean
}

/**
 * Shared popover-content component for ⋯ overflow menus.
 *
 * Renders an `ion-list` of `ion-item` buttons. Destructive items get
 * `color="danger"`. Disabled items suppress click emission.
 *
 * Callers:
 *   popoverController.create({
 *     component: OverflowMenuComponent,
 *     event,
 *     componentProps: { items },
 *   }).then(p => {
 *     p.onDidDismiss().then(({ data }) => { ... });
 *     return p.present();
 *   });
 */
@Component({
  selector: 'app-overflow-menu',
  standalone: true,
  imports: [IonItem, IonLabel, IonList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-list [inset]="true">
      @for (item of items; track item.id) {
        <ion-item
          button
          [color]="item.role === 'destructive' ? 'danger' : undefined"
          [disabled]="item.disabled ?? false"
          (click)="onItemClick(item)"
          [attr.aria-label]="item.label"
          [attr.aria-disabled]="item.disabled ?? false"
        >
          <ion-label>{{ item.label }}</ion-label>
        </ion-item>
      }
    </ion-list>
  `,
})
export class OverflowMenuComponent {
  @Input() items: OverflowMenuItem[] = []
  @Output() itemSelected = new EventEmitter<string>()

  private readonly popoverCtrl = inject(PopoverController)

  protected onItemClick(item: OverflowMenuItem): void {
    if (item.disabled) return
    this.itemSelected.emit(item.id)
    void this.popoverCtrl.dismiss(item.id)
  }
}
