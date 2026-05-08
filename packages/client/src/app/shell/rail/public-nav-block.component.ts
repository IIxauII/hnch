import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Shared nav block used by both rail-public and rail-session.
 * Renders the wordmark + Home/Settings nav rows.
 */
@Component({
  selector: 'hnch-public-nav-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="pnb">
      <div class="pnb-wordmark" aria-label="hnch">hnch</div>
      <nav class="pnb-nav" aria-label="Main navigation">
        <a
          routerLink="/home"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: false }"
          aria-label="Home"
          class="pnb-nav-item"
        >
          Home
        </a>
        <a
          routerLink="/settings"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: false }"
          aria-label="Settings"
          class="pnb-nav-item"
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
      }

      .pnb {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-3, 12px);
      }

      .pnb-wordmark {
        font: var(--hnch-display-md);
        letter-spacing: var(--hnch-display-tracking);
        color: var(--ion-text-color);
        line-height: 1;
      }

      .pnb-nav {
        display: flex;
        flex-direction: column;
        gap: var(--hnch-sp-2, 8px);
      }

      .pnb-nav-item {
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
export class PublicNavBlockComponent {}
