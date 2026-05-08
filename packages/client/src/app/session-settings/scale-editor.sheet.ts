import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { BUILTIN_SCALES, formatScaleId } from '@hnch/shared';
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
    <ion-content class="ion-padding-top">
      <ion-list lines="inset" [attr.aria-label]="title() + ' card toggles'">
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
      <ion-note class="hint ion-padding-horizontal">
        At least one card must remain enabled.
      </ion-note>
    </ion-content>
  `,
  styles: [
    `
      .hint {
        display: block;
        margin-top: 0.75rem;
        font-size: 0.8rem;
        color: var(--ion-color-medium);
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

  protected readonly title = computed(() => formatScaleId(this.scaleId()));

  /**
   * Row view-model computed from the current overrides. Each row carries:
   * - `index`        — card index in the builtin full list
   * - `face`         — display string (e.g. "5", "M")
   * - `enabled`      — true if the card is currently active
   * - `disableToggle`— true when this is the last enabled card (prevent empty scale)
   */
  protected readonly cardRows = computed(() => {
    const id = this.scaleId();
    const builtin = BUILTIN_SCALES[id];
    if (!builtin) return [];

    const disabled = this.scalePrefs.presetOverrides()[id] ?? [];
    const enabledCount = builtin.cards.length - disabled.length;

    return builtin.cards.map((face, index) => {
      const enabled = !disabled.includes(index);
      return {
        index,
        face,
        enabled,
        disableToggle: enabled && enabledCount === 1,
      };
    });
  });

  protected onToggle(index: number): void {
    this.haptics.impactLight();
    void this.scalePrefs.togglePresetCard(this.scaleId(), index);
  }
}
