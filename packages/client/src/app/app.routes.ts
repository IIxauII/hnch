import type { Routes } from '@angular/router'

import { displayNameGuard } from './core/display-name.guard'

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
 */
export const routes: Routes = [
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./onboarding/onboarding.page').then((m) => m.OnboardingPage),
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
  {
    path: 'lobby',
    canMatch: [displayNameGuard],
    loadComponent: () => import('./lobby/lobby.page').then((m) => m.LobbyPage),
  },
  {
    path: 'estimating',
    canMatch: [displayNameGuard],
    loadComponent: () =>
      import('./estimating/estimating.page').then((m) => m.EstimatingPage),
  },
  {
    path: 'revealed',
    canMatch: [displayNameGuard],
    loadComponent: () =>
      import('./revealed/revealed.page').then((m) => m.RevealedPage),
  },
  {
    path: 'settings',
    canMatch: [displayNameGuard],
    loadComponent: () =>
      import('./settings/settings.page').then((m) => m.SettingsPage),
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
]
