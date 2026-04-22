import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core'
import { BUILTIN_SCALES, type Scale } from '@hnch/shared'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRadio,
  IonRadioGroup,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

/**
 * Scale picker half-sheet — ux.md §5.8.
 *
 * Radio group over the v1 builtin scales (Fibonacci, T-shirt). The
 * iOS idiom is "commit on selection": there's no Save button, and the
 * parent sheet is expected to dismiss the modal itself once the change
 * is applied. We emit `selected` and let the container decide.
 *
 * Custom scales (ux.md §5.8's "Custom" row) are Phase 6 and are
 * deliberately not surfaced here — adding them now would create a
 * picker affordance we can't actually wire.
 */
@Component({
  selector: 'app-scale-picker-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonRadio,
    IonRadioGroup,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Scale</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="closeRequested.emit()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-top">
      <ion-list lines="inset">
        <ion-radio-group
          [value]="currentValue()"
          (ionChange)="onChange($event.detail.value)"
        >
          @for (scale of options; track scale.id) {
            <ion-item>
              <ion-radio [value]="scale.id" justify="space-between">
                <ion-label>
                  <h3>{{ formatId(scale.id) }}</h3>
                  <ion-note>{{ preview(scale) }}</ion-note>
                </ion-label>
              </ion-radio>
            </ion-item>
          }
        </ion-radio-group>
      </ion-list>
    </ion-content>
  `,
  styles: [
    `
      ion-note {
        font-size: 0.85rem;
      }
    `,
  ],
})
export class ScalePickerSheetComponent {
  /** Current scale — drives the selected radio. */
  readonly currentScale = input.required<Scale>()

  /**
   * Emits the newly-selected scale. The parent container is responsible
   * for writing to the doc (keeps this component dumb + reusable).
   */
  readonly selected = output<Scale>()

  /** Emits when the user taps "Done" in the header. */
  readonly closeRequested = output<void>()

  protected readonly options: readonly Scale[] = Object.values(BUILTIN_SCALES)

  protected readonly currentValue = computed(() => this.currentScale().id)

  protected onChange(id: string | null | undefined): void {
    if (!id) return
    if (id === this.currentScale().id) return
    const next = BUILTIN_SCALES[id]
    if (!next) return
    this.selected.emit(next)
  }

  protected preview(scale: Scale): string {
    return scale.cards.join(' ')
  }

  protected formatId(id: string): string {
    if (id.length === 0) return id
    return id.charAt(0).toUpperCase() + id.slice(1)
  }
}
