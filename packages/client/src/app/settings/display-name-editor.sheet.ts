import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone'

/**
 * Display name editor half-sheet.
 *
 * Pre-fills an `ion-input` with the current name. The Done button trims
 * and emits the value; it is disabled when the input is empty or
 * whitespace-only. The parent (Settings page) is responsible for
 * persisting via DisplayNameService and updating the Yjs doc.
 */
@Component({
  selector: 'app-display-name-editor-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonList,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Display Name</ion-title>
        <ion-buttons slot="end">
          <ion-button
            (click)="onDone()"
            [disabled]="nameCtrl.invalid"
          >
            Done
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list lines="none">
        <ion-item>
          <ion-input
            label="Name"
            labelPlacement="stacked"
            [formControl]="nameCtrl"
            type="text"
            maxlength="40"
            autocapitalize="words"
          ></ion-input>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class DisplayNameEditorSheetComponent implements OnInit {
  /** Current display name — pre-fills the input. */
  readonly currentName = input.required<string>()

  /** Emits the trimmed new name on Done. */
  readonly saved = output<string>()

  /** Emits when the sheet should close. */
  readonly closeRequested = output<void>()

  readonly nameCtrl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)],
  })

  ngOnInit(): void {
    this.nameCtrl.setValue(this.currentName())
  }

  protected onDone(): void {
    const trimmed = this.nameCtrl.value.trim()
    if (!trimmed) return
    this.saved.emit(trimmed)
    this.closeRequested.emit()
  }
}
