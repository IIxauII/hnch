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
  IonLabel,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

export interface RoundEditSubmission {
  readonly title: string;
  readonly description: string | null;
}

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
    IonLabel,
    IonNote,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Edit Round {{ roundNumber() }}</ion-title>
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
      <ion-item>
        <ion-label position="stacked">What are you estimating?</ion-label>
        <ion-input
          [formControl]="titleControl"
          placeholder="e.g., Login redesign"
          autocapitalize="sentences"
          aria-label="Round title"
        ></ion-input>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Notes (optional)</ion-label>
        <ion-input
          [formControl]="descriptionControl"
          placeholder="Optional details"
          autocapitalize="sentences"
          aria-label="Round notes"
        ></ion-input>
      </ion-item>
      @if (titleControl.invalid && titleControl.touched) {
        <ion-note class="error" color="danger" aria-live="polite">
          Title must be 120 characters or fewer.
        </ion-note>
      }
      @if (descriptionControl.invalid && descriptionControl.touched) {
        <ion-note class="error" color="danger" aria-live="polite">
          Notes must be 500 characters or fewer.
        </ion-note>
      }
    </ion-content>
  `,
  styles: [
    `
      .error {
        display: block;
        margin-top: 0.25rem;
        padding: 0 1rem;
      }
    `,
  ],
})
export class RoundEditSheetComponent {
  readonly roundNumber = input.required<number>();
  readonly initialTitle = input<string | null>(null);
  readonly initialDescription = input<string | null>(null);
  readonly submitted = output<RoundEditSubmission>();

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
