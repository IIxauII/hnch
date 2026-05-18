import { ChangeDetectionStrategy, Component, input, OnInit, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AgendaItem } from '@hnch/shared';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonNote,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { buildRoundStartTicketId, buildRoundStartTitle } from './round-start.helpers';

/**
 * Payload emitted by {@link RoundStartSheetComponent} when the host
 * taps "Start". Mirrors the subset of `Round` the user can actually
 * set from this sheet — the rest (`id`, `createdAt`, `createdBy`,
 * `scale`, `parentRoundId` on re-votes) is the caller's job.
 */
export interface RoundStartSubmission {
  /** Optional descriptor; the user may submit with it blank. */
  readonly title: string | null;
  /** Optional tracker reference (e.g. `PROJ-1234`); blank when the user skips it. */
  readonly ticketId: string | null;
  /** Optional description (max 500 chars). */
  readonly description: string | null;
  /**
   * ID of the agenda item this round was started from (ADR-0042).
   * Passed through unchanged from the pre-fill input; absent when not
   * started from an agenda item.
   */
  readonly agendaItemId?: string;
}

/**
 * Round-start half-sheet content — ux.md §5.8 "Round-start modal".
 *
 * Rendered inside an `<ion-modal>` by the caller; this component
 * owns only the internal chrome (title, descriptor input, footer
 * button). Descriptor is optional, Start is always enabled.
 *
 * When `prefillAgendaItem` is set on modal open, the form is pre-filled
 * from the agenda item's title/ticketId/description. Mid-edit state is
 * preserved — pre-fill only happens in `ngOnInit` (once on open).
 */
@Component({
  selector: 'app-round-start-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
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
        <ion-title>Start Round {{ roundNumber() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">What are you estimating?</ion-label>
        <ion-input
          [formControl]="titleControl"
          placeholder="e.g., Login redesign"
          autocapitalize="sentences"
          enterkeyhint="next"
          aria-label="Round title"
          (keydown.enter)="submit()"
        ></ion-input>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Ticket ID</ion-label>
        <ion-input
          [formControl]="ticketIdControl"
          placeholder="e.g. PROJ-1234"
          autocapitalize="characters"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="next"
          aria-label="Ticket ID"
          (keydown.enter)="submit()"
        ></ion-input>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Description</ion-label>
        <ion-textarea
          [formControl]="descriptionControl"
          placeholder="Optional story context"
          autocapitalize="sentences"
          aria-label="Round description"
          [rows]="2"
        ></ion-textarea>
      </ion-item>
      <ion-note class="helper">
        All fields are optional. This will appear on everyone's Estimating screen.
      </ion-note>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button
            (click)="cancelled.emit()"
            aria-label="Cancel"
          >Cancel</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button
            strong="true"
            color="primary"
            [disabled]="isSubmitting()"
            (click)="submit()"
            aria-label="Start round"
          >Start</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: [
    `
      .helper {
        display: block;
        margin-top: 0.5rem;
        padding: 0 1rem;
      }
    `,
  ],
})
export class RoundStartSheetComponent implements OnInit {
  /**
   * 1-based index for the "Start Round N" title. Callers pass the
   * index the next round will occupy (rounds.length + 1).
   */
  readonly roundNumber = input.required<number>();

  /**
   * When provided, pre-fills the form on modal open (ngOnInit).
   * Pre-fill is one-shot — mid-edit state is never overwritten (ADR-0042).
   */
  readonly prefillAgendaItem = input<AgendaItem | null>(null);

  /**
   * Fires once the host confirms. The modal host is responsible for
   * dismissing the `ion-modal` — this component only emits the value.
   */
  readonly submitted = output<RoundStartSubmission>();

  /**
   * Fires when the user taps Cancel. The modal host is responsible for
   * dismissing the `ion-modal`.
   */
  readonly cancelled = output<void>();

  protected readonly titleControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(120)],
  });

  protected readonly ticketIdControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(120)],
  });

  protected readonly descriptionControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  protected readonly isSubmitting = signal(false);

  ngOnInit(): void {
    const item = this.prefillAgendaItem();
    if (item !== null) {
      this.titleControl.setValue(item.title ?? '');
      this.ticketIdControl.setValue(item.ticketId ?? '');
      this.descriptionControl.setValue(item.description ?? '');
    }
  }

  protected submit(): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    const item = this.prefillAgendaItem();
    this.submitted.emit({
      title: buildRoundStartTitle(this.titleControl.value),
      ticketId: buildRoundStartTicketId(this.ticketIdControl.value),
      description: this.descriptionControl.value.trim() || null,
      ...(item !== null && { agendaItemId: item.id }),
    });
    // Leave isSubmitting latched — the modal is about to close and
    // the component will be destroyed; unlatching could race a
    // double-tap that arrives after submit but before dismiss.
  }
}
