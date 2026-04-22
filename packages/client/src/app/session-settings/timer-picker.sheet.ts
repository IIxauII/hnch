import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core'
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
 * Normalized picker output. `ms: null` means "no timer" — the
 * container translates that into `revealMode: 'manual'` plus
 * `timerDurationMs: undefined`, and any numeric value into
 * `revealMode: 'timer'` plus that duration. Keeping the translation
 * at the container (not here) keeps this component free of Yjs /
 * schema knowledge.
 */
export interface TimerSelection {
  readonly ms: number | null
}

interface TimerOption {
  readonly label: string
  /** `null` encodes "None"; numeric values are in milliseconds. */
  readonly value: number | null
  /** Stable string key for the radio group — null becomes `"none"`. */
  readonly key: string
}

const OPTIONS: readonly TimerOption[] = [
  { label: 'None', value: null, key: 'none' },
  { label: '5 seconds', value: 5_000, key: '5s' },
  { label: '30 seconds', value: 30_000, key: '30s' },
  { label: '1 minute', value: 60_000, key: '1min' },
  { label: '2 minutes', value: 120_000, key: '2min' },
  { label: '3 minutes', value: 180_000, key: '3min' },
  { label: '5 minutes', value: 300_000, key: '5min' },
]

/**
 * Timer picker half-sheet — ux.md §5.8.
 *
 * Per ADR-0015 and plan §2.4, the timer is session-level and applies to
 * every round; changing it mid-round does not affect the running timer
 * (the live countdown reads `round.timerStartedAt` which is frozen at
 * round start). Commits on selection, no Save button.
 */
@Component({
  selector: 'app-timer-picker-sheet',
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
        <ion-title>Timer</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="closeRequested.emit()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-top">
      <ion-list lines="inset">
        <ion-radio-group
          [value]="currentKey()"
          (ionChange)="onChange($event.detail.value)"
        >
          @for (option of options; track option.key) {
            <ion-item>
              <ion-radio [value]="option.key" justify="space-between">
                <ion-label>{{ option.label }}</ion-label>
              </ion-radio>
            </ion-item>
          }
        </ion-radio-group>
      </ion-list>
    </ion-content>
  `,
  styles: [],
})
export class TimerPickerSheetComponent {
  /**
   * Current timer duration in ms, or `null` when the session has no
   * timer (`revealMode: 'manual'`). Drives the selected radio.
   */
  readonly currentMs = input.required<number | null>()

  readonly selected = output<TimerSelection>()
  readonly closeRequested = output<void>()

  protected readonly options = OPTIONS

  /**
   * Resolve `currentMs` to one of the preset keys. Any non-preset value
   * (not expected in Phase 2 but worth being defensive about) sorts to
   * "none" so the UI doesn't silently lie about the current state.
   */
  protected currentKey(): string {
    const ms = this.currentMs()
    const match = OPTIONS.find((o) => o.value === ms)
    return match?.key ?? 'none'
  }

  protected onChange(key: string | null | undefined): void {
    if (!key) return
    const next = OPTIONS.find((o) => o.key === key)
    if (!next) return
    if (next.value === this.currentMs()) return
    this.selected.emit({ ms: next.value })
  }
}
