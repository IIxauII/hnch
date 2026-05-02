import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core'
import {
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonRadio,
  IonRadioGroup,
} from '@ionic/angular/standalone'
import { type AccentKey, ACCENTS } from '../core/accent.tokens'

/**
 * Accent picker popover — radio list of 12 accent colors.
 *
 * Each row has a leading colored dot and a label.
 * Designed for use inside `<ion-popover [dismissOnSelect]="true">`.
 * Emits `selected` on radio change; parent calls AccentService.setAccent.
 */
@Component({
  selector: 'app-accent-picker-popover',
  imports: [
    IonContent,
    IonItem,
    IonLabel,
    IonList,
    IonRadio,
    IonRadioGroup,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .accent-dot {
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-inline-end: 10px;
    }

    .accent-row-label {
      display: flex;
      align-items: center;
    }
  `],
  template: `
    <ion-content>
      <ion-list lines="inset">
        <ion-radio-group
          [value]="currentAccent()"
          (ionChange)="onChange($event.detail.value)"
        >
          @for (entry of accentEntries; track entry.key) {
            <ion-item>
              <ion-radio [value]="entry.key" justify="space-between"
                         [attr.aria-label]="entry.label">
                <div class="accent-row-label">
                  <span
                    class="accent-dot"
                    [style.background]="entry.base"
                    aria-hidden="true"
                  ></span>
                  <ion-label>{{ entry.label }}</ion-label>
                </div>
              </ion-radio>
            </ion-item>
          }
        </ion-radio-group>
      </ion-list>
    </ion-content>
  `,
})
export class AccentPickerPopoverComponent {
  /** Currently selected accent key. */
  readonly currentAccent = input.required<AccentKey>()

  /** Emits the newly-selected accent key. */
  readonly selected = output<AccentKey>()

  protected readonly accentEntries = (
    Object.entries(ACCENTS) as [AccentKey, (typeof ACCENTS)[AccentKey]][]
  ).map(([key, def]) => ({ key, base: def.base, label: def.label }))

  protected onChange(value: string | null | undefined): void {
    if (!value) return
    if (value === this.currentAccent()) return
    if (value in ACCENTS) {
      this.selected.emit(value as AccentKey)
    }
  }
}
