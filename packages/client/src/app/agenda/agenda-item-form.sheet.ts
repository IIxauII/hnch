import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type { AgendaItem } from '@hnch/shared';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonNote,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

/**
 * Payload emitted when the user submits the agenda item form.
 */
export interface AgendaItemFormSubmission {
  readonly title: string | null;
  readonly ticketId: string | null;
  readonly description: string | null;
}

/**
 * Validator: at least one of {title, ticketId} must be non-empty.
 */
function atLeastOneRequired(group: AbstractControl): ValidationErrors | null {
  const title = (group.get('title')?.value as string) ?? '';
  const ticketId = (group.get('ticketId')?.value as string) ?? '';
  if (title.trim().length === 0 && ticketId.trim().length === 0) {
    return { atLeastOneRequired: true };
  }
  return null;
}

/**
 * AgendaItemFormSheetComponent — half-sheet for adding or editing an agenda item.
 *
 * Modes:
 * - 'add': blank form, header = "Add Agenda Item"
 * - 'edit': pre-filled from `initialItem`, header = "Edit Agenda Item"
 *
 * Validator: at least one of {title, ticketId} must be non-empty.
 * `submitted` emits trimmed values (null when blank).
 * `closeRequested` fires on cancel.
 */
@Component({
  selector: 'app-agenda-item-form-sheet',
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
          <ion-button
            (click)="closeRequested.emit()"
            aria-label="Cancel"
          >Cancel</ion-button>
        </ion-buttons>
        <ion-title>{{ mode() === 'edit' ? 'Edit Agenda Item' : 'Add Agenda Item' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            strong="true"
            color="primary"
            [disabled]="isSubmitting() || !form.valid"
            (click)="submit()"
            aria-label="{{ mode() === 'edit' ? 'Save agenda item' : 'Add agenda item' }}"
          >{{ mode() === 'edit' ? 'Save' : 'Add' }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <form [formGroup]="form" (ngSubmit)="submit()">
        <ion-item>
          <ion-label position="stacked" aria-required="true">Title</ion-label>
          <ion-input
            formControlName="title"
            placeholder="e.g., Login redesign"
            autocapitalize="sentences"
            enterkeyhint="next"
            aria-label="Story title"
            [attr.aria-describedby]="atLeastOneError() ? 'agenda-form-error' : null"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Ticket ID</ion-label>
          <ion-input
            formControlName="ticketId"
            placeholder="e.g., PROJ-1234"
            autocapitalize="characters"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="next"
            aria-label="Issue tracker ticket ID"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Description</ion-label>
          <ion-textarea
            formControlName="description"
            placeholder="Optional story context"
            autocapitalize="sentences"
            aria-label="Story description"
            [rows]="3"
          ></ion-textarea>
        </ion-item>
        @if (atLeastOneError()) {
          <ion-note
            id="agenda-form-error"
            color="danger"
            class="form-error"
            role="alert"
            aria-live="assertive"
          >
            Enter a title or ticket ID.
          </ion-note>
        }
        @if (descriptionTooLong()) {
          <ion-note
            color="danger"
            class="form-error"
            role="alert"
            aria-live="assertive"
          >
            Description is too long (max 500 characters).
          </ion-note>
        }
      </form>
    </ion-content>
  `,
  styles: [
    `
      .form-error {
        display: block;
        margin-top: 0.5rem;
        padding: 0 1rem;
      }
    `,
  ],
})
export class AgendaItemFormSheetComponent implements OnInit {
  /** 'add' (blank form) or 'edit' (pre-filled from initialItem). */
  readonly mode = input<'add' | 'edit'>('add');

  /** Pre-fill data when mode='edit'. */
  readonly initialItem = input<AgendaItem | null>(null);

  /** Fires when the user submits a valid form. */
  readonly submitted = output<AgendaItemFormSubmission>();

  /** Fires when the user taps Cancel. The modal host must dismiss. */
  readonly closeRequested = output<void>();

  protected readonly form = new FormGroup(
    {
      title: new FormControl<string>('', {
        nonNullable: true,
        validators: [Validators.maxLength(120)],
      }),
      ticketId: new FormControl<string>('', {
        nonNullable: true,
        validators: [Validators.maxLength(120)],
      }),
      description: new FormControl<string>('', {
        nonNullable: true,
        validators: [Validators.maxLength(500)],
      }),
    },
    { validators: atLeastOneRequired },
  );

  protected readonly isSubmitting = signal(false);

  protected readonly atLeastOneError = computed(
    () => this.form.invalid && this.form.errors?.['atLeastOneRequired'] === true,
  );

  protected readonly descriptionTooLong = computed(
    () => this.form.controls.description.errors?.['maxlength'] !== undefined,
  );

  ngOnInit(): void {
    const item = this.initialItem();
    if (this.mode() === 'edit' && item !== null) {
      this.form.patchValue({
        title: item.title ?? '',
        ticketId: item.ticketId ?? '',
        description: item.description ?? '',
      });
    }
  }

  protected submit(): void {
    if (this.isSubmitting() || !this.form.valid) return;
    this.isSubmitting.set(true);
    const { title, ticketId, description } = this.form.getRawValue();
    this.submitted.emit({
      title: title.trim() || null,
      ticketId: ticketId.trim() || null,
      description: description.trim() || null,
    });
  }
}
