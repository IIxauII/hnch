import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
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
            [formControl]="passwordControl"
            label="Password"
            labelPlacement="stacked"
            type="password"
            autocomplete="new-password"
            enterkeyhint="done"
            placeholder="Leave blank for no password"
            (keydown.enter)="onConfirm()"
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
      ion-list {
        margin-block: 0;
      }
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

  protected onConfirm(): void {
    if (this.passwordControl.invalid) return;
    const password = this.passwordControl.value.trim();
    this.passwordSubmitted.emit(password);
  }
}
