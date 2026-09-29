import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
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

import { SurfaceService } from '../core/surface.service';
import { focusField } from '../utils/focus-field';
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
 * owns only the internal chrome (title, the three optional fields, and the
 * Cancel / Start actions in the header toolbar). Nothing is required, so
 * Start is always enabled — Enter in either single-line field starts too.
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
          <ion-button
            (click)="cancelled.emit()"
            aria-label="Cancel"
          >Cancel</ion-button>
        </ion-buttons>
        <ion-title>Start round {{ roundNumber() }}</ion-title>
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
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list inset="true" lines="inset">
        <ion-item>
          <ion-input
            #titleField
            [formControl]="titleControl"
            label="What are you estimating?"
            labelPlacement="stacked"
            placeholder="e.g. Login redesign"
            autocapitalize="sentences"
            enterkeyhint="go"
            maxlength="120"
            (keydown.enter)="onEnter($event)"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            [formControl]="ticketIdControl"
            label="Ticket ID"
            labelPlacement="stacked"
            placeholder="e.g. PROJ-1234"
            autocapitalize="characters"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="go"
            maxlength="120"
            (keydown.enter)="onEnter($event)"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-textarea
            [formControl]="descriptionControl"
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
      <ion-note class="helper">
        All optional. Everyone sees this while they vote.
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
export class RoundStartSheetComponent implements OnInit {
  /**
   * Number for the "Start round N" title. Callers pass the number the next
   * round will go by (`nextRoundNumber`).
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

  private readonly surface = inject(SurfaceService);
  private readonly titleField = viewChild<IonInput>('titleField');

  constructor() {
    // With a keyboard at hand, the title is ready to be typed and Enter
    // starts the round. Not on a phone: every field is optional, most rounds
    // start with the form as it is, and the keyboard would cover it.
    afterNextRender(() => {
      if (this.surface.mode() === 'desktop') void focusField(this.titleField());
    });
  }

  ngOnInit(): void {
    const item = this.prefillAgendaItem();
    if (item !== null) {
      this.titleControl.setValue(item.title ?? '');
      this.ticketIdControl.setValue(item.ticketId ?? '');
      this.descriptionControl.setValue(item.description ?? '');
    }
  }

  /**
   * Enter in a one-line field starts the round, and the key says so
   * (`enterkeyhint`). The Enter that confirms an IME composition is part of
   * typing, not a submit.
   */
  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).isComposing) return;
    this.submit();
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
