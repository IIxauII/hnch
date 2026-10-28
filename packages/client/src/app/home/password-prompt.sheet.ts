import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  output,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAX_PASSWORD_LENGTH, normalizePassword } from '@hnch/shared';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonInputPasswordToggle,
  IonItem,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { focusField } from '../utils/focus-field';
import { isComposingKey } from '../utils/composing-key';

/**
 * Password prompt half-sheet for the create flow, shown when the
 * "Ask for a password" preference is on.
 *
 * The session has already been created when this opens, so neither button
 * cancels anything: **Skip** leaves the session open to anyone with the code,
 * **Done** applies whatever was typed (a blank field is the same as Skip).
 */
@Component({
  selector: 'app-password-prompt-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonInputPasswordToggle,
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
          <ion-button (click)="closeRequested.emit()">Skip</ion-button>
        </ion-buttons>
        <ion-title>Session password</ion-title>
        <ion-buttons slot="end">
          <ion-button
            strong="true"
            color="primary"
            (click)="onConfirm()"
          >
            Done
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list inset="true" lines="none">
        <ion-item>
          <ion-input
            #passwordField
            [formControl]="passwordControl"
            label="Password"
            labelPlacement="stacked"
            type="password"
            autocomplete="off"
            enterkeyhint="done"
            [maxlength]="maxPasswordLength"
            placeholder="Leave blank for no password"
            (keydown.enter)="composing($event) || onConfirm()"
          >
            <ion-input-password-toggle slot="end" color="medium"></ion-input-password-toggle>
          </ion-input>
        </ion-item>
      </ion-list>
      <ion-note class="helper">
        Anyone joining will need this password as well as the code.
      </ion-note>
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
    `,
  ],
})
export class PasswordPromptSheetComponent {
  /**
   * For the Enter handlers: the Enter that confirms a choice in an input
   * method is part of typing, and commits nothing.
   */
  protected readonly composing = isComposingKey;

  /** As long as a password gets, on every surface. */
  protected readonly maxPasswordLength = MAX_PASSWORD_LENGTH;

  /**
   * Emitted on Done. Passes the password string
   * (may be empty if user left field blank).
   */
  readonly passwordSubmitted = output<string>();

  /**
   * Emitted on Skip.
   */
  readonly closeRequested = output<void>();

  protected readonly passwordControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(120)],
  });

  private readonly passwordField = viewChild<IonInput>('passwordField');

  constructor() {
    // The sheet is there to have a password typed into it.
    afterNextRender(() => void focusField(this.passwordField()));
  }

  protected onConfirm(): void {
    if (this.passwordControl.invalid) return;
    this.passwordSubmitted.emit(normalizePassword(this.passwordControl.value));
  }
}
