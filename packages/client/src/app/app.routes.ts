import type { Routes } from '@angular/router'

/**
 * Route table for hnch v1 per roadmap.md §3 and ux.md §3.
 *
 * All seven v1 screens are lazy-loaded via `loadComponent` so the
 * initial bundle only carries the route table, the app shell, and
 * whichever page the user lands on first.
 *
 * The onboarding guard (commit #3 in the Phase 1 plan) will be wired
 * in via `canMatch` on every non-onboarding route once the display-name
 * service lands. In this commit the routes themselves are pure lazy
 * placeholders — no guard, no behavior beyond rendering a scaffold.
 */
export const routes: Routes = [
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./onboarding/onboarding.page').then((m) => m.OnboardingPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'join',
    loadComponent: () => import('./join/join.page').then((m) => m.JoinPage),
  },
  {
    path: 'lobby',
    loadComponent: () => import('./lobby/lobby.page').then((m) => m.LobbyPage),
  },
  {
    path: 'estimating',
    loadComponent: () =>
      import('./estimating/estimating.page').then((m) => m.EstimatingPage),
  },
  {
    path: 'revealed',
    loadComponent: () =>
      import('./revealed/revealed.page').then((m) => m.RevealedPage),
  },
  {
    path: 'settings',
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
