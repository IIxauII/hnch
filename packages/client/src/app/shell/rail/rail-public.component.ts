import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Public rail content: wordmark + Home/Settings nav.
 * Rendered when ShellMode is 'public'.
 */
@Component({
  selector: 'hnch-rail-public',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="rail-public">
      <div class="rail-wordmark" aria-label="hnch">hnch</div>
      <div class="rail-eyebrow" aria-hidden="true">PUBLIC</div>
      <nav class="rail-nav" aria-label="Main navigation">
        <a
          routerLink="/home"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: false }"
          aria-label="Home"
          class="rail-nav-item"
        >
          Home
        </a>
        <a
          routerLink="/settings"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: false }"
          aria-label="Settings"
          class="rail-nav-item"
        >
          Settings
        </a>
      </nav>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .rail-public {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-3, 12px);
        padding: var(--hnch-sp-5, 24px) var(--hnch-sp-4, 16px);
        height: 100%;
      }

      .rail-wordmark {
        font: var(--hnch-display-md);
        letter-spacing: var(--hnch-display-tracking);
        color: var(--ion-text-color);
        line-height: 1;
      }

      .rail-eyebrow {
        font: var(--hnch-eyebrow);
        letter-spacing: var(--hnch-eyebrow-tracking);
        color: var(--ion-color-step-600);
        text-transform: uppercase;
        margin-bottom: var(--hnch-sp-1, 4px);
      }

      .rail-nav {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-2, 8px);
      }

      .rail-nav-item {
        display: block;
        padding: var(--hnch-sp-2, 8px) var(--hnch-sp-3, 12px);
        border-radius: var(--hnch-r-sm, 10px);
        font: var(--hnch-body);
        color: var(--ion-text-color);
        text-decoration: none;
        transition: background 150ms ease;

        &:hover {
          background: var(--ion-color-step-100);
        }

        &.active {
          background: var(--ion-color-step-100);
          color: var(--ion-color-primary);
          font-weight: 600;
        }
      }
    `,
  ],
})
export class RailPublicComponent {}
