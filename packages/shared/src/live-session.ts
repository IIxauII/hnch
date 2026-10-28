/**
 * Live session — one peer's live session, owned once for both surfaces (#529).
 *
 * Joining a session and keeping it live used to be wired twice: in the web
 * client's `DocService` and in the CLI's session module. Each copy built the
 * doc and presence, connected through `relay-client`, ran `rejoin` on the
 * first sync, observed the doc, bound the session commands, started the
 * drivers, gated presence on the sync state (ADR-0050) and tore it all down
 * again — and the copies drifted. This module is the one place that sequence
 * lives. Both surfaces are adapters over it: they mirror what it reports and
 * add only what is theirs (signals, the IndexedDB load and the session epoch
 * on the client; room minting, password hashing and Ink on the CLI).
 *
 * **Not a driver.** A driver is handed a *reading* of the doc and owns when a
 * rule re-evaluates. A live session is handed nothing of the sort: it builds
 * and owns the `Y.Doc` and the connection, like `relay-client`, and it is
 * what supplies the drivers' adapters. Framework-free all the same — readings
 * leave through callbacks, and no Angular, Ink or toast primitive crosses
 * the seam.
 *
 * **Readings** leave through the `on*` callbacks given to
 * {@link openLiveSession}, one listener per session (the surface's adapter),
 * as with `connectToRelay`. Some arrive before `openLiveSession` returns: the
 * first projection and online set are reported as soon as change tracking
 * starts, so an adapter's mirror is never empty. None arrive after
 * {@link LiveSession.teardown}.
 *
 * **Acts** are the handle's members. Its close act is `teardown()`: destroy
 * the doc, stop the drivers, drop the command set, write nothing.
 */

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import type { JoinCredentials, JoinRejectionReason } from './auth.js';
import { startAutoReveal } from './auto-reveal.js';
import {
  DOC_AGENDA_KEY,
  DOC_META_KEY,
  DOC_PARTICIPANTS_KEY,
  DOC_ROUNDS_KEY,
  DOC_SETTINGS_KEY,
  initDoc,
  joinDoc,
  patchRoundDescriptor,
  patchSettings,
  projectDoc,
  type DocProjection,
  type PatchRoundDescriptorInit,
  type PublicSettingsPatch,
} from './doc-projection.js';
import type { Scale } from './doc.js';
import { startElection } from './election.js';
import {
  connectToRelay,
  type RelayConnection,
  type SyncStatus,
  type WebSocketConstructorLike,
} from './relay-client.js';
import { promoteHost, rejoin } from './roster-commands.js';
import {
  bindSessionCommands,
  UNBOUND_SESSION_COMMANDS,
  type SessionCommands,
} from './session-commands.js';
import { startSessionEvents, type SessionEvent } from './session-events.js';

// ---------------------------------------------------------------------------
// Presence shape
// ---------------------------------------------------------------------------

/**
 * Awareness field name carrying a peer's `participantId`. The awareness
 * channel is a client-side transport detail — the relay is content-blind
 * (ADR-0001) and never reads it — but every peer must agree on the key, and
 * the writer must agree with {@link onlineIdsFrom}, so it is named once here.
 */
export const AWARENESS_PARTICIPANT_ID_FIELD = 'participantId';

/**
 * Extract the set of online participantIds from a raw awareness state map
 * (`Awareness.getStates()`).
 *
 * Entries with a missing or non-string `participantId` are skipped: a peer
 * that has connected but not yet published its local state is not online.
 */
export function onlineIdsFrom(states: ReadonlyMap<number, unknown>): Set<string> {
  const ids = new Set<string>();
  for (const state of states.values()) {
    if (typeof state !== 'object' || state === null) continue;
    const value = (state as Record<string, unknown>)[AWARENESS_PARTICIPANT_ID_FIELD];
    if (typeof value === 'string') ids.add(value);
  }
  return ids;
}

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/** A room the relay has already issued: minted, or resolved from its code. */
export interface LiveSessionRoom {
  /** The UUID the doc travels under (ADR-0016). */
  readonly uuid: string;
  /** The 6-character code (ADR-0008), sent with every handshake. */
  readonly code: string;
}

/** What the connection presents itself with (ADR-0016). */
export interface LiveSessionCredentials {
  readonly deviceId: string;
  /** Present for a password-protected room (ADR-0017). */
  readonly passwordHash?: string | undefined;
}

/** Who this peer is in the session. */
export interface LiveSessionSelf {
  /**
   * "Me" for everything the session does: the commands' actor, the
   * election's caller and auto-reveal's self. Bound by value — it is fixed
   * for the session's life.
   */
  readonly participantId: string;
  readonly displayName: string;
  /** Avatar colour wire value (ADR-0043), pre-validated by the caller. */
  readonly avatarColor?: string | undefined;
}

/**
 * How the doc is seeded. `create` writes the whole initial doc and makes this
 * peer the host; `join` writes only this peer's own record, so the settings,
 * meta and host arrive from the relay without a merge conflict.
 */
export type LiveSessionSeed =
  | {
      readonly kind: 'create';
      readonly defaultScale: Scale;
      readonly sessionName?: string | undefined;
    }
  | { readonly kind: 'join' };

/**
 * The readings a live session reports, each to one listener. All optional; a
 * surface binds the ones it shows.
 */
export interface LiveSessionReadings {
  /** The doc changed, in any of its five top-level containers. */
  readonly onProjectionChange?: ((projection: DocProjection) => void) | undefined;
  /** The set of participant ids present on the relay changed. */
  readonly onOnlineIdsChange?: ((onlineIds: ReadonlySet<string>) => void) | undefined;
  /** The socket's status, as `relay-client` reports it. Starts at `connecting`. */
  readonly onStatusChange?: ((status: SyncStatus) => void) | undefined;
  /** The relay turned the connection away for good, or `null` once it takes it again. */
  readonly onRejectionChange?: ((reason: JoinRejectionReason | null) => void) | undefined;
  /** A connection that had been up is down and being retried. */
  readonly onReconnectingChange?: ((reconnecting: boolean) => void) | undefined;
  /** Repeated transient closes: the surface's cue to say it is still trying. */
  readonly onRepeatRejection?: (() => void) | undefined;
  /**
   * Whether the relay's state has applied on the *current* socket — the only
   * time the online set can be believed (ADR-0050).
   */
  readonly onSyncedChange?: ((synced: boolean) => void) | undefined;
  /** The relay's state applied for the first time. Once per session. */
  readonly onFirstSync?: (() => void) | undefined;
  /**
   * This peer's unanimous auto-reveal write applied (ADR-0018) — not a lost
   * race, and not a reveal by someone else. The client keys a haptic off it.
   */
  readonly onAutoReveal?: (() => void) | undefined;
  /**
   * The session events driver's events: ended, host changed, removed — each
   * once, with the text to show already written. Delivered a microtask after
   * the doc change that raised them, never inside it.
   */
  readonly onSessionEvent?: ((event: SessionEvent) => void) | undefined;
}

export interface OpenLiveSessionOptions extends LiveSessionReadings {
  /** The relay's **http** base URL; `relay-client` derives the ws form. */
  readonly httpBaseUrl: string;
  readonly room: LiveSessionRoom;
  readonly credentials: LiveSessionCredentials;
  readonly self: LiveSessionSelf;
  readonly seed: LiveSessionSeed;
  /**
   * Awaited after the doc is seeded and tracked, before the socket opens. The
   * client loads its IndexedDB snapshot into the doc here, so cached state
   * shows before the relay answers (ADR-0004).
   */
  readonly beforeConnect?: ((doc: Y.Doc) => Promise<void>) | undefined;
  /** A `WebSocket` implementation for runtimes without one worth using (Node). */
  readonly WebSocketPolyfill?: WebSocketConstructorLike | undefined;
  /** Clock for the seed's timestamps and the commands. Defaults to `Date.now`. */
  readonly now?: (() => number) | undefined;
}

/** One peer's live session. Readings leave through the callbacks; this is what it does. */
export interface LiveSession {
  /** The session commands bound to this session; `UNBOUND_SESSION_COMMANDS` after teardown. */
  readonly commands: SessionCommands;
  /**
   * Present a new password hash from now on, `null` for an open room — after
   * the host changes the room's access, so this peer's own connection keeps
   * working across reconnects (ADR-0017). Before the socket has opened, it
   * opens with this.
   */
  updateCredentials(passwordHash: string | null): void;
  /**
   * Patch the session settings. Not a command: the narrowed patch type is its
   * gate — a host change goes through the commands or the election.
   */
  updateSettings(patch: PublicSettingsPatch): void;
  /** Patch a round's title and/or description. Not a command: there is no rule to apply. */
  updateRoundDescriptor(roundId: string, fields: PatchRoundDescriptorInit): void;
  /**
   * Wait, up to `capMs` (default 500), for what this peer wrote last — a
   * leave — to leave the socket, before a teardown closes it. Never rejects.
   */
  flushUpdates(capMs?: number): Promise<void>;
  /** Destroy the doc, stop the drivers, drop the command set. Writes nothing. Idempotent. */
  teardown(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Open a live session. On open, in this order:
 *
 *  1. builds the doc and presence, and seeds both;
 *  2. starts change tracking on all five top-level containers;
 *  3. binds the session commands;
 *  4. starts the host-election, auto-reveal and session events drivers;
 *  5. awaits `beforeConnect`, when given;
 *  6. connects through `relay-client`.
 *
 * A join runs `rejoin` from the first sync, and only from there.
 */
export function openLiveSession(options: OpenLiveSessionOptions): LiveSession {
  const { room, self, seed } = options;
  const me = self.participantId;
  const now = options.now ?? Date.now;

  // 1. The doc and presence. Presence is seeded before anything reads the
  // online set, so this peer never sees its own row offline and the election
  // never takes a present host for an absent one (ADR-0010).
  const doc = new Y.Doc();
  if (seed.kind === 'create') {
    initDoc(doc, {
      roomUuid: room.uuid,
      createdAt: now(),
      participantId: me,
      displayName: self.displayName,
      defaultScale: seed.defaultScale,
      ...(seed.sessionName !== undefined && { sessionName: seed.sessionName }),
      ...(self.avatarColor !== undefined && { avatarColor: self.avatarColor }),
    });
  } else {
    joinDoc(doc, {
      participantId: me,
      displayName: self.displayName,
      joinedAt: now(),
      ...(self.avatarColor !== undefined && { avatarColor: self.avatarColor }),
    });
  }
  const awareness = new Awareness(doc);
  awareness.setLocalStateField(AWARENESS_PARTICIPANT_ID_FIELD, me);

  let tornDown = false;
  let projection = projectDoc(doc);
  let onlineIds: ReadonlySet<string> = onlineIdsFrom(awareness.getStates());
  // Whether presence can be believed: the relay's state has applied on the
  // current socket (ADR-0050).
  let synced = false;
  // Set by the first sync, and for good.
  let firstSynced = false;
  // This peer's own end-session write applied — not "this peer created the
  // session" (ADR-0023).
  let endedLocally = false;

  // One fan-out for every driver: doc changes, presence changes and the sync
  // edges. A single place deciding what counts as a change is what two
  // hand-wired copies used to drift on.
  const driverNotifiers = new Set<() => void>();
  const notifyDrivers = (): void => {
    for (const notify of driverNotifiers) notify();
  };
  const subscribe = (cb: () => void): (() => void) => {
    driverNotifiers.add(cb);
    return (): void => {
      driverNotifiers.delete(cb);
    };
  };

  // 2. Change tracking on every top-level container. Once per transaction,
  // after its observers have run: the first sync, for one, touches all five
  // at once, and one projection of the final state is all anyone needs.
  const containers: ReadonlySet<unknown> = new Set([
    doc.getMap(DOC_META_KEY),
    doc.getMap(DOC_SETTINGS_KEY),
    doc.getMap(DOC_PARTICIPANTS_KEY),
    doc.getArray(DOC_ROUNDS_KEY),
    doc.getArray(DOC_AGENDA_KEY),
  ]);
  const touchesContainers = (transaction: Y.Transaction): boolean => {
    // Every type a change sits under, up to its root.
    for (const type of transaction.changedParentTypes.keys()) {
      if (containers.has(type)) return true;
    }
    return false;
  };
  const onTransaction = (transaction: Y.Transaction): void => {
    if (!touchesContainers(transaction)) return;
    projection = projectDoc(doc);
    options.onProjectionChange?.(projection);
    notifyDrivers();
  };
  doc.on('afterTransaction', onTransaction);

  const onPresenceChange = (): void => {
    const next = onlineIdsFrom(awareness.getStates());
    if (!sameIds(next, onlineIds)) {
      onlineIds = next;
      options.onOnlineIdsChange?.(onlineIds);
    }
    notifyDrivers();
  };
  awareness.on('change', onPresenceChange);

  options.onProjectionChange?.(projection);
  options.onOnlineIdsChange?.(onlineIds);

  // 3. The command set. Dropped on teardown, so a late call refuses through
  // `UNBOUND_SESSION_COMMANDS` rather than writing to a destroyed doc.
  const bound = bindSessionCommands({ doc, participantId: me, onlineIds: () => onlineIds, now });
  let commands: SessionCommands = {
    ...bound,
    endSession() {
      const result = bound.endSession();
      // Read by the session events driver at delivery, a microtask after the
      // write notified it — so setting it after the write is in time.
      if (result.applied) endedLocally = true;
      return result;
    },
  };

  // 4. The drivers. One participant id, by value, is "me" for all three.
  const election = startElection({
    projection: () => projection,
    onlineIds: () => onlineIds,
    myId: () => me,
    subscribe,
    promote(winnerId) {
      promoteHost(doc, winnerId);
    },
  });
  const autoReveal = startAutoReveal({
    projection: () => projection,
    onlineIds: () => onlineIds,
    presenceTrusted: () => synced,
    selfId: () => me,
    subscribe,
    reveal() {
      if (commands.revealCurrentRound().applied) options.onAutoReveal?.();
    },
  });
  // Presence trust is the live reading, first sync the sticky one: a host is
  // "disconnected" only to a peer that is in sync itself.
  const sessionEvents = startSessionEvents({
    projection: () => projection,
    onlineIds: () => onlineIds,
    presenceTrusted: () => synced,
    firstSyncCompleted: () => firstSynced,
    endedLocally: () => endedLocally,
    selfId: me,
    subscribe,
    emit(event) {
      options.onSessionEvent?.(event);
    },
  });

  // 5–6. The surface's hook, then the connection. The handle exists the whole
  // time: a teardown during the hook opens no socket, and credentials updated
  // during it are read when the socket opens.
  let credentials: JoinCredentials = {
    roomCode: room.code,
    deviceId: options.credentials.deviceId,
    ...(options.credentials.passwordHash !== undefined && {
      passwordHash: options.credentials.passwordHash,
    }),
  };
  let connection: RelayConnection | null = null;
  const { beforeConnect } = options;
  if (beforeConnect === undefined) {
    connect();
  } else {
    // A hook that fails does not keep the session offline: what it loads is a
    // head start (ADR-0004), not a precondition. Its errors are its own — a
    // synchronous throw included, which must not escape with the drivers
    // already running and no handle to tear them down by.
    // Deferred a microtask, so a teardown straight after open beats it: the
    // hook then never runs against the destroyed doc.
    void Promise.resolve()
      .then(() => (tornDown ? undefined : beforeConnect(doc)))
      .then(connect, connect);
  }

  function connect(): void {
    if (tornDown) return;
    connection = connectToRelay({
      httpBaseUrl: options.httpBaseUrl,
      roomUuid: room.uuid,
      doc,
      credentials,
      awareness,
      WebSocketPolyfill: options.WebSocketPolyfill,
      onStatusChange(status) {
        if (!tornDown) options.onStatusChange?.(status);
      },
      onRejectionChange(reason) {
        if (!tornDown) options.onRejectionChange?.(reason);
      },
      onReconnectingChange(reconnecting) {
        if (!tornDown) options.onReconnectingChange?.(reconnecting);
      },
      onRepeatRejection() {
        if (!tornDown) options.onRepeatRejection?.();
      },
      // The post-sync timing is the rule, not an optimisation: the relay's ops
      // have applied when this fires, so `rejoin`'s delete outranks the
      // snapshot's `leftAt` in the merge (ADR-0036 §6). A create has no earlier
      // record to clear. The refusal is ignored on purpose — no record means
      // nothing to clear.
      onSynced() {
        if (tornDown) return;
        // First, so the session events driver reads a `leftAt` the rejoin
        // clears as this connection's doing, not the snapshot's (ADR-0036 §6).
        firstSynced = true;
        if (seed.kind === 'join') rejoin(doc, me);
        options.onFirstSync?.();
      },
      onSyncedChange(next) {
        if (tornDown) return;
        synced = next;
        options.onSyncedChange?.(next);
        notifyDrivers();
      },
    });
  }

  return {
    get commands(): SessionCommands {
      return commands;
    },

    updateCredentials(passwordHash: string | null): void {
      if (tornDown) return;
      credentials =
        passwordHash === null
          ? { roomCode: credentials.roomCode, deviceId: credentials.deviceId }
          : { ...credentials, passwordHash };
      // No connection yet: the socket opens with the credentials above.
      connection?.updateCredentials({ passwordHash });
    },

    updateSettings(patch: PublicSettingsPatch): void {
      if (tornDown) return;
      patchSettings(doc, patch);
    },

    updateRoundDescriptor(roundId: string, fields: PatchRoundDescriptorInit): void {
      if (tornDown) return;
      patchRoundDescriptor(doc, roundId, fields);
    },

    async flushUpdates(capMs = 500): Promise<void> {
      await connection?.flush(capMs);
    },

    teardown(): void {
      if (tornDown) return;
      tornDown = true;
      commands = UNBOUND_SESSION_COMMANDS;
      // Drops anything not yet delivered: no event reaches a listener after this.
      sessionEvents.stop();
      autoReveal.stop();
      election.stop();
      doc.off('afterTransaction', onTransaction);
      awareness.off('change', onPresenceChange);
      connection?.disconnect();
      connection = null;
      awareness.destroy();
      doc.destroy();
    },
  };
}
