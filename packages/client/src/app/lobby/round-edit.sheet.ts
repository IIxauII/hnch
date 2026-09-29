import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { buildRoundEditSubmission } from './round-edit.helpers';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

export interface RoundEditSubmission {
  readonly title: string;
  readonly description: string | null;
}

/**
 * Round edit half-sheet — the host renames a finished round or rewrites its
 * description. Same field labels as the round-start sheet it mirrors, and,
 * like every form sheet, Cancel on the left and the primary action on the
 * right (ionic.md).
 *
 * A round that has a title keeps one: Save stays disabled while the title
 * field is blank.
 */
@Component({
  selector: 'app-round-edit-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonList,
    IonTextarea,
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
        <ion-title>Edit round {{ roundNumber() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            strong="true"
            color="primary"
            [disabled]="isSubmitting() || titleControl.value.trim() === ''"
            (click)="submit()"
            aria-label="Save round details"
          >Save</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list inset="true" lines="inset">
        <ion-item>
          <ion-input
            [formControl]="titleControl"
            label="What are you estimating?"
            labelPlacement="stacked"
            placeholder="e.g. Login redesign"
            autocapitalize="sentences"
            enterkeyhint="done"
            maxlength="120"
            aria-label="Round title"
            (keydown.enter)="submit()"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-textarea
            [formControl]="descriptionControl"
            label="Description"
            labelPlacement="stacked"
            placeholder="Optional context for the team"
            autocapitalize="sentences"
            aria-label="Round description"
            [autoGrow]="true"
            [counter]="true"
            maxlength="500"
            [rows]="2"
          ></ion-textarea>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
  styles: [
    `
      ion-list {
        margin-block: 0;
      }
    `,
  ],
})
export class RoundEditSheetComponent {
  readonly roundNumber = input.required<number>();
  readonly initialTitle = input<string | null>(null);
  readonly initialDescription = input<string | null>(null);
  readonly submitted = output<RoundEditSubmission>();
  /** Fires when the user taps Cancel. The modal host must dismiss. */
  readonly closeRequested = output<void>();

  protected readonly titleControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(120)],
  });

  protected readonly descriptionControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  protected readonly isSubmitting = signal(false);

  constructor() {
    effect(
      () => {
        const t = this.initialTitle();
        const d = this.initialDescription();
        this.titleControl.setValue(t ?? '', { emitEvent: false });
        this.descriptionControl.setValue(d ?? '', { emitEvent: false });
      },
      { allowSignalWrites: true },
    );
  }

  protected submit(): void {
    if (this.isSubmitting()) return;
    const payload = buildRoundEditSubmission(
      this.titleControl.value,
      this.descriptionControl.value,
    );
    if (!payload) return;
    this.isSubmitting.set(true);
    this.submitted.emit(payload);
  }
}
