/**
 * Session orchestrator for the CLI client.
 *
 * Manages the full lifecycle: mint/resolve room → init/join doc →
 * connect sync → wire host election + unanimous auto-reveal + session events →
 * expose mutation API.
 */

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import {
  initDoc,
  joinDoc,
  projectDoc,
  currentRound,
  patchRoundDescriptor,
  patchSettings,
  hashPassword,
  normalizePassword,
  promoteHost as promoteHostCommand,
  bindSessionCommands,
  type SessionCommands,
  startAutoReveal,
  type AutoRevealHandle,
  onlineIdsFrom,
  AWARENESS_PARTICIPANT_ID_FIELD,
  startElection,
  type ElectionHandle,
  startSessionEvents,
  type SessionEvent,
  type SessionEventsHandle,
  FIBONACCI_SCALE,
  type DocProjection,
  type Scale,
  type Round,
  type JoinRejectionReason,
  connectToRelay,
  mintRoom,
  resolveRoom,
  patchRoomAccess,
  rejoin as rejoinRoster,
  type RelayConnection,
  type SyncStatus,
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

export interface SessionHandle {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly roomCode: string;
  readonly roomUuid: string;
  /**
   * The hash the connection was first made with, for the caller to remember
   * (ADR-0044). `undefined` for a session that was open at the time.
   */
  readonly passwordHash: string | undefined;
  /**
   * The whole UI-facing writer seam, bound once to this doc and this
   * participant (#516). Eleven forwards used to re-spell each command's name
   * under this handle; `reveal(): void` / `skip(): void` /
   * `discardCurrentRound(): void` went further and discarded the
   * `TerminalResult` those commands return, so a lost race (someone else
   * terminated the round first) was indistinguishable from a successful
   * write on this surface. Reaching the command directly through `commands`
   * puts that result back within reach of every call site — the TUI still
   * ignores it where it has nothing to gate (no router, no haptics; a
   * re-render already arrives via the doc-change subscription), but the
   * information is no longer thrown away by the handle itself.
   */
  readonly commands: SessionCommands;

  /** Get current projection snapshot. */
  projection(): DocProjection;
  /** Get current round (or null). */
  current(): Round | null;
  /** Whether this client is the host. */
  isHost(): boolean;
  /**
   * Whether the session has been got into at least once: the relay's state
   * has applied on a socket. A socket that is merely up says nothing — the
   * relay takes it before it turns a wrong password away (ADR-0035).
   */
  hasJoined(): boolean;
  /** Online participant IDs from awareness. */
  onlineIds(): Set<string>;

  /** Update a round's title and/or description. */
  updateRoundDescriptor(roundId: string, fields: { title?: string; description?: string }): void;
  /** Update the room name. Pass undefined to remove. */
  updateName(name: string | undefined): void;
  /** Update the default estimation scale. */
  updateScale(scale: Scale): void;
  /** Update room access mode (open or password-protected). */
  updateAccess(mode: 'open' | 'password', password?: string): Promise<void>;

  /** Subscribe to doc changes. Returns unsubscribe fn. */
  onChange(cb: () => void): () => void;
  /** Subscribe to sync status changes. Returns unsubscribe fn. */
  onStatusChange(cb: (status: SyncStatus) => void): () => void;
  /**
   * Subscribe to the session events driver: ended, host changed, removed —
   * each once, with the text to print already written. Delivered a microtask
   * after the doc change, never inside it; no replay. Returns unsubscribe.
   */
  onSessionEvent(listener: (event: SessionEvent) => void): () => void;

  /** Disconnect and clean up. */
  disconnect(): void;
}

export async function createSession(opts: CreateSessionOptions): Promise<SessionHandle> {
  let passwordHash: string | undefined;
  // Mint room first to get UUID (needed as salt for password hash)
  const minted = await mintRoom(opts.relayUrl);

  // Whitespace alone is no password: the hash would be that of nothing.
  if (opts.password !== undefined && normalizePassword(opts.password) !== '') {
    passwordHash = await hashPassword(opts.password, minted.uuid);
    // Update room with password
    await patchRoomAccess(opts.relayUrl, minted.uuid, passwordHash);
  }

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);

  const now = Date.now();
  initDoc(doc, {
    roomUuid: minted.uuid,
    createdAt: now,
    participantId: opts.participantId,
    displayName: opts.displayName,
    defaultScale: opts.defaultScale ?? FIBONACCI_SCALE,
    ...(opts.sessionName !== undefined && { sessionName: opts.sessionName }),
    ...(opts.avatarColor !== undefined && { avatarColor: opts.avatarColor }),
  });

  awareness.setLocalStateField(AWARENESS_PARTICIPANT_ID_FIELD, opts.participantId);

  return wireSession({
    doc,
    awareness,
    roomCode: minted.code,
    roomUuid: minted.uuid,
    participantId: opts.participantId,
    relayUrl: opts.relayUrl,
    passwordHash,
    onRejection: opts.onRejection,
  });
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

  const doc = new Y.Doc();
  const awareness = new Awareness(doc);

  joinDoc(doc, {
    participantId: opts.participantId,
    displayName: opts.displayName,
    joinedAt: Date.now(),
    ...(opts.avatarColor !== undefined && { avatarColor: opts.avatarColor }),
  });

  awareness.setLocalStateField(AWARENESS_PARTICIPANT_ID_FIELD, opts.participantId);

  return wireSession({
    doc,
    awareness,
    roomCode: opts.roomCode,
    roomUuid: resolved.uuid,
    participantId: opts.participantId,
    relayUrl: opts.relayUrl,
    passwordHash,
    onRejection: opts.onRejection,
    // This client is rejoining a room it may have left before — clear the
    // stale `leftAt` once the relay snapshot has applied (ADR-0036 §6).
    clearLeftStatusOnSync: true,
  });
}

export interface WireOptions {
  doc: Y.Doc;
  awareness: Awareness;
  roomCode: string;
  roomUuid: string;
  participantId: string;
  relayUrl: string;
  passwordHash?: string | undefined;
  onRejection?: ((reason: JoinRejectionReason) => void) | undefined;
  /**
   * Clear this participant's stale `leftAt` / `removedBy` once the relay
   * snapshot has synced (ADR-0036 §6). Set when rejoining a room, not when
   * minting one — a fresh room has no prior record to clear.
   */
  clearLeftStatusOnSync?: boolean | undefined;
}

export function wireSession(opts: WireOptions): SessionHandle {
  const { doc, awareness, participantId, relayUrl, roomUuid } = opts;

  const statusCallbacks = new Set<(status: SyncStatus) => void>();
  const changeCallbacks = new Set<() => void>();
  const sessionEventListeners = new Set<(event: SessionEvent) => void>();

  // Whether awareness can be believed: the relay's state has applied on the
  // current socket. Until then this peer is the only one it can see, and a
  // rule that counts who is online (unanimous auto-reveal) must wait.
  let presenceTrusted = false;
  // Set by the first sync, and for good.
  let joined = false;

  // Connect to relay
  const conn: RelayConnection = connectToRelay({
    httpBaseUrl: opts.relayUrl,
    roomUuid: opts.roomUuid,
    doc,
    credentials: {
      roomCode: opts.roomCode,
      deviceId: participantId,
      ...(opts.passwordHash !== undefined && { passwordHash: opts.passwordHash }),
    },
    awareness,
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    onStatusChange(status) {
      statusCallbacks.forEach((cb) => cb(status));
    },
    onRejectionChange(reason) {
      if (reason === null) return;
      console.error(`Connection rejected: ${reason}`);
      opts.onRejection?.(reason);
    },
    // Repeated transient closes are worth surfacing — otherwise "still
    // retrying" and "hung" look identical from the terminal.
    onRepeatRejection() {
      console.error('Trouble reaching the room — retrying.');
    },
    // Both edges re-evaluate: a round that went unanimous while the socket
    // was down reveals on the way back up, and nothing does on the way down.
    onSyncedChange(synced) {
      presenceTrusted = synced;
      if (synced) joined = true;
      changeCallbacks.forEach((cb) => cb());
    },
    // The post-sync timing is the rule, not an optimisation: the relay's ops
    // are already applied when `onSynced` fires, so `rejoin`'s delete outranks
    // the snapshot's `leftAt` in the LWW merge (ADR-0036 §6). The refusal is
    // ignored on purpose — no record means nothing to clear.
    ...(opts.clearLeftStatusOnSync === true && {
      onSynced: () => {
        rejoinRoster(doc, participantId);
      },
    }),
  });

  // Observe doc changes
  const observeHandler = (): void => {
    changeCallbacks.forEach((cb) => cb());
  };
  doc.getMap('meta').observeDeep(observeHandler);
  doc.getMap('settings').observeDeep(observeHandler);
  doc.getMap('participants').observeDeep(observeHandler);
  doc.getArray('rounds').observeDeep(observeHandler);

  function getOnlineIds(): Set<string> {
    return onlineIdsFrom(awareness.getStates());
  }

  // One fan-out for every driver: doc changes, presence changes and the
  // sync edges (onSyncedChange above) — the counterpart of DocService.subscribeDriver.
  function subscribeDriver(cb: () => void): () => void {
    changeCallbacks.add(cb);
    awareness.on('change', cb);
    return (): void => {
      changeCallbacks.delete(cb);
      awareness.off('change', cb);
    };
  }

  // The whole writer seam, bound once for this session (#516). `onlineIds`
  // is threaded as the getter itself, not a snapshot, so `handoffHost` reads
  // the live online set at call time rather than the set at wiring time.
  const bound = bindSessionCommands({ doc, participantId, onlineIds: getOnlineIds });
  // "Ended locally" is this peer's own end applying — never "this peer created
  // the session" — the CLI counterpart of DocService.endSessionForEveryone.
  let endedLocally = false;
  const commands: SessionCommands = {
    ...bound,
    endSession() {
      const result = bound.endSession();
      if (result.applied) endedLocally = true;
      return result;
    },
  };

  // Wire host election. The driver (debounce, missing-host state, promotion
  // decision) lives in `@hnch/shared`; this is the adapter. It re-uses the
  // doc-change fan-out above, so no new Yjs observer is introduced.
  const election: ElectionHandle = startElection({
    projection: () => projectDoc(doc),
    onlineIds: getOnlineIds,
    myId: () => participantId,
    subscribe: subscribeDriver,
    promote(winnerId) {
      promoteHostCommand(doc, winnerId);
    },
  });

  // Unanimous auto-reveal. The rule *and* the driver (when to re-evaluate,
  // the terminal guard that makes a dedupe set unnecessary) live in
  // `@hnch/shared`; this is the adapter. It re-uses the doc-change fan-out
  // above plus awareness, so no new observer and no poll loop is introduced
  // (ADR-0018 / ADR-0020 / ADR-0036 / ADR-0041).
  const autoReveal: AutoRevealHandle = startAutoReveal({
    projection: () => projectDoc(doc),
    onlineIds: getOnlineIds,
    presenceTrusted: () => presenceTrusted,
    selfId: () => participantId,
    subscribe: subscribeDriver,
    reveal() {
      commands.revealCurrentRound();
    },
  });

  // Session end, host change and removal (ADR-0023, ADR-0036 §5–6). The rules,
  // their guards and their wording live in `@hnch/shared`; this is the
  // adapter. Presence trust is the live reading, first sync the sticky one —
  // a host is "disconnected" only to a peer that is in sync itself.
  const sessionEvents: SessionEventsHandle = startSessionEvents({
    projection: () => projectDoc(doc),
    onlineIds: getOnlineIds,
    presenceTrusted: () => presenceTrusted,
    firstSyncCompleted: () => joined,
    endedLocally: () => endedLocally,
    selfId: participantId,
    subscribe: subscribeDriver,
    emit: (event) => {
      for (const listener of sessionEventListeners) listener(event);
    },
  });

  let disposed = false;

  return {
    doc,
    awareness,
    roomCode: opts.roomCode,
    roomUuid: opts.roomUuid,
    passwordHash: opts.passwordHash,
    commands,

    projection() {
      return projectDoc(doc);
    },

    current() {
      return currentRound(projectDoc(doc));
    },

    hasJoined() {
      return joined;
    },

    isHost() {
      const p = projectDoc(doc);
      return p.settings.hostParticipantId === participantId;
    },

    onlineIds: getOnlineIds,

    updateRoundDescriptor(roundId: string, fields: { title?: string; description?: string }) {
      patchRoundDescriptor(doc, roundId, fields);
    },

    updateName(name: string | undefined) {
      // patchSettings interprets undefined values as "delete the key";
      // cast is required because exactOptionalPropertyTypes rejects explicit undefined
      // in Partial<Settings> even though the runtime behavior is intentional.
      patchSettings(doc, { name } as { name?: string });
    },

    updateScale(scale: Scale) {
      patchSettings(doc, { defaultScale: scale });
    },

    async updateAccess(mode: 'open' | 'password', password?: string) {
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
      // Update stored credentials so reconnect uses new passwordHash
      conn.updateCredentials({ passwordHash });
    },

    onChange(cb: () => void) {
      changeCallbacks.add(cb);
      return () => changeCallbacks.delete(cb);
    },

    onStatusChange(cb: (status: SyncStatus) => void) {
      statusCallbacks.add(cb);
      return () => statusCallbacks.delete(cb);
    },

    onSessionEvent(listener: (event: SessionEvent) => void) {
      sessionEventListeners.add(listener);
      return () => {
        sessionEventListeners.delete(listener);
      };
    },

    disconnect() {
      if (disposed) return;
      disposed = true;
      sessionEvents.stop();
      autoReveal.stop();
      election.stop();
      doc.getMap('meta').unobserveDeep(observeHandler);
      doc.getMap('settings').unobserveDeep(observeHandler);
      doc.getMap('participants').unobserveDeep(observeHandler);
      doc.getArray('rounds').unobserveDeep(observeHandler);
      conn.disconnect();
    },
  };
}
