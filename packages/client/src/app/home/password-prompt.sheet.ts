import { ChangeDetectionStrategy, Component, output } from '@angular/core';
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
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

/**
 * Password prompt half-sheet for create flow.
 *
 * Single password input field (optional). User can leave blank.
 * Emits password string on confirm (may be empty), or cancel on dismissal.
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
        <ion-buttons slot="start">
          <ion-button (click)="closeRequested.emit()">Cancel</ion-button>
        </ion-buttons>
        <ion-title>Set Password (optional)</ion-title>
        <ion-buttons slot="end">
          <ion-button
            strong="true"
            color="primary"
            (click)="onConfirm()"
          >
            Confirm
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding-top">
      <ion-list lines="inset">
        <ion-item>
          <ion-label position="stacked">Password</ion-label>
          <ion-input
            [formControl]="passwordControl"
            type="password"
            autocomplete="off"
            placeholder="Leave blank for no password"
            (keydown.enter)="onConfirm()"
            aria-label="Password for room"
          ></ion-input>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
  styles: [],
})
export class PasswordPromptSheetComponent {
  /**
   * Emitted when user confirms. Passes the password string
   * (may be empty if user left field blank).
   */
  readonly passwordSubmitted = output<string>();

  /**
   * Emitted when user taps Cancel or dismisses sheet.
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
