import { inject } from '@angular/core';
import type { CanMatchFn } from '@angular/router';
import { Router } from '@angular/router';

import { DisplayNameService } from './display-name.service';

/**
 * Functional guard that gates the non-onboarding routes on a persisted
 * display name. See roadmap.md Phase 1 §3.
 *
 * Flow:
 *  - If a display name is already persisted, the route matches.
 *  - If not, and the target is a `/join` deep-link, we stash the full
 *    join URL (path + query string) into `pendingJoinUrl` so Onboarding
 *    can resume into it, then redirect to `/onboarding`.
 *  - Otherwise we simply redirect to `/onboarding`.
 *
 * Applied via `canMatch` so lazy route chunks are not fetched until
 * the guard has resolved — avoids flashing a scaffold while the
 * Preferences read is in flight.
 */
export const displayNameGuard: CanMatchFn = async (_route, segments) => {
  const displayNameService = inject(DisplayNameService);
  const router = inject(Router);

  const name = await displayNameService.getDisplayName();
  if (name !== null && name.trim().length > 0) {
    return true;
  }

  const firstSegment = segments[0]?.path;
  if (firstSegment === 'join') {
    // Capture the incoming URL with its query string so onboarding can
    // resume the deep-link. `router.getCurrentNavigation()` is populated
    // while a navigation is in flight and exposes the original URL tree
    // (including query params), which UrlSegment[] alone does not.
    const nav = router.getCurrentNavigation();
    const incoming = nav?.extractedUrl ?? nav?.finalUrl;
    const url = incoming ? incoming.toString() : '/join';
    await displayNameService.setPendingJoinUrl(url);
  } else if (firstSegment === 'lobby' || firstSegment === 'estimating') {
    // Cold-install opening /lobby/:code or /estimating/:code (e.g. shared
    // link). Rewrite through /join?code=CODE so post-onboarding flow uses
    // the existing JoinPage path rather than jumping directly into the
    // session-resume guard which needs a display name to rejoin.
    const code = segments[1]?.path;
    const redirectUrl = code ? `/join?code=${encodeURIComponent(code)}` : '/join';
    await displayNameService.setPendingJoinUrl(redirectUrl);
  }

  return router.createUrlTree(['/onboarding']);
};
