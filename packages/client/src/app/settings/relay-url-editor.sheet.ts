import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  input,
  OnInit,
  output,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { focusField } from '../utils/focus-field';
import { validateRelayUrl } from './relay-url-editor.helpers';
import { isComposingKey } from '../utils/composing-key';

/**
 * Relay URL editor half-sheet.
 *
 * Pre-fills an `ion-input` with the current relay URL override.
 * Save validates the URL and emits the value; a blank field saves as "no
 * override". "Use the default relay" emits undefined to remove the
 * override (fallback to environment). Parent (Settings page) is responsible
 * for persisting via AppPreferenceService.
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
        <ion-buttons slot="start">
          <ion-button (click)="closeRequested.emit()">Cancel</ion-button>
        </ion-buttons>
        <ion-title>Relay URL</ion-title>
        <ion-buttons slot="end">
          <ion-button
            strong="true"
            color="primary"
            (click)="onDone()"
            [disabled]="urlCtrl.invalid"
            aria-label="Save relay URL"
          >
            Save
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list inset="true" lines="none">
        <ion-item>
          <ion-input
            #urlField
            [formControl]="urlCtrl"
            label="Relay URL"
            labelPlacement="stacked"
            type="url"
            inputmode="url"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="done"
            placeholder="https://relay.example.com"
            (keydown.enter)="composing($event) || onDone()"
          ></ion-input>
        </ion-item>
      </ion-list>
      <ion-note class="helper">
        Only needed for a self-hosted relay. Starts with http:// or https://.
      </ion-note>
      @if (currentUrl()) {
        <ion-button
          fill="clear"
          class="reset-btn"
          (click)="onClear()"
        >
          Use the default relay
        </ion-button>
      }
    </ion-content>
  `,
  styles: [
    `
      .helper {
        display: block;
        padding: 8px 16px 0;
        font-size: 13px;
        line-height: 1.4;
      }
      .reset-btn {
        margin: 12px 0 0 4px;
      }
    `,
  ],
})
export class RelayUrlEditorSheetComponent implements OnInit {
  /**
   * For the Enter handlers: the Enter that confirms a choice in an input
   * method is part of typing, and commits nothing.
   */
  protected readonly composing = isComposingKey;

  /** Current relay URL override — pre-fills the input. */
  readonly currentUrl = input<string | undefined>();

  /** Emits the trimmed new URL on Save, or undefined when the override is removed. */
  readonly saved = output<string | undefined>();

  /** Emits when the sheet should close. */
  readonly closeRequested = output<void>();

  readonly urlCtrl = new FormControl('', {
    nonNullable: true,
    validators: [(ctrl) => validateRelayUrl(ctrl.value)],
  });

  private readonly urlField = viewChild<IonInput>('urlField');

  constructor() {
    // The sheet is there to be typed into.
    afterNextRender(() => void focusField(this.urlField()));
  }

  ngOnInit(): void {
    this.urlCtrl.setValue(this.currentUrl() ?? '');
  }

  protected onDone(): void {
    if (this.urlCtrl.invalid) return;
    const trimmed = this.urlCtrl.value.trim();
    this.saved.emit(trimmed || undefined);
    this.closeRequested.emit();
  }

  protected onClear(): void {
    this.saved.emit(undefined);
    this.closeRequested.emit();
  }
}
