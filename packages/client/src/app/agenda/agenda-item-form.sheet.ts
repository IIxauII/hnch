import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
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
  IonList,
  IonNote,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { map, startWith } from 'rxjs';

import { focusField } from '../utils/focus-field';

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
 * AgendaItemFormSheetComponent — half-sheet for adding or editing a story on
 * the agenda.
 *
 * Modes:
 * - 'add': blank form, header = "Add story"
 * - 'edit': pre-filled from `initialItem`, header = "Edit story"
 *
 * Validator: at least one of {title, ticketId} must be non-empty. That rule
 * is stated once, as a plain helper line, and enforced by the primary button
 * staying disabled — not by an error that is on screen before the user has
 * typed anything.
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
    IonList,
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
          <ion-button (click)="closeRequested.emit()">Cancel</ion-button>
        </ion-buttons>
        <ion-title>{{ mode() === 'edit' ? 'Edit story' : 'Add story' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            strong="true"
            color="primary"
            [disabled]="isSubmitting() || !formValid()"
            (click)="submit()"
            aria-label="{{ mode() === 'edit' ? 'Save story' : 'Add story' }}"
          >{{ mode() === 'edit' ? 'Save' : 'Add' }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <form [formGroup]="form" (ngSubmit)="submit()">
        <ion-list inset="true" lines="inset">
          <ion-item>
            <ion-input
              #titleField
              formControlName="title"
              label="Title"
              labelPlacement="stacked"
              placeholder="e.g. Login redesign"
              autocapitalize="sentences"
              enterkeyhint="done"
              maxlength="120"
              aria-describedby="agenda-form-hint"
              (keydown.enter)="onEnter($event)"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-input
              formControlName="ticketId"
              label="Ticket ID"
              labelPlacement="stacked"
              placeholder="e.g. PROJ-1234"
              autocapitalize="characters"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="done"
              maxlength="120"
              aria-describedby="agenda-form-hint"
              (keydown.enter)="onEnter($event)"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-textarea
              formControlName="description"
              label="Description"
              labelPlacement="stacked"
              placeholder="Optional context for the team"
              autocapitalize="sentences"
              [autoGrow]="true"
              [counter]="true"
              maxlength="500"
              [rows]="2"
            ></ion-textarea>
          </ion-item>
        </ion-list>
        <ion-note id="agenda-form-hint" class="helper">
          A story needs a title or a ticket ID.
        </ion-note>
      </form>
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

  /**
   * Form validity as a signal. `form.valid` is a plain property, so a
   * `computed()` over it never re-evaluates — this follows the form's own
   * status stream instead.
   */
  protected readonly formValid = toSignal(
    this.form.statusChanges.pipe(
      startWith(this.form.status),
      map(() => this.form.valid),
    ),
    { initialValue: this.form.valid },
  );

  private readonly titleField = viewChild<IonInput>('titleField');

  constructor() {
    // A submit the parent refuses leaves this sheet open (a peer removed the
    // story mid-edit, say). The latch has to let go once the user edits
    // again, or the form is stuck with a dead primary button.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.isSubmitting.set(false);
    });

    // The sheet is there to be typed into.
    afterNextRender(() => void focusField(this.titleField()));
  }

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

  /**
   * Enter in a one-line field submits, and the key says so (`enterkeyhint`).
   * The Enter that confirms an IME composition is part of typing, not a submit.
   */
  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).isComposing) return;
    this.submit();
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
