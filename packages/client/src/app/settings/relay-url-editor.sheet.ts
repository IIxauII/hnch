import { ChangeDetectionStrategy, Component, input, OnInit, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

/**
 * Relay URL editor half-sheet.
 *
 * Pre-fills an `ion-input` with the current relay URL override.
 * The Done button validates the URL and emits the value; it is disabled
 * when the input is empty/whitespace-only or invalid URL format.
 * Clear button emits undefined to remove the override (fallback to
 * environment). Parent (Settings page) is responsible for persisting
 * via AppPreferenceService.
 */
@Component({
  selector: 'app-relay-url-editor-sheet',
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
    IonNote,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Relay URL</ion-title>
        <ion-buttons slot="end">
          @if (urlCtrl.value.trim()) {
            <ion-button
              (click)="onClear()"
              aria-label="Clear relay URL override"
            >
              Clear
            </ion-button>
          }
          <ion-button
            (click)="onDone()"
            [disabled]="urlCtrl.invalid"
            aria-label="Save relay URL"
          >
            Done
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list lines="none">
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
    </ion-content>
  `,
  styles: [
    `
      ion-note {
        display: block;
        font-size: 0.85rem;
        margin-top: 1rem;
      }
    `,
  ],
})
export class RelayUrlEditorSheetComponent implements OnInit {
  /** Current relay URL override — pre-fills the input. */
  readonly currentUrl = input<string | undefined>(undefined);

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
