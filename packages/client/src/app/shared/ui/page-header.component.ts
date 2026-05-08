import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * PageHeaderComponent — eyebrow + serif title + subtitle with optional trailing action slot.
 *
 * Used at the top of every page (inside ion-content) to provide consistent
 * typographic hierarchy. Eyebrow and subtitle are optional.
 *
 * Slots:
 *   [trailing] — action placed inline-end of the title row (e.g. edit button)
 */
@Component({
  selector: 'hnch-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      @if (eyebrow()) {
        <p class="eyebrow" aria-hidden="true">{{ eyebrow() }}</p>
      }
      <div class="title-row">
        <h1 class="title">{{ title() }}</h1>
        <ng-content select="[trailing]" />
      </div>
      @if (subtitle()) {
        <p class="subtitle">{{ subtitle() }}</p>
      }
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .page-header {
        padding-block: var(--hnch-sp-6);
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-2);
      }
      .eyebrow {
        margin: 0;
        font: var(--hnch-eyebrow);
        letter-spacing: var(--hnch-eyebrow-tracking);
        text-transform: uppercase;
        color: var(--ion-color-step-600, rgba(60,60,67,0.6));
      }
      .title-row {
        display: flex;
        align-items: center;
        gap: var(--hnch-sp-3);
      }
      .title {
        margin: 0;
        font: var(--hnch-display-md);
        letter-spacing: var(--hnch-display-tracking);
        flex: 1;
      }
      .subtitle {
        margin: 0;
        font: var(--hnch-body);
        color: var(--ion-color-step-600, rgba(60,60,67,0.6));
      }
    `,
  ],
})
export class PageHeaderComponent {
  readonly eyebrow = input<string | undefined>(undefined);
  readonly title = input.required<string>();
  readonly subtitle = input<string | undefined>(undefined);
}
