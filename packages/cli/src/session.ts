/**
 * The CLI's adapter over the shared live session (#529).
 *
 * Joining a session and keeping it live — the doc, presence, the relay
 * connection, the drivers, the bound commands, teardown — is `@hnch/shared`'s
 * `live-session`, the same module the web client runs on. What stays here is
 * the CLI's own: minting a room, hashing a password and changing a room's
 * access (each with a terminal step between the calls), the console messages,
 * and fanning the readings out to the Ink listeners.
 */

import {
  currentRound,
  FIBONACCI_SCALE,
  hashPassword,
  mintRoom,
  normalizePassword,
  openLiveSession,
  patchRoomAccess,
  resolveRoom,
  type DocProjection,
  type JoinRejectionReason,
  type LiveSessionSeed,
  type PatchRoundDescriptorInit,
  type Round,
  type Scale,
  type SessionCommands,
  type SessionEvent,
  type SyncStatus,
  type WebSocketConstructorLike,
} from '@hnch/shared';
import WebSocket from 'ws';
import { validatePassword } from './password-validation.js';

export interface CreateSessionOptions {
  readonly participantId: string;
  readonly displayName: string;
  readonly relayUrl: string;
  readonly sessionName?: string | undefined;
  readonly password?: string | undefined;
  readonly defaultScale?: Scale | undefined;
  readonly onRejection?: ((reason: JoinRejectionReason) => void) | undefined;
  /** Avatar color wire value (ADR-0043). Pre-validated by caller. */
  readonly avatarColor?: string | undefined;
}

export interface JoinSessionOptions {
  readonly participantId: string;
  readonly displayName: string;
  readonly relayUrl: string;
  readonly roomCode: string;
  readonly password?: string | undefined;
  readonly onRejection?: ((reason: JoinRejectionReason) => void) | undefined;
  /** Avatar color wire value (ADR-0043). Pre-validated by caller. */
  readonly avatarColor?: string | undefined;
}

/**
 * Join a room already in hand — remembered by `hnch resume`, or by an
 * `hnch agenda` command — with the hash remembered for it.
 */
export interface OpenSessionOptions {
  readonly participantId: string;
  readonly displayName: string;
  readonly relayUrl: string;
  readonly roomCode: string;
  readonly roomUuid: string;
  readonly passwordHash?: string | undefined;
  readonly onRejection?: ((reason: JoinRejectionReason) => void) | undefined;
  /** Avatar color wire value (ADR-0043). Pre-validated by caller. */
  readonly avatarColor?: string | undefined;
}

export interface SessionHandle {
  readonly roomCode: string;
  readonly roomUuid: string;
  /**
   * The hash the connection was first made with, for the caller to remember
   * (ADR-0044). `undefined` for a session that was open at the time.
   */
  readonly passwordHash: string | undefined;
  /**
   * The session commands, bound to this session (#516). Every write the TUI
   * makes goes through them — or through the two patches below, which carry
   * their own gate — so every write meets its rule. Refuse once torn down.
   */
  readonly commands: SessionCommands;

  /** The latest projection. */
  projection(): DocProjection;
  /** Current round (or null). */
  current(): Round | null;
  /** Whether this client is the host. */
  isHost(): boolean;
  /**
   * Whether the session has been got into at least once: the relay's state
   * has applied on a socket. A socket that is merely up says nothing — the
   * relay takes it before it turns a wrong password away (ADR-0035).
   */
  hasJoined(): boolean;
  /** Resolves when {@link hasJoined} first turns true. */
  whenJoined(): Promise<void>;
  /** Participant ids present on the relay. */
  onlineIds(): ReadonlySet<string>;

  /** Update a round's title and/or description. */
  updateRoundDescriptor(roundId: string, fields: PatchRoundDescriptorInit): void;
  /** Update the room name. Pass undefined to remove. */
  updateName(name?: string): void;
  /** Update the default estimation scale. */
  updateScale(scale: Scale): void;
  /** Update room access mode (open or password-protected). */
  updateAccess(mode: 'open' | 'password', password?: string): Promise<void>;

  /** Subscribe to projection and online-set changes. Returns unsubscribe fn. */
  onChange(cb: () => void): () => void;
  /** Subscribe to sync status changes. Returns unsubscribe fn. */
  onStatusChange(cb: (status: SyncStatus) => void): () => void;
  /**
   * Subscribe to the session events driver: ended, host changed, removed —
   * each once, with the text to print already written. Delivered a microtask
   * after the doc change, never inside it; no replay. Returns unsubscribe.
   */
  onSessionEvent(listener: (event: SessionEvent) => void): () => void;

  /** Close the session here: the socket, the drivers, the doc. Writes nothing. */
  teardown(): void;
}

export async function createSession(opts: CreateSessionOptions): Promise<SessionHandle> {
  // Mint first: the room's UUID is the password's salt.
  const minted = await mintRoom(opts.relayUrl);

  let passwordHash: string | undefined;
  // Whitespace alone is no password: the hash would be that of nothing.
  if (opts.password !== undefined && normalizePassword(opts.password) !== '') {
    passwordHash = await hashPassword(opts.password, minted.uuid);
    await patchRoomAccess(opts.relayUrl, minted.uuid, passwordHash);
  }

  return open(
    {
      ...opts,
      roomCode: minted.code,
      roomUuid: minted.uuid,
      passwordHash,
    },
    {
      kind: 'create',
      defaultScale: opts.defaultScale ?? FIBONACCI_SCALE,
      sessionName: opts.sessionName,
    },
  );
}

export async function joinSession(opts: JoinSessionOptions): Promise<SessionHandle> {
  const resolved = await resolveRoom(opts.relayUrl, opts.roomCode);

  let passwordHash: string | undefined;
  if (resolved.accessMode === 'password') {
    if (opts.password === undefined || normalizePassword(opts.password) === '') {
      throw new Error('Room requires a password');
    }
    passwordHash = await hashPassword(opts.password, resolved.uuid);
  }

  return openSession({ ...opts, roomUuid: resolved.uuid, passwordHash });
}

/**
 * A join like {@link joinSession}'s, for a room already resolved: the same
 * seed, so the same `rejoin` after the first sync clears a stale `leftAt`
 * (ADR-0036 §6).
 */
export function openSession(opts: OpenSessionOptions): SessionHandle {
  return open(opts, { kind: 'join' });
}

function open(opts: OpenSessionOptions, seed: LiveSessionSeed): SessionHandle {
  const { relayUrl, roomUuid } = opts;
  const changeListeners = new Set<() => void>();
  const statusListeners = new Set<(status: SyncStatus) => void>();
  const sessionEventListeners = new Set<(event: SessionEvent) => void>();
  const joinedWaiters: Array<() => void> = [];

  // Both are reported while the session opens, before `openLiveSession`
  // returns, so neither is ever read unset.
  let projection: DocProjection | undefined;
  let onlineIds: ReadonlySet<string> = new Set();
  let joined = false;

  const notifyChange = (): void => {
    for (const cb of changeListeners) cb();
  };

  const live = openLiveSession({
    httpBaseUrl: relayUrl,
    room: { uuid: roomUuid, code: opts.roomCode },
    credentials: {
      deviceId: opts.participantId,
      ...(opts.passwordHash !== undefined && { passwordHash: opts.passwordHash }),
    },
    self: {
      participantId: opts.participantId,
      displayName: opts.displayName,
      ...(opts.avatarColor !== undefined && { avatarColor: opts.avatarColor }),
    },
    seed,
    WebSocketPolyfill: WebSocket as unknown as WebSocketConstructorLike,
    onProjectionChange(next) {
      projection = next;
      notifyChange();
    },
    onOnlineIdsChange(next) {
      onlineIds = next;
      notifyChange();
    },
    onStatusChange(status) {
      for (const cb of statusListeners) cb(status);
    },
    onRejectionChange(reason) {
      if (reason === null) return;
      console.error(`Connection rejected: ${reason}`);
      opts.onRejection?.(reason);
    },
    // Otherwise "still retrying" and "hung" look the same from the terminal.
    onRepeatRejection() {
      console.error('Trouble reaching the room — retrying.');
    },
    onFirstSync() {
      joined = true;
      for (const resolve of joinedWaiters.splice(0)) resolve();
    },
    onSessionEvent(event) {
      for (const listener of sessionEventListeners) listener(event);
    },
  });

  function latest(): DocProjection {
    if (projection === undefined) throw new Error('session: no projection reported');
    return projection;
  }

  return {
    roomCode: opts.roomCode,
    roomUuid,
    passwordHash: opts.passwordHash,

    get commands(): SessionCommands {
      return live.commands;
    },

    projection: latest,

    current() {
      return currentRound(latest());
    },

    isHost() {
      return latest().settings.hostParticipantId === opts.participantId;
    },

    hasJoined() {
      return joined;
    },

    whenJoined() {
      if (joined) return Promise.resolve();
      return new Promise<void>((resolve) => {
        joinedWaiters.push(resolve);
      });
    },

    onlineIds() {
      return onlineIds;
    },

    updateRoundDescriptor(roundId, fields) {
      live.updateRoundDescriptor(roundId, fields);
    },

    updateName(name) {
      // An undefined value deletes the key. The cast is needed because
      // exactOptionalPropertyTypes rejects an explicit undefined here.
      live.updateSettings({ name } as { name?: string });
    },

    updateScale(scale) {
      live.updateSettings({ defaultScale: scale });
    },

    async updateAccess(mode, password) {
      let passwordHash: string | null = null;
      if (mode === 'password') {
        // Same rule as every other password entry point (`validatePassword`):
        // blank after normalization or over the length cap both refuse.
        const validated = validatePassword(password ?? '');
        if (!validated.ok) {
          throw new Error(validated.message);
        }
        passwordHash = await hashPassword(validated.password, roomUuid);
      }
      await patchRoomAccess(relayUrl, roomUuid, passwordHash);
      // So this client's own reconnects present the new hash.
      live.updateCredentials(passwordHash);
    },

    onChange(cb) {
      changeListeners.add(cb);
      return () => changeListeners.delete(cb);
    },

    onStatusChange(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },

    onSessionEvent(listener) {
      sessionEventListeners.add(listener);
      return () => {
        sessionEventListeners.delete(listener);
      };
    },

    teardown() {
      live.teardown();
    },
  };
}
