import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonInput, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';
import { FormModalShellComponent } from '../shared/ui/form-modal-shell.component';

/**
 * Password prompt modal for create flow.
 *
 * Single password input field (optional). User can leave blank.
 * Emits password string on confirm (may be empty), or cancel on dismissal.
 */
@Component({
  selector: 'app-password-prompt-sheet',
  host: { class: 'ion-page' },
  imports: [FormModalShellComponent, IonInput, IonItem, IonLabel, IonList, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hnch-form-modal-shell
      title="Set Password (optional)"
      submitLabel="Set"
      (submit)="onConfirm()"
    >
      <ion-list lines="inset" class="ion-padding-top">
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
    </hnch-form-modal-shell>
  `,
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
