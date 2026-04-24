import {
  ChangeDetectionStrategy,
  Component,
  input,
  OnInit,
  output,
} from '@angular/core'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

/**
 * Session name editor half-sheet.
 *
 * Pre-fills an `ion-input` with the current default session name.
 * The Done button trims and emits the value; it is disabled when the
 * input is empty or whitespace-only. Clear button emits undefined to
 * remove the default. Parent (Settings page) is responsible for
 * persisting via AppPreferenceService.
 */
@Component({
  selector: 'app-session-name-editor-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Default Session Name</ion-title>
        <ion-buttons slot="end">
          @if (nameCtrl.value.trim()) {
            <ion-button
              (click)="onClear()"
              aria-label="Clear default session name"
            >
              Clear
            </ion-button>
          }
          <ion-button
            (click)="onDone()"
            [disabled]="nameCtrl.invalid"
            aria-label="Save default session name"
          >
            Done
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list lines="none">
        <ion-item>
          <ion-label position="stacked">Session name (optional)</ion-label>
          <ion-input
            [formControl]="nameCtrl"
            type="text"
            maxlength="60"
            placeholder="e.g., Sprint Planning"
            autocapitalize="words"
            aria-label="Default session name"
          ></ion-input>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class SessionNameEditorSheetComponent implements OnInit {
  /** Current default session name — pre-fills the input. */
  readonly currentName = input<string | undefined>(undefined)

  /** Emits the trimmed new name on Done, or undefined on Clear. */
  readonly saved = output<string | undefined>()

  /** Emits when the sheet should close. */
  readonly closeRequested = output<void>()

  readonly nameCtrl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(60)],
  })

  ngOnInit(): void {
    this.nameCtrl.setValue(this.currentName() ?? '')
  }

  protected onDone(): void {
    const trimmed = this.nameCtrl.value.trim()
    this.saved.emit(trimmed || undefined)
    this.closeRequested.emit()
  }

  protected onClear(): void {
    this.saved.emit(undefined)
    this.closeRequested.emit()
  }
}
