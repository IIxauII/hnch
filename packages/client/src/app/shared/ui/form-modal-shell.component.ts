import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

/**
 * FormModalShellComponent — reusable chrome for form modals.
 *
 * Provides header (title + close button), ion-content (default slot), and
 * ion-footer (Cancel / Submit buttons unless [footer] slot is projected).
 *
 * Apply the `.hnch-form-modal` CSS class on the `presentModal()` call to
 * get proper responsive sizing (full-screen <576, 560×640 ≥sm, 720×720 ≥lg).
 *
 * Inputs:
 *   title        — toolbar title text
 *   submitLabel  — submit button label (default: 'Save')
 *
 * Slots:
 *   (default)  — form content inside ion-content
 *   [footer]   — custom footer; when projected, default Cancel/Submit is hidden
 *
 * Outputs:
 *   submit — emitted when the default Submit button is tapped
 */
@Component({
  selector: 'hnch-form-modal-shell',
  standalone: true,
  imports: [IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonTitle, IonToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title class="modal-title">{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            (click)="close()"
            aria-label="Close"
          >
            <ion-icon slot="icon-only" name="close-outline" aria-hidden="true" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ng-content />
    </ion-content>

    <ng-content select="[footer]">
      <!-- default footer rendered when no [footer] slot is projected -->
    </ng-content>

    <ion-footer class="default-footer">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="close()" aria-label="Cancel">Cancel</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button
            fill="solid"
            color="primary"
            (click)="submit.emit()"
            [attr.aria-label]="submitLabel()"
          >
            {{ submitLabel() }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .modal-title {
        font: var(--hnch-title);
      }
    `,
  ],
})
export class FormModalShellComponent {
  readonly title = input.required<string>();
  readonly submitLabel = input<string>('Save');

  readonly submit = output<void>();

  private readonly modalCtrl = inject(ModalController);

  constructor() {
    addIcons({ closeOutline });
  }

  close(): void {
    void this.modalCtrl.dismiss();
  }
}
