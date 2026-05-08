import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';

/**
 * SectionCardComponent — a styled card with optional eyebrow + title header,
 * default content slot, and an optional footer slot.
 *
 * Slots:
 *   (default) — card body content
 *   [footer]  — footer region (e.g. action row)
 */
@Component({
  selector: 'hnch-section-card',
  standalone: true,
  imports: [IonCard, IonCardContent, IonCardHeader, IonCardTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-card class="section-card">
      @if (eyebrow() || title()) {
        <ion-card-header class="section-card-header">
          @if (eyebrow()) {
            <p class="eyebrow" aria-hidden="true">{{ eyebrow() }}</p>
          }
          @if (title()) {
            <ion-card-title class="section-title">{{ title() }}</ion-card-title>
          }
        </ion-card-header>
      }
      <ion-card-content class="section-card-content">
        <ng-content />
      </ion-card-content>
      <ng-content select="[footer]" />
    </ion-card>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .section-card {
        border-radius: var(--hnch-r-md);
        box-shadow: var(--hnch-shadow-1);
        margin: 0;
      }
      .section-card-header {
        padding: var(--hnch-sp-5) var(--hnch-sp-5) var(--hnch-sp-2);
      }
      .eyebrow {
        margin: 0 0 var(--hnch-sp-1);
        font: var(--hnch-eyebrow);
        letter-spacing: var(--hnch-eyebrow-tracking);
        text-transform: uppercase;
        color: var(--ion-color-step-600, rgba(60,60,67,0.6));
      }
      .section-title {
        font: var(--hnch-title);
        letter-spacing: var(--hnch-display-tracking);
        padding: 0;
      }
      .section-card-content {
        padding: var(--hnch-sp-5);
      }
    `,
  ],
})
export class SectionCardComponent {
  readonly eyebrow = input<string | undefined>(undefined);
  readonly title = input<string | undefined>(undefined);
}
