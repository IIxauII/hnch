import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IonChip, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  alertCircleOutline,
  closeCircleOutline,
  ellipseOutline,
} from 'ionicons/icons';

export type StatChipTone = 'neutral' | 'success' | 'warning' | 'danger';

const TONE_COLOR: Record<StatChipTone, string> = {
  neutral: 'medium',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

/**
 * StatChipComponent — a compact chip showing an icon, label, dot separator, and value.
 *
 * Inputs:
 *   icon  — optional Ionicon name
 *   label — primary label text
 *   value — value text shown after the dot
 *   tone  — color tone: neutral | success | warning | danger (default: neutral)
 */
@Component({
  selector: 'hnch-stat-chip',
  standalone: true,
  imports: [IonChip, IonIcon, IonLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-chip
      class="stat-chip"
      [color]="ionColor()"
      [attr.aria-label]="label() + ': ' + value()"
    >
      @if (icon()) {
        <ion-icon [name]="icon()!" aria-hidden="true" />
      }
      <ion-label class="stat-label">
        <span class="stat-text">{{ label() }}</span>
        <span class="stat-dot" aria-hidden="true">·</span>
        <span class="stat-value">{{ value() }}</span>
      </ion-label>
    </ion-chip>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .stat-chip {
        border-radius: var(--hnch-r-xs);
        font: var(--hnch-body-sm);
        margin: 0;
        height: auto;
        min-height: 28px;
      }
      .stat-label {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .stat-dot {
        opacity: 0.5;
      }
      .stat-value {
        font-weight: 600;
      }
    `,
  ],
})
export class StatChipComponent {
  readonly icon = input<string | undefined>(undefined);
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly tone = input<StatChipTone>('neutral');

  readonly ionColor = computed(() => TONE_COLOR[this.tone()]);

  constructor() {
    addIcons({ checkmarkCircleOutline, alertCircleOutline, closeCircleOutline, ellipseOutline });
  }
}
