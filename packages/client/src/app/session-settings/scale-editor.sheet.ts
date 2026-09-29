import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { getScaleLabel } from '@hnch/shared';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { HapticService } from '../core/haptic.service';
import { ScalePreferenceService } from '../core/scale-preference.service';
import { computeCardRows } from './scale-editor.helpers';

/**
 * Preset card customization half-sheet.
 *
 * Shows every card in a builtin scale as a toggle row. Toggling a card
 * calls `ScalePreferenceService.togglePresetCard()` which persists the
 * change and updates the `availableScales` signal immediately.
 *
 * Guard: the last enabled card cannot be toggled off — the toggle is
 * disabled when only one card would remain enabled.
 */
@Component({
  selector: 'app-scale-editor-sheet',
  host: { class: 'ion-page' },
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonTitle,
    IonToggle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="closeRequested.emit()">Done</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list inset="true" lines="inset" [attr.aria-label]="title() + ' card toggles'">
        @for (card of cardRows(); track card.index) {
          <ion-item>
            <ion-label>
              <h3>{{ card.face }}</h3>
            </ion-label>
            <ion-toggle
              slot="end"
              [checked]="card.enabled"
              [disabled]="card.disableToggle"
              [attr.aria-label]="card.enabled ? 'Disable card ' + card.face : 'Enable card ' + card.face"
              (ionChange)="onToggle(card.index)"
            ></ion-toggle>
          </ion-item>
        }
      </ion-list>
      <ion-note class="hint">
        Turn off the cards your team never uses. At least one stays on.
      </ion-note>
    </ion-content>
  `,
  styles: [
    `
      ion-list {
        margin-block: 0;
      }
      .hint {
        display: block;
        padding: 8px 16px 0;
        font-size: 13px;
        line-height: 1.4;
      }
    `,
  ],
})
export class ScaleEditorSheetComponent {
  private readonly scalePrefs = inject(ScalePreferenceService);
  private readonly haptics = inject(HapticService);

  /** The builtin scale ID to edit (must be a key of BUILTIN_SCALES). */
  readonly scaleId = input.required<string>();

  /** Emits when the user taps Done. */
  readonly closeRequested = output<void>();

  protected readonly title = computed(() =>
    getScaleLabel(this.scaleId(), this.scalePrefs.customScales()),
  );

  protected readonly cardRows = computed(() =>
    computeCardRows(this.scaleId(), this.scalePrefs.presetOverrides()[this.scaleId()] ?? []),
  );

  protected onToggle(index: number): void {
    this.haptics.impactLight();
    void this.scalePrefs.togglePresetCard(this.scaleId(), index);
  }
}
