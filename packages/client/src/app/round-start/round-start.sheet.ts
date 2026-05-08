import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonInput, IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';
import { FormModalShellComponent } from '../shared/ui/form-modal-shell.component';

/**
 * Payload emitted by {@link RoundStartSheetComponent} when the host
 * taps "Start". Mirrors the subset of `Round` the user can actually
 * set from this sheet — the rest (`id`, `createdAt`, `createdBy`,
 * `scale`, `parentRoundId` on re-votes) is the caller's job.
 */
export interface RoundStartSubmission {
  /** Optional descriptor; the user may submit with it blank. */
  readonly title: string | null;
}

/**
 * Round-start modal content.
 *
 * Rendered inside an `<ion-modal>` by the caller; this component
 * owns only the internal chrome (title, descriptor input, footer
 * button). Descriptor is optional, Start is always enabled.
 *
 * Kept as a distinct component so the upcoming Revealed → Next Round
 * affordance (Phase 2 commit 6) can reuse it verbatim.
 */
@Component({
  selector: 'app-round-start-sheet',
  host: { class: 'ion-page' },
  imports: [FormModalShellComponent, IonInput, IonItem, IonLabel, IonNote, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hnch-form-modal-shell
      title="Start Round {{ roundNumber() }}"
      submitLabel="Start"
      (submit)="submit()"
    >
      <div class="ion-padding">
        <ion-item>
          <ion-label position="stacked">What are you estimating?</ion-label>
          <ion-input
            [formControl]="titleControl"
            placeholder="e.g., Login redesign"
            autocapitalize="sentences"
            enterkeyhint="done"
            (keydown.enter)="submit()"
          ></ion-input>
        </ion-item>
        <ion-note class="helper">
          This will appear on everyone's Estimating screen.
        </ion-note>
      </div>
    </hnch-form-modal-shell>
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
export class RoundStartSheetComponent {
  /**
   * 1-based index for the "Start Round N" title. Callers pass the
   * index the next round will occupy (rounds.length + 1).
   */
  readonly roundNumber = input.required<number>();

  /**
   * Fires once the host confirms. The modal host is responsible for
   * dismissing the `ion-modal` — this component only emits the value.
   */
  readonly submitted = output<RoundStartSubmission>();

  protected readonly titleControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.maxLength(120)],
  });

  protected readonly isSubmitting = signal(false);

  protected submit(): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    const raw = this.titleControl.value.trim();
    this.submitted.emit({ title: raw === '' ? null : raw });
    // Leave isSubmitting latched — the modal is about to close and
    // the component will be destroyed; unlatching could race a
    // double-tap that arrives after submit but before dismiss.
  }
}
