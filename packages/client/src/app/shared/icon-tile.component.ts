import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

export type IconTileVariant = 'accent' | 'neutral' | 'soft';

/**
 * Icon-in-tile primitive.
 *
 * Variants:
 *   accent  — primary background, contrast text (36×36, r10)
 *   neutral — step-100 background, regular text (36×36, r10)
 *   soft    — translucent primary background, primary text (32×32, r9)
 *
 * aria-hidden="true" is set on the host element — callers must provide
 * accessible label context via the surrounding ion-item / ion-label.
 */
@Component({
  selector: 'app-icon-tile',
  standalone: true,
  imports: [IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <div
      class="tile"
      [class.tile--accent]="variant() === 'accent'"
      [class.tile--neutral]="variant() === 'neutral'"
      [class.tile--soft]="variant() === 'soft'"
    >
      <ion-icon [name]="icon()"></ion-icon>
    </div>
  `,
  styles: [
    `
      .tile {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-inline-end: 12px;
        /* default size for accent/neutral */
        width: 36px;
        height: 36px;
        border-radius: 10px;
      }
      .tile--accent {
        background: var(--ion-color-primary);
        color: var(--ion-color-primary-contrast);
      }
      .tile--neutral {
        background: var(--ion-background-color-step-100);
        color: var(--ion-text-color);
      }
      .tile--soft {
        width: 32px;
        height: 32px;
        border-radius: 9px;
        background: rgba(var(--ion-color-primary-rgb), 0.14);
        color: var(--ion-color-primary);
      }
      .tile ion-icon {
        font-size: 20px;
      }
      .tile--soft ion-icon {
        font-size: 18px;
      }
    `,
  ],
})
export class IconTileComponent {
  readonly icon = input.required<string>();
  readonly variant = input<IconTileVariant>('neutral');
}
