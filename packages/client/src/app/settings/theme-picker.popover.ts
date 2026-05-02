import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core'
import type { Theme } from '../core/theme.service'
import {
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonRadio,
  IonRadioGroup,
} from '@ionic/angular/standalone'

/**
 * Theme picker popover — three radio options (System / Light / Dark).
 *
 * Designed for use inside `<ion-popover [dismissOnSelect]="true">`.
 * Emits `selected` on radio change; parent handles ThemeService call.
 */
@Component({
  selector: 'app-theme-picker-popover',
  imports: [
    IonContent,
    IonItem,
    IonLabel,
    IonList,
    IonRadio,
    IonRadioGroup,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content>
      <ion-list lines="inset">
        <ion-radio-group
          [value]="currentTheme()"
          (ionChange)="onChange($event.detail.value)"
        >
          @for (option of options; track option.value) {
            <ion-item>
              <ion-radio [value]="option.value" justify="space-between">
                <ion-label>{{ option.label }}</ion-label>
              </ion-radio>
            </ion-item>
          }
        </ion-radio-group>
      </ion-list>
    </ion-content>
  `,
})
export class ThemePickerPopoverComponent {
  /** Current theme — drives the selected radio. */
  readonly currentTheme = input.required<Theme>()

  /** Emits the newly-selected theme. */
  readonly selected = output<Theme>()

  protected readonly options: readonly { value: Theme; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]

  protected onChange(value: string | null | undefined): void {
    if (!value) return
    if (value === this.currentTheme()) return
    if (value === 'system' || value === 'light' || value === 'dark') {
      this.selected.emit(value)
    }
  }
}
