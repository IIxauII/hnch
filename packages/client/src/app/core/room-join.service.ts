import { effect, inject, Injectable, Injector } from '@angular/core';
import type { JoinRejectionReason } from '@hnch/shared';
import { normalizeRoomCode, RelayRejectionError, resolveRoom } from '@hnch/shared';

import { AppPreferenceService } from './app-preference.service';
import { AvatarColorService } from './avatar-color.service';
import { DisplayNameService } from './display-name.service';
import { DocService } from './doc/doc.service';
import { ParticipantIdService } from './participant-id.service';

/**
 * How a join attempt ended.
 *
 * `'superseded'` — the session the attempt was for is no longer the one the
 * app holds: it was torn down (the user went elsewhere, the host had already
 * ended it) or replaced by another. Whoever did that owns what happens next;
 * the attempt's caller says nothing about it, and starts no navigation of
 * its own. (A guard has one to answer for: it sends that one Home.)
 */
export type JoinOutcome = 'connected' | 'timeout' | 'superseded' | JoinRejectionReason;

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
  /** See {@link JoinOutcome}: the caller does nothing. */
  | { readonly type: 'superseded' }
  | { readonly type: 'rejected'; readonly reason: JoinRejectionReason }
  | { readonly type: 'network-error' };

export interface JoinWaitOptions {
  readonly timeoutMs?: number;
  /**
   * Lets the caller give up on the attempt — it left the screen the attempt
   * was started from. The wait then settles `'superseded'`.
   */
  readonly signal?: AbortSignal;
}

/** What a rejoin goes by, besides the code. */
export interface RejoinOptions extends JoinWaitOptions {
  /** The hash this device remembers for the session, if it has one. */
  readonly passwordHash?: string;
  /**
   * The UUID this device remembers the session by. When the code resolves to
   * another one, the session is gone and the code is somebody else's.
   */
  readonly expectedUuid?: string;
}

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
  docService: Pick<DocService, 'teardown' | 'open' | 'sessionEpoch'>;
  waitForJoinOutcome: (opts?: JoinWaitOptions) => Promise<JoinOutcome>;
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
 * the session has been joined: connected and in sync.
 *
 * Closes the session it opened when it does not get into it. A session that
 * was running before is only touched once the code has resolved.
 */
export async function rejoinRoom(
  rawCode: string,
  deps: RejoinDeps,
  opts: RejoinOptions = {},
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

  // Codes are handed out again once a session has expired. The session this
  // device remembers under the code is then gone, and what answers to the
  // code now is somebody else's: not to be walked into, least of all with
  // the password of the old one.
  if (opts.expectedUuid !== undefined && resolved.uuid !== opts.expectedUuid) {
    return { type: 'unknown-room' };
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
  // Read through a function: the signal changes under the awaits, which the
  // compiler's view of `opts` does not.
  const givenUp = (): boolean => opts.signal?.aborted === true;
  // Given up on while it was getting ready: nothing has been touched yet.
  if (givenUp()) return { type: 'superseded' };

  const avatarColor = deps.getAvatarColor();
  deps.docService.open({
    room: { uuid: resolved.uuid, code },
    participantId,
    displayName: displayName ?? '',
    ...(avatarColor && { avatarColor }),
    ...(opts.passwordHash ? { passwordHash: opts.passwordHash } : {}),
    seed: { kind: 'join' },
  });

  // The session this rejoin has just opened. What it does not get into, it
  // closes again itself — and only that: by then the caller has no way of
  // telling it from a session that was there before and is still running.
  const epoch = deps.docService.sessionEpoch();
  const closeOwnSession = (): void => {
    if (deps.docService.sessionEpoch() === epoch) deps.docService.teardown();
  };

  const outcome = await deps.waitForJoinOutcome(opts);

  if (outcome === 'connected') {
    return {
      type: 'connected',
      roomCode: code,
      roomUuid: resolved.uuid,
      accessMode: 'open',
    };
  }

  if (outcome === 'timeout') {
    return { type: 'timeout' };
  }

  if (outcome === 'superseded') {
    // Given up on by the caller: the session it opened is nobody's. (When
    // the session went away by itself, there is nothing left to close.)
    if (givenUp()) closeOwnSession();
    return { type: 'superseded' };
  }

  closeOwnSession();
  if (outcome === 'unknown-room') {
    return { type: 'unknown-room' };
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
 *  4. Closing the session again when the attempt did not get into it.
 *
 * Does NOT navigate — callers decide where to go based on the returned
 * outcome. Does NOT touch the last-session cache: the pages record a
 * session once they show it, and callers decide when a failure is
 * definitive enough to forget one.
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
   * parallel rejoins that race each other's `teardown` calls.
   */
  private readonly inFlightRejoins = new Map<string, Promise<RejoinOutcome>>();

  /**
   * Attempt to (re)join a room identified by the given code.
   *
   * Resolves the code, joins the session, connects, and awaits the
   * outcome. The cache is not touched: the page that shows the session
   * records it.
   *
   * On a session that asks for a password: connects with the hash the
   * caller remembers (`opts.passwordHash`, ADR-0044), or returns
   * `{ type: 'password-required' }` when it has none, so the caller can
   * redirect to `/join?code=...`.
   *
   * On `unknown-room` / any handshake failure: returns the failure type
   * so the caller can decide whether to clear the cache and where to nav.
   *
   * Deduplicates concurrent calls for the same code — a second call
   * while the first is still in flight returns the existing promise
   * rather than racing a parallel rejoin.
   */
  async rejoin(rawCode: string, opts: RejoinOptions = {}): Promise<RejoinOutcome> {
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
        teardown: () => this.docService.teardown(),
        open: (init) => this.docService.open(init),
        sessionEpoch: this.docService.sessionEpoch,
      },
      waitForJoinOutcome: (opts) => this.waitForJoinOutcome(opts),
    };
  }

  /**
   * Await first decisive event from doc-service signals after an `open()`
   * call.
   *
   * "Connected" means connected *and synced*. The relay accepts the socket
   * before it rejects a wrong password (ADR-0035), so an open socket alone
   * is not yet an answer — settling on it sent the user into the Lobby and
   * straight back out.
   *
   * The signals it reads describe whatever session the app currently holds,
   * so the wait is tied to the one that was current when it started. Once
   * that session is gone — torn down by the user going elsewhere, by
   * `SessionEndService` finding the session already ended, or replaced by a
   * new one — the wait settles `'superseded'` rather than reporting on a
   * session it was never about.
   */
  waitForJoinOutcome(opts: JoinWaitOptions = {}): Promise<JoinOutcome> {
    const timeoutMs = opts.timeoutMs ?? 5_000;
    const epoch = this.docService.sessionEpoch();
    return new Promise((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const onAbort = (): void => settle('superseded');

      const settle = (outcome: JoinOutcome): void => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
        opts.signal?.removeEventListener('abort', onAbort);
        queueMicrotask(() => ref.destroy());
        resolve(outcome);
      };

      const ref = effect(
        () => {
          if (settled) return;
          if (this.docService.sessionEpoch() !== epoch) {
            settle('superseded');
            return;
          }
          const rejection = this.docService.lastRejection();
          if (rejection !== null) {
            settle(rejection);
            return;
          }
          if (this.docService.joined()) settle('connected');
        },
        { injector: this.injector },
      );

      if (opts.signal?.aborted === true) {
        settle('superseded');
        return;
      }
      opts.signal?.addEventListener('abort', onAbort);
      // The session can also be gone by the time the clock runs out without
      // the effect having had a turn; say so rather than "timeout".
      timeoutId = setTimeout(
        () => settle(this.docService.sessionEpoch() === epoch ? 'timeout' : 'superseded'),
        timeoutMs,
      );
    });
  }
}

// Utility

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
