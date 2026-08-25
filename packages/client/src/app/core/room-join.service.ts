import { effect, inject, Injectable, Injector } from '@angular/core';
import type { JoinRejectionReason } from '@hnch/shared';
import { normalizeRoomCode, RelayRejectionError, resolveRoom } from '@hnch/shared';

import { AppPreferenceService } from './app-preference.service';
import { AvatarColorService } from './avatar-color.service';
import { DisplayNameService } from './display-name.service';
import { DocService } from './doc/doc.service';
import { ParticipantIdService } from './participant-id.service';

export type JoinOutcome = 'connected' | 'timeout' | JoinRejectionReason;

export interface RejoinResult {
  readonly type: 'connected';
  readonly roomCode: string;
  readonly roomUuid: string;
  readonly accessMode: 'open';
}

export type RejoinOutcome =
  | RejoinResult
  | { readonly type: 'password-required'; readonly roomCode: string }
  | { readonly type: 'unknown-room' }
  | { readonly type: 'timeout' }
  | { readonly type: 'rejected'; readonly reason: JoinRejectionReason }
  | { readonly type: 'network-error' };

/**
 * Dependencies for the pure `rejoinRoom` function — extracted so the logic
 * can be tested without Angular DI overhead.
 */
export interface RejoinDeps {
  /** Resolved relay HTTP URL — override folded in by the caller. */
  relayHttpUrl: string;
  getDisplayName: () => Promise<string | null>;
  getParticipantId: () => Promise<string>;
  /** Avatar color wire value (ADR-0043). Null = "no value set yet". */
  getAvatarColor: () => string | null;
  docService: Pick<DocService, 'endSession' | 'joinSession' | 'connect'>;
  waitForJoinOutcome: (opts?: { timeoutMs?: number }) => Promise<JoinOutcome>;
}

/**
 * Pure rejoin logic — extracted so tests can call it without constructing
 * the Angular service and triggering DI.
 *
 * Responsible for:
 *  1. Resolving a room code via `GET /rooms/:code`.
 *  2. Creating a doc session and opening the WebSocket.
 *  3. Waiting for the first decisive connection outcome.
 *
 * Does NOT record the last-session cache — that is the responsibility of
 * the in-component effect (lobby/estimating constructor) which fires once
 * the WS reaches `connected` state.
 */
export async function rejoinRoom(
  rawCode: string,
  deps: RejoinDeps,
  opts: { timeoutMs?: number; passwordHash?: string } = {},
): Promise<RejoinOutcome> {
  const code = normalizeRoomCode(rawCode);

  let resolved: { uuid: string; accessMode: string };
  try {
    resolved = await resolveRoom(deps.relayHttpUrl, code);
  } catch (err) {
    if (err instanceof RelayRejectionError && err.reason === 'unknown-room') {
      return { type: 'unknown-room' };
    }
    // Network failure or unexpected 5xx: treat as network error, not as
    // a definitive "room gone" so the caller can retry or fall through.
    return { type: 'network-error' };
  }

  // If room is password-protected and we have no cached hash, prompt the user.
  // If we have a cached hash, proceed and let the relay reject with 4002 if wrong.
  if (resolved.accessMode === 'password' && !opts.passwordHash) {
    return { type: 'password-required', roomCode: code };
  }

  const [displayName, participantId] = await Promise.all([
    deps.getDisplayName(),
    deps.getParticipantId(),
  ]);

  const avatarColor = deps.getAvatarColor();
  deps.docService.endSession();
  deps.docService.joinSession({
    participantId,
    displayName: displayName ?? '',
    roomCode: code,
    ...(avatarColor && { avatarColor }),
  });
  deps.docService.connect(
    {
      roomCode: code,
      deviceId: participantId,
      ...(opts.passwordHash ? { passwordHash: opts.passwordHash } : {}),
    },
    { roomUuid: resolved.uuid },
  );

  const outcome = await deps.waitForJoinOutcome(opts);

  if (outcome === 'connected') {
    return {
      type: 'connected',
      roomCode: code,
      roomUuid: resolved.uuid,
      accessMode: 'open',
    };
  }

  if (outcome === 'unknown-room') {
    return { type: 'unknown-room' };
  }

  if (outcome === 'timeout') {
    return { type: 'timeout' };
  }

  return { type: 'rejected', reason: outcome };
}

/**
 * Shared rejoin logic extracted from `HomePage.onResumeJumpBack` so
 * both the Home banner and the `sessionResumeGuard` call the same code
 * path without duplication.
 *
 * Responsible for:
 *  1. Resolving a room code via `GET /rooms/:code`.
 *  2. Creating a doc session and opening the WebSocket.
 *  3. Waiting for the first decisive connection outcome.
 *  4. Recording the last-session cache on success.
 *
 * Does NOT navigate — callers decide where to go based on the returned
 * outcome. Does NOT clear the cache — callers decide when a failure is
 * definitive enough to clear.
 */
@Injectable({ providedIn: 'root' })
export class RoomJoinService {
  private readonly appPrefs = inject(AppPreferenceService);
  private readonly avatarColorService = inject(AvatarColorService);
  private readonly displayNameService = inject(DisplayNameService);
  private readonly participantIdService = inject(ParticipantIdService);
  private readonly docService = inject(DocService);
  private readonly injector = inject(Injector);

  /**
   * In-flight rejoin promises keyed by normalized room code.
   * Prevents two rapid navigations to the same code from running
   * parallel rejoins that race each other's `endSession` calls.
   */
  private readonly inFlightRejoins = new Map<string, Promise<RejoinOutcome>>();

  /**
   * Attempt to (re)join a room identified by the given code.
   *
   * On `open` rooms: resolves the code, joins the session, connects,
   * awaits the outcome, and refreshes the last-session cache on success.
   *
   * On `password` rooms: returns `{ type: 'password-required' }` so the
   * caller can redirect to `/join?code=...`. The cache is intentionally
   * credential-free (ADR-0022 §3).
   *
   * On `unknown-room` / any handshake failure: returns the failure type
   * so the caller can decide whether to clear the cache and where to nav.
   *
   * Deduplicates concurrent calls for the same code — a second call
   * while the first is still in flight returns the existing promise
   * rather than racing a parallel rejoin.
   */
  async rejoin(
    rawCode: string,
    opts: { timeoutMs?: number; passwordHash?: string } = {},
  ): Promise<RejoinOutcome> {
    const key = normalizeRoomCode(rawCode);
    return dedupRejoin(this.inFlightRejoins, key, () => rejoinRoom(rawCode, this.makeDeps(), opts));
  }

  private makeDeps(): RejoinDeps {
    return {
      relayHttpUrl: this.appPrefs.resolvedRelayHttpUrl(),
      getDisplayName: () => this.displayNameService.getDisplayName(),
      getParticipantId: () => this.participantIdService.getOrCreateId(),
      getAvatarColor: () => this.avatarColorService.value(),
      docService: {
        endSession: () => this.docService.endSession(),
        joinSession: (init) => this.docService.joinSession(init),
        connect: (creds, opts) => this.docService.connect(creds, opts),
      },
      waitForJoinOutcome: (opts) => this.waitForJoinOutcome(opts),
    };
  }

  /**
   * Await first decisive event from doc-service signals after a connect()
   * call. Mirrors the same pattern in `home.page.ts`.
   */
  waitForJoinOutcome(opts: { timeoutMs?: number } = {}): Promise<JoinOutcome> {
    const timeoutMs = opts.timeoutMs ?? 5_000;
    return new Promise((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const settle = (outcome: JoinOutcome): void => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
        queueMicrotask(() => ref.destroy());
        resolve(outcome);
      };

      const ref = effect(
        () => {
          if (settled) return;
          const rejection = this.docService.lastRejection();
          if (rejection !== null) {
            settle(rejection);
            return;
          }
          const status = this.docService.syncStatus();
          if (status === 'connected') settle('connected');
        },
        { injector: this.injector },
      );

      timeoutId = setTimeout(() => settle('timeout'), timeoutMs);
    });
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Assert that `code` is non-null at call time. Throws a descriptive error
 * if it is null, which indicates a programming error (navigation called
 * without an active session).
 *
 * Usage: `const code = assertRoomCode(docService.roomCode(), 'lobby.softExit')`
 */
export function assertRoomCode(code: string | null, where: string): asserts code is string {
  if (code === null) {
    throw new Error(`${where}: docService.roomCode() is null — no active session`);
  }
}

/**
 * Pure dedup helper — separated from Angular DI so it can be unit tested.
 *
 * Given an `inFlight` map and a factory that produces the underlying
 * promise for `key`, ensures only one in-flight promise exists per key
 * at any time. The map entry is removed once the promise settles.
 *
 * @param inFlight - Mutable map keyed by normalised room code.
 * @param key      - Normalised room code (the dedup key).
 * @param factory  - Called exactly once to produce the underlying promise.
 */
export function dedupRejoin(
  inFlight: Map<string, Promise<RejoinOutcome>>,
  key: string,
  factory: () => Promise<RejoinOutcome>,
): Promise<RejoinOutcome> {
  const existing = inFlight.get(key);
  if (existing !== undefined) return existing;

  const promise = factory().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
