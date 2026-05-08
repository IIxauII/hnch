import { inject } from '@angular/core';
import type { CanMatchFn, GuardResult, UrlSegment } from '@angular/router';
import { Router } from '@angular/router';
import type { Route } from '@angular/router';
import { isValidRoomCode, normalizeRoomCode } from '@hnch/shared';

import { DocService } from './doc/doc.service';
import { LastSessionService } from './last-session.service';
import { RoomJoinService } from './room-join.service';
import type { RejoinOutcome } from './room-join.service';

/**
 * Dependencies shape for the pure guard logic — extracted so tests
 * can call `sessionResumeGuardLogic` directly without Angular DI.
 *
 * Uses structural/duck-typed interfaces rather than `Pick<>` so tests
 * can supply plain objects without satisfying Angular-specific types
 * (e.g. Signal vs plain function, UrlTree vs plain object).
 */
export interface SessionResumeGuardDeps {
  router: { createUrlTree(commands: unknown[], extras?: unknown): unknown };
  docService: { hasSession(): boolean; roomCode(): string | null };
  lastSessionService: { clear(): Promise<void> };
  roomJoinService: { rejoin(rawCode: string): Promise<RejoinOutcome> };
}

/**
 * Pure guard logic — no Angular DI. Exported for unit testing.
 *
 * `canMatch` guard for `/lobby/:code` and `/estimating/:code`.
 *
 * Flow:
 *  1. Extract `:code` from `segments[1]`.
 *  2. If `docService.hasSession()` is true and `roomCode()` matches → allow.
 *  3. Otherwise attempt rejoin via `RoomJoinService.rejoin()`:
 *     - `open` room → await connect; allow on success.
 *     - `password` room → redirect to `/join?code=<CODE>`.
 *     - `unknown-room` or handshake failure → clear cache, redirect to `/home`.
 *     - `timeout` → allow (WS will reconnect in background; guard gives the
 *       benefit of the doubt rather than killing the route on a slow network).
 *
 * Applied after `displayNameGuard` in the route config so we know we have
 * a display name before trying to create a session.
 */
export async function sessionResumeGuardLogic(
  deps: SessionResumeGuardDeps,
  segments: UrlSegment[],
): Promise<boolean | unknown> {
  const { router, docService, lastSessionService, roomJoinService } = deps;

  // segments[0] = 'lobby' | 'estimating', segments[1] = the code
  const rawCode = segments[1]?.path;
  if (!rawCode) {
    // Malformed URL — no code segment; redirect to home
    return router.createUrlTree(['/home']);
  }

  const code = normalizeRoomCode(rawCode);

  // Validate before touching the cache — an invalid code (typo URL) must
  // not wipe a legitimate Jump-back-in pointer for a different room.
  if (!isValidRoomCode(code)) {
    return router.createUrlTree(['/home']);
  }

  // Fast path: active session for this room already live
  if (docService.hasSession() && docService.roomCode() === code) {
    return true;
  }

  const outcome = await roomJoinService.rejoin(rawCode);

  switch (outcome.type) {
    case 'connected':
      return true;

    case 'timeout':
      // Give benefit of the doubt — the route will render with whatever
      // local state is available; the reconnecting banner handles the UX.
      return true;

    case 'password-required':
      // Cache is credential-free (ADR-0022 §3); redirect to Join page
      // which auto-fills the code and shows the password field.
      return router.createUrlTree(['/join'], { queryParams: { code } });

    case 'unknown-room':
      await lastSessionService.clear();
      return router.createUrlTree(['/home']);

    case 'rejected':
    case 'network-error':
      // On hard rejection clear cache and go home; network errors preserve
      // cache so user can retry via the Jump-back-in banner.
      if (outcome.type === 'rejected') {
        await lastSessionService.clear();
      }
      return router.createUrlTree(['/home']);
  }
}

/**
 * `canMatch` guard — thin DI shell that wires Angular services into the
 * pure `sessionResumeGuardLogic` fn.
 */
export const sessionResumeGuard: CanMatchFn = (_route: Route, segments: UrlSegment[]) => {
  return sessionResumeGuardLogic(
    {
      router: inject(Router),
      docService: inject(DocService),
      lastSessionService: inject(LastSessionService),
      roomJoinService: inject(RoomJoinService),
    },
    segments,
  ) as Promise<GuardResult>;
};
