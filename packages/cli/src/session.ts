/**
 * The CLI's adapter over the shared live session (#529).
 *
 * Joining a session and keeping it live — the doc, presence, the relay
 * connection, the drivers, the bound commands, teardown — is `@hnch/shared`'s
 * `live-session`, the same module the web client runs on. What stays here is
 * the CLI's own: minting a room, deriving this device's key for it, hashing a
 * password and changing a room's access (each with a terminal step between
 * the calls), the console messages, and fanning the readings out to the Ink
 * listeners.
 */

import {
  currentRound,
  FIBONACCI_SCALE,
  hashPassword,
  mintRoom,
  normalizePassword,
  openLiveSession,
  participantKeyFor,
  patchRoomAccess,
  relayRefusalReason,
  resolveRoom,
  type DocProjection,
  type HandoffResult,
  type JoinRejectionReason,
  type LiveSessionSeed,
  type ParticipantCaller,
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
import { ACCESS_REFUSAL } from './relay-refusal.js';

export interface CreateSessionOptions {
  readonly participantId: string;
  /** This device's key (ADR-0059, `CliConfig.deviceKey`). Never logged. */
  readonly deviceKey: string;
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
  /** This device's key (ADR-0059, `CliConfig.deviceKey`). Never logged. */
  readonly deviceKey: string;
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
export interface OpenSessionOptions extends Omit<JoinSessionOptions, 'password'> {
  readonly roomUuid: string;
  readonly passwordHash?: string | undefined;
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
   * The doc-only `handoffHost` is left out: {@link handoffHost} is the one.
   */
  readonly commands: CliSessionCommands;

  projection(): DocProjection;
  current(): Round | null;
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
  /**
   * Update room access mode (open or password-protected). Only the host gets
   * through (ADR-0059): anyone else is refused with
   * "Only the host can change the password".
   */
  updateAccess(mode: 'open' | 'password', password?: string): Promise<void>;
  /**
   * Hand host to `targetId`, relay first (ADR-0059): the doc changes only once
   * the relay has moved its access holder. Never rejects; a refusal says why.
   */
  handoffHost(targetId: string): Promise<HandoffResult>;

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

  /**
   * Wait, up to `capMs`, for what was written last to leave the socket —
   * before a {@link teardown} that would cut it off. Never rejects.
   */
  flushUpdates(capMs?: number): Promise<void>;
  /** Close the session here: the socket, the drivers, the doc. Writes nothing. */
  teardown(): void;
}

export async function createSession(opts: CreateSessionOptions): Promise<SessionHandle> {
  // Mint first: the room's UUID is the password's salt and the key's message.
  // A keyed create makes this device the room's access holder (ADR-0059).
  const minted = await mintRoom(opts.relayUrl, {
    creator: { participantId: opts.participantId, deviceKey: opts.deviceKey },
  });
  const caller: ParticipantCaller = {
    participantId: opts.participantId,
    pk: await participantKeyFor(opts.deviceKey, minted.uuid),
  };

  let passwordHash: string | undefined;
  // Whitespace alone is no password: the hash would be that of nothing.
  if (opts.password !== undefined && normalizePassword(opts.password) !== '') {
    passwordHash = await hashPassword(opts.password, minted.uuid);
    // Before any socket: the relay takes it from the holder while the doc is empty.
    try {
      await patchAccess(opts.relayUrl, minted.uuid, passwordHash, caller);
    } catch (err) {
      // The room exists now, open and unjoined; say so rather than only why.
      // `patchAccess` throws nothing but an `Error` with a sentence.
      const why = (err as Error).message;
      throw new Error(
        `Room ${minted.code} was created, but its password was not set: ${why}. ` +
          'The room is open to anyone with the code and was not joined. ' +
          'Run `hnch create --password` again.',
        { cause: err },
      );
    }
  }

  return open(
    {
      ...opts,
      roomCode: minted.code,
      roomUuid: minted.uuid,
      passwordHash,
    },
    caller.pk,
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
 * (ADR-0036 §6). It presents this device's key too, so a resumed host is
 * still the one the relay takes access changes from.
 */
export async function openSession(opts: OpenSessionOptions): Promise<SessionHandle> {
  const participantKey = await participantKeyFor(opts.deviceKey, opts.roomUuid);
  return open(opts, participantKey, { kind: 'join' });
}

/** {@link patchRoomAccess}, failing in words for the person at the terminal (docs/cli.md). */
async function patchAccess(
  relayUrl: string,
  roomUuid: string,
  passwordHash: string | null,
  caller: ParticipantCaller,
): Promise<void> {
  try {
    await patchRoomAccess(relayUrl, roomUuid, passwordHash, caller);
  } catch (err) {
    throw new Error(ACCESS_REFUSAL[relayRefusalReason(err)], { cause: err });
  }
}

/**
 * The commands minus the doc-only `handoffHost`, which skips the relay
 * (ADR-0059); {@link SessionHandle.handoffHost} asks the relay first.
 */
export type CliSessionCommands = Omit<SessionCommands, 'handoffHost'>;

/** `commands` without `handoffHost`, one copy per commands object. */
const withoutDocHandoff = new WeakMap<SessionCommands, CliSessionCommands>();
function cliCommands(commands: SessionCommands): CliSessionCommands {
  let stripped = withoutDocHandoff.get(commands);
  if (stripped === undefined) {
    const { handoffHost: _docOnly, ...rest } = commands;
    stripped = rest;
    withoutDocHandoff.set(commands, stripped);
  }
  return stripped;
}

function open(
  opts: Omit<OpenSessionOptions, 'deviceKey'>,
  participantKey: string,
  seed: LiveSessionSeed,
): SessionHandle {
  const { relayUrl, roomUuid } = opts;
  const changeListeners = new Set<() => void>();
  const statusListeners = new Set<(status: SyncStatus) => void>();
  const sessionEventListeners = new Set<(event: SessionEvent) => void>();
  // The first sync, once, for good.
  let joined = false;
  let markJoined = (): void => {};
  const firstSync = new Promise<void>((resolve) => {
    markJoined = resolve;
  });

  // Both are reported while the session opens, before `openLiveSession`
  // returns, so neither is ever read unset.
  let projection: DocProjection | undefined;
  let onlineIds: ReadonlySet<string> = new Set();

  const notifyChange = (): void => {
    for (const cb of changeListeners) cb();
  };

  const live = openLiveSession({
    httpBaseUrl: relayUrl,
    room: { uuid: roomUuid, code: opts.roomCode },
    credentials: {
      deviceId: opts.participantId,
      participantKey,
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
      markJoined();
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

    // Read each time: `live.commands` turns unbound at teardown.
    get commands(): CliSessionCommands {
      return cliCommands(live.commands);
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
      return firstSync;
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
      await patchAccess(relayUrl, roomUuid, passwordHash, {
        participantId: opts.participantId,
        pk: participantKey,
      });
      // So this client's own reconnects present the new hash.
      live.updateCredentials(passwordHash);
    },

    handoffHost(targetId) {
      return live.handoffHost(targetId);
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

    flushUpdates(capMs) {
      return live.flushUpdates(capMs);
    },

    teardown() {
      live.teardown();
    },
  };
}
