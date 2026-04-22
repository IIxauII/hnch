import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core'
import type { Theme } from '../core/theme.service'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonRadio,
  IonRadioGroup,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

/**
 * Theme picker half-sheet — three radio options (System / Light / Dark).
 *
 * Follows the scale-picker pattern: emits on selection, no Save button.
 * The parent (Settings page) is responsible for calling ThemeService.
 */
@Component({
  selector: 'app-theme-picker-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonRadio,
    IonRadioGroup,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Theme</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="closeRequested.emit()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-top">
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
export class ThemePickerSheetComponent {
  /** Current theme — drives the selected radio. */
  readonly currentTheme = input.required<Theme>()

  /** Emits the newly-selected theme. */
  readonly selected = output<Theme>()

  /** Emits when the user taps "Done". */
  readonly closeRequested = output<void>()

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
