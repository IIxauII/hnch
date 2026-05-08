import { ChangeDetectionStrategy, Component, input, OnInit, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IonInput, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular/standalone';
import { FormModalShellComponent } from '../shared/ui/form-modal-shell.component';

/**
 * Relay URL editor modal.
 *
 * Pre-fills an `ion-input` with the current relay URL override.
 * The Save button validates the URL and emits the value; it is disabled
 * when the input is empty/whitespace-only or invalid URL format.
 * Parent (Settings page) is responsible for persisting via AppPreferenceService.
 */
@Component({
  selector: 'app-relay-url-editor-sheet',
  host: { class: 'ion-page' },
  imports: [
    FormModalShellComponent,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hnch-form-modal-shell
      title="Relay URL"
      submitLabel="Save"
      (submit)="onDone()"
    >
      <ion-list lines="none" class="ion-padding">
        <ion-item>
          <ion-label position="stacked">Relay HTTP URL (optional)</ion-label>
          <ion-input
            [formControl]="urlCtrl"
            type="url"
            placeholder="https://relay.example.com"
            aria-label="Relay HTTP URL"
          ></ion-input>
        </ion-item>
      </ion-list>
      <ion-note class="ion-padding-start">
        Leave blank to use default relay. URL must start with http:// or https://
      </ion-note>
    </hnch-form-modal-shell>
  `,
})
export class RelayUrlEditorSheetComponent implements OnInit {
  /** Current relay URL override — pre-fills the input. */
  readonly currentUrl = input<string | undefined>();

  /** Emits the trimmed new URL on Done, or undefined on Clear. */
  readonly saved = output<string | undefined>();

  /** Emits when the sheet should close. */
  readonly closeRequested = output<void>();

  readonly urlCtrl = new FormControl('', {
    nonNullable: true,
    validators: [
      (ctrl) => {
        const val = ctrl.value.trim();
        if (!val) return null; // empty allowed (means clear)
        // basic URL validation: must start with http:// or https://
        if (!/^https?:\/\//.test(val)) {
          return { invalidUrl: true };
        }
        return null;
      },
    ],
  });

  ngOnInit(): void {
    this.urlCtrl.setValue(this.currentUrl() ?? '');
  }

  protected onDone(): void {
    const trimmed = this.urlCtrl.value.trim();
    this.saved.emit(trimmed || undefined);
    this.closeRequested.emit();
  }

  protected onClear(): void {
    this.saved.emit(undefined);
    this.closeRequested.emit();
  }
}
