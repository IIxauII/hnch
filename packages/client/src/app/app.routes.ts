import type { Routes } from '@angular/router';

import { displayNameGuard } from './core/display-name.guard';
import { sessionResumeGuard } from './core/session-resume.guard';

/**
 * Route table for hnch v1 per roadmap.md §3 and ux.md §3.
 *
 * All seven v1 screens are lazy-loaded via `loadComponent` so the
 * initial bundle only carries the route table, the app shell, and
 * whichever page the user lands on first.
 *
 * `displayNameGuard` gates every non-onboarding route. It resolves
 * before the lazy chunk is fetched, so an un-onboarded user never
 * downloads a page they cannot yet use — they bounce to /onboarding,
 * and a /join deep-link is remembered for resumption post-onboarding.
 *
 * In-session routes (`lobby/:code`, `estimating/:code`) additionally
 * run `sessionResumeGuard` which restores the Yjs session from the
 * URL code on reload, so a page refresh lands back in-room rather than
 * dropping the user on Home.
 *
 * Legacy parameterless variants (`lobby`, `estimating`) redirect to
 * `/home` so old bookmarks fall through to Home's "Jump back in" list
 * instead of 404-ing.
 */
export const routes: Routes = [
  {
    path: 'onboarding',
    loadComponent: () => import('./onboarding/onboarding.page').then((m) => m.OnboardingPage),
  },
  {
    path: 'home',
    canMatch: [displayNameGuard],
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'join',
    canMatch: [displayNameGuard],
    loadComponent: () => import('./join/join.page').then((m) => m.JoinPage),
  },
  // Parameterized in-session routes (canonical) — code in the URL enables
  // session restore on reload via sessionResumeGuard.
  {
    path: 'lobby/:code',
    canMatch: [displayNameGuard, sessionResumeGuard],
    loadComponent: () => import('./lobby/lobby.page').then((m) => m.LobbyPage),
  },
  {
    path: 'estimating/:code',
    canMatch: [displayNameGuard, sessionResumeGuard],
    loadComponent: () => import('./estimating/estimating.page').then((m) => m.EstimatingPage),
  },
  // Legacy parameterless variants — redirect to home so old bookmarks
  // fall through to Home's "Jump back in" list rather than 404-ing.
  {
    path: 'lobby',
    redirectTo: 'home',
  },
  {
    path: 'estimating',
    redirectTo: 'home',
  },
  {
    path: 'settings',
    canMatch: [displayNameGuard],
    loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
