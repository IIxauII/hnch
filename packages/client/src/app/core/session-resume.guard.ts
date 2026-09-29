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
  lastSessionService: {
    list(opts?: {
      now?: () => number;
    }): Promise<
      Array<{ roomUuid: string; roomCode: string; passwordHash?: string; lastScreen?: string }>
    >;
    clearPasswordHash(roomUuid: string): Promise<void>;
    removeByUuid(roomUuid: string): Promise<void>;
    setPendingPasswordHash(roomUuid: string, passwordHash: string): void;
    /** @deprecated back-compat — still used if no uuid available */
    clearAll(): Promise<void>;
  };
  roomJoinService: {
    rejoin(rawCode: string, opts?: { passwordHash?: string }): Promise<RejoinOutcome>;
  };
}

/**
 * Pure guard logic — no Angular DI. Exported for unit testing.
 *
 * `canMatch` guard for `/lobby/:code` and `/estimating/:code`.
 *
 * Flow:
 *  1. Extract `:code` from `segments[1]`.
 *  2. If `docService.hasSession()` is true and `roomCode()` matches → allow.
 *  3. Look up cached entry for this code to find a stored `passwordHash`.
 *  4. Attempt rejoin via `RoomJoinService.rejoin()`:
 *     - `open` room → await connect; allow on success.
 *     - `password` room (no cached hash) → redirect to `/join?code=<CODE>`.
 *     - `password` room (cached hash) → attempt with hash; on relay `4002`
 *       (wrong-password) → `clearPasswordHash`, redirect to `/join?code=…`.
 *     - `unknown-room` or handshake failure → removeByUuid, redirect to `/home`.
 *     - `timeout` → allow (WS will reconnect in background; guard gives the
 *       benefit of the doubt rather than killing the route on a slow network).
 *     - `superseded` → redirect to `/home`; the session is gone.
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
  // not wipe a legitimate "Jump back in" entry for a different session.
  if (!isValidRoomCode(code)) {
    return router.createUrlTree(['/home']);
  }

  // Fast path: active session for this room already live
  if (docService.hasSession() && docService.roomCode() === code) {
    return true;
  }

  // Look up cached entry to find a stored passwordHash (ADR-0044)
  const entries = await lastSessionService.list();
  const cached = entries.find((e) => normalizeRoomCode(e.roomCode) === code);
  const passwordHash = cached?.passwordHash;

  const outcome = await roomJoinService.rejoin(rawCode, passwordHash ? { passwordHash } : {});

  switch (outcome.type) {
    case 'connected':
      // If we used a cached passwordHash to connect, ensure it survives the
      // next recordJoin call from the lobby/estimating page effect.
      if (passwordHash && cached) {
        lastSessionService.setPendingPasswordHash(cached.roomUuid, passwordHash);
      }
      return true;

    case 'timeout':
      // Give benefit of the doubt — the route will render with whatever
      // local state is available; the reconnecting banner handles the UX.
      return true;

    case 'superseded':
      // The session was torn down while this was waiting on it — the host
      // had already ended it, say. Whoever tore it down has told the user
      // and is sending them on; there is nothing to show here.
      return router.createUrlTree(['/home']);

    case 'password-required':
      // No cached hash; redirect to Join page which auto-fills the code
      // and shows the password field.
      return router.createUrlTree(['/join'], { queryParams: { code } });

    case 'unknown-room':
      if (cached) {
        await lastSessionService.removeByUuid(cached.roomUuid);
      } else {
        await lastSessionService.clearAll();
      }
      return router.createUrlTree(['/home']);

    case 'rejected':
      // `wrong-password` (4002): clear only the hash; retain other entry fields.
      // User is sent to Join page to re-enter the password.
      if (outcome.reason === 'wrong-password' && cached) {
        await lastSessionService.clearPasswordHash(cached.roomUuid);
        return router.createUrlTree(['/join'], { queryParams: { code } });
      }
      // Other hard rejections — remove entry and go home
      if (cached) {
        await lastSessionService.removeByUuid(cached.roomUuid);
      }
      return router.createUrlTree(['/home']);

    case 'network-error':
      // Preserve cache; let user retry from Home's "Jump back in" list.
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
