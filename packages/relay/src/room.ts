/**
 * `Room` Durable Object: one per room UUID (ADR-0051: admission, sync, presence,
 * persistence and TTL clauses).
 *
 * Holds the room's Y.Doc and presence, admits sockets (password, cap), relays
 * sync and awareness between them, persists the doc, and deletes the room 24–25 h
 * after it was last occupied.
 *
 * Sockets are hibernatable: the object may be evicted between events and is
 * rebuilt from storage (doc, metadata) and from socket attachments (presence).
 *
 * Storage:
 *   kv `meta`          RoomMeta, written at init, changed additively only
 *   sql `log`          coalesced doc updates, one row per flush
 *   sql `snapshot`     the compacted doc, in chunks of at most 1 MiB
 *   sql `bindings`     participantId → SHA-256(uuid ‖ pk), capped (ADR-0059)
 *
 * Access changes (ADR-0059): only the room's access holder may PATCH, and the
 * holder moves only on what the relay sees itself (create, handoff, sockets
 * opening and closing, the clock), never on a doc write. The doc is read, never
 * trusted alone, at PATCH and when the holder's socket comes back.
 */

import { DurableObject } from 'cloudflare:workers';
import * as Y from 'yjs';
import { JOIN_REJECTION_CLOSE_CODES, type JoinRejectionReason } from '@hnch/shared/auth';
import { clock } from './clock';
import { concatBytes } from './bytes';
import { configOf, type RelayConfig } from './config';
import { passwordDigest, passwordMatches } from './digest';
import { json } from './http';
import {
  type Caller,
  type Creator,
  isKeyHex,
  isParticipantId,
  keyDigest,
  keyDigestMatches,
  participantKey,
} from './participant-key';
import {
  AwarenessTooLargeError,
  Presence,
  PresenceLimitError,
  type PresenceEntry,
} from './presence';
import {
  answerSync,
  awarenessMessage,
  readMessage,
  syncStep1Message,
  updateMessage,
} from './protocol';
import { codesStub, expiryStub, logEvent } from './stubs';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** ADR-0012: a room is kept this long after it was last occupied. */
export const ROOM_TTL_MS = 24 * HOUR_MS;
/** Occupancy is stamped hourly, so deletion lands 24–25 h after the last peer left. */
export const OCCUPANCY_CHECK_MS = HOUR_MS;
/** Retry delay for a deletion or alarm that failed. */
export const RETRY_MS = 10 * MINUTE_MS;
/** Each instance checks that an alarm is set at most this often (and once at start). */
export const REARM_CHECK_MS = 10 * MINUTE_MS;

/** Coalesced writes (contract item 10). */
export const FLUSH_AFTER_MS = 5_000;
export const FLUSH_AT_BYTES = 512 * 1024;
export const COMPACT_AFTER_ROWS = 32;
export const SNAPSHOT_CHUNK_BYTES = 1024 * 1024;

/** Keepalive (contract item 9): a socket sent nothing this long gets a relay frame. */
export const KEEPALIVE_AFTER_MS = 10_000;
/**
 * The pre-agreed keepalive fallback, off by default. If hidden tabs reconnect
 * too often (the item-9 trigger), a relay release turns it on: while the room is
 * occupied its alarm then also fires every {@link KEEPALIVE_ALARM_MS} and renews
 * each socket that has been sent nothing for {@link KEEPALIVE_AFTER_MS}. Tests
 * flip it here.
 */
export const keepaliveFallback = { enabled: false };
export const KEEPALIVE_ALARM_MS = 20_000;

/** Attachments are capped at 16 KiB; past this a socket's states are not saved. */
const ATTACHMENT_PRESENCE_BUDGET = 15 * 1024;

/** Password checks per join, if the password keeps changing while it is checked. */
const PASSWORD_CHECKS = 3;

/**
 * Refused sockets a room holds at once (#566). A refused client that never
 * answers its close keeps its socket until the runtime drops it, and each one
 * counts toward the object's WebSocket limit. At the bound a refusal is plain
 * HTTP instead, so a flood of wrong passwords can't shut legitimate joins out.
 */
export const REFUSED_SOCKETS_BOUND = 64;
/** The 503's `detail` at the bound; same for both reasons, and no verdict (ADR-0050). */
export const REFUSED_BOUND_DETAIL = 'too many refused joins';
/** `Retry-After` of a refusal answered at the bound. */
const REFUSED_RETRY_AFTER_S = 5;

/** ADR-0059: the holder lapses once it has had no open bound socket this long (ADR-0010's debounce). */
export const HOLDER_LAPSE_MS = 5_000;
/** ADR-0059 released-client grace: a keyless create's one keyless PATCH, this soon after create. */
export const KEYLESS_GRACE_MS = 60_000;
/** Bindings a room keeps, per seat of its cap; at the bound new ids stay unbound. */
const BINDINGS_PER_SEAT = 4;
/** `settings.hostParticipantId` in the doc (docs/schema.md). */
const DOC_SETTINGS = 'settings';
const DOC_HOST = 'hostParticipantId';

const SCHEMA_VERSION = 1;
const META = 'meta';
const STORAGE_ORIGIN = Symbol('storage');

export interface RoomMeta {
  readonly schemaVersion: number;
  readonly uuid: string;
  readonly code: string;
  /** `SHA-256(uuid ‖ passwordHash)` as hex, or null for an open room. */
  readonly digest: string | null;
  readonly createdAt: number;
  /** Last time the room was seen with a socket open (stamped hourly). */
  readonly lastOccupiedAt: number;
  /** Set when deletion starts; from then on the room answers unknown. */
  readonly tombstonedAt: number | null;
  /** The relay's own awareness client ID, stable across wakes. */
  readonly relayClientId: number;
  // ADR-0059, additive: absent on rooms made before it.
  /** The one participant that may change access, or null/absent when none holds it. */
  readonly accessHolder?: string | null;
  /** When the holder was first seen with no open bound socket; null while it has one. */
  readonly holderAbsentSince?: number | null;
  /** Whether a socket was ever admitted. Absent reads as true (no grace for old rooms). */
  readonly everAdmitted?: boolean;
  /** A keyless create's one keyless PATCH is still unused. Absent reads as false. */
  readonly keylessGrace?: boolean;
}

export type AccessMode = 'open' | 'password';
export type ExpireOutcome = 'deleted' | 'gone' | 'moved' | 'live';

/** ADR-0059's 401 reasons: no proof of the id, or proof but not the holder. */
export type AccessRefusal = 'unauthenticated' | 'not-host';

/** What PATCH answers; null (unknown room) is separate. */
export type AccessAnswer =
  | { readonly accessMode: AccessMode }
  | { readonly refused: AccessRefusal };

/** What handoff answers; null (unknown room) is separate. */
export type HandoffAnswer =
  | { readonly accessHolder: string }
  | { readonly refused: AccessRefusal | 'bad-target' };

/** Who a socket said it is (`did`) and, if it proved it with its `pk`, its bound id. */
interface SocketIdentity {
  readonly did: string | null;
  readonly participantId: string | null;
}

interface SocketAttachment extends Partial<SocketIdentity> {
  readonly id: string;
  readonly presence: readonly PresenceEntry[];
}

export class Room extends DurableObject<Env> {
  private readonly config: RelayConfig;
  private readonly presence = new Presence();
  /** When each socket (by attachment id) was last sent a frame. */
  private readonly lastSentAt = new Map<string, number>();
  private readonly socketIds = new WeakMap<WebSocket, string>();
  private readonly identities = new WeakMap<WebSocket, SocketIdentity>();
  private bindingsReady = false;

  /** undefined until read from storage. */
  private meta: RoomMeta | null | undefined;
  private doc: Y.Doc | null = null;
  private logRows = 0;

  private buffer: Uint8Array[] = [];
  private bufferBytes = 0;
  private bufferSince: number | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /** After a failed write the doc is written whole, since the log has a gap. */
  private compactPending = false;
  private writeFailureLogged = false;

  private lastRearmCheck: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.config = configOf(env);
    // Presence survives hibernation and eviction in the socket attachments.
    for (const ws of ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (attachment !== null) this.presence.restore(attachment.id, attachment.presence);
    }
  }

  // RPC

  /** Creates the room. Called once by the Worker, after the code is claimed. */
  async init(
    uuid: string,
    code: string,
    passwordHash: string | null,
    creator: Creator | null = null,
  ): Promise<void> {
    if (this.loadMeta() !== null) throw new Error('room already initialised');
    const digest = passwordHash === null ? null : await passwordDigest(uuid, passwordHash);
    // The relay derives the creator's pk itself; the device key goes no further.
    const creatorDigest =
      creator === null
        ? null
        : await keyDigest(uuid, await participantKey(creator.deviceKey, uuid));
    const now = clock.now();
    const meta: RoomMeta = {
      schemaVersion: SCHEMA_VERSION,
      uuid,
      code,
      digest,
      createdAt: now,
      lastOccupiedAt: now,
      tombstonedAt: null,
      relayClientId: crypto.getRandomValues(new Uint32Array(1))[0]!,
      accessHolder: creator?.participantId ?? null,
      holderAbsentSince: creator === null ? null : now,
      everAdmitted: false,
      keylessGrace: creator === null,
    };
    this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      sql.exec('CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY, data BLOB NOT NULL)');
      sql.exec(
        'CREATE TABLE IF NOT EXISTS snapshot (chunk INTEGER PRIMARY KEY, data BLOB NOT NULL)',
      );
      if (creator !== null) this.insertBinding(creator.participantId, creatorDigest!);
      this.writeMeta(meta);
    });
    await this.ctx.storage.setAlarm(now + OCCUPANCY_CHECK_MS);
  }

  /** The room's access mode, or null if it is unknown (never made, deleted, expired). */
  async info(): Promise<{ accessMode: AccessMode } | null> {
    const meta = await this.liveMeta();
    return meta === null ? null : { accessMode: accessModeOf(meta) };
  }

  /**
   * Sets or clears the password, for the access holder only (ADR-0059's PATCH
   * rule), or once for a released keyless client. Open sockets stay. Null if
   * the room is unknown.
   */
  async setPassword(
    passwordHash: string | null,
    caller: Caller | null,
  ): Promise<AccessAnswer | null> {
    const meta = await this.liveMeta();
    if (meta === null) return null;
    // Every await first; from the re-read below to the write, one synchronous block.
    const submitted = await submittedKeyDigest(meta.uuid, caller);
    const digest = passwordHash === null ? null : await passwordDigest(meta.uuid, passwordHash);
    const current = this.loadMeta();
    if (isGone(current)) return null;
    const now = clock.now();

    let updated: RoomMeta;
    if (caller === null) {
      if (!graceOpen(current, now)) return { refused: 'unauthenticated' };
      updated = { ...current, digest, keylessGrace: false };
    } else {
      const evaluated = this.evaluateHolder(now);
      const refusal = this.authorise(caller, submitted, evaluated);
      if (refusal !== null) return { refused: refusal };
      updated = { ...this.loadMeta()!, digest };
    }
    this.writeMeta(updated);
    return { accessMode: accessModeOf(updated) };
  }

  /**
   * ADR-0059 handoff: the access holder hands it to `target`, which must be
   * bound, uncontested and connected. The client writes `handoffHost` to the
   * doc only after this answers. Null if the room is unknown.
   */
  async handoff(caller: Caller | null, target: string): Promise<HandoffAnswer | null> {
    const meta = await this.liveMeta();
    if (meta === null) return null;
    const submitted = await submittedKeyDigest(meta.uuid, caller);
    const current = this.loadMeta();
    if (isGone(current)) return null;
    if (caller === null) return { refused: 'unauthenticated' };
    const evaluated = this.evaluateHolder(clock.now());
    const refusal =
      this.proveCaller(caller, submitted) ??
      (evaluated.accessHolder === caller.participantId ? null : 'not-host');
    if (refusal !== null) return { refused: refusal };
    if (!this.isClaimable(target)) return { refused: 'bad-target' };
    this.writeMeta({ ...evaluated, accessHolder: target, holderAbsentSince: null });
    return { accessHolder: target };
  }

  /**
   * For the daily Expiry sweep: delete the room if it is due. A room that stays
   * (not due, or its delete failed) answers `live`; given `relistUnder` (the
   * sweep's day, passed only while the room's index is about to leave the
   * window), it lists itself there first and answers `moved`, so the sweep
   * covers it however long it lives. A failed move answers `live`: it stays
   * listed where it was, and the next sweep retries. The call is the room's own
   * subrequest, not the sweep's.
   */
  async expireIfDue(relistUnder?: string): Promise<ExpireOutcome> {
    const meta = await this.touch();
    if (meta === null) return 'gone';
    const due = meta.tombstonedAt !== null || this.isDue(meta, clock.now());
    if (due && (await this.delete())) return 'deleted';
    if (relistUnder === undefined) return 'live';
    try {
      await expiryStub(this.env, relistUnder).register(meta.uuid);
      return 'moved';
    } catch (err) {
      logEvent('room-relist-failed', err);
      return 'live';
    }
  }

  /**
   * ADR-0027 `DELETE /test/rooms/:uuid`, and `POST /test/rooms` taking a code over: delete now.
   * A tombstoned room retries the code release it still owes, so a code it kept is
   * freed now rather than at its alarm. False if the room was unknown or already
   * tombstoned. True does not mean the code is free: a failed release leaves it
   * held until the alarm retries.
   */
  async testEvict(): Promise<boolean> {
    const meta = this.loadMeta();
    if (meta === null) return false;
    const live = meta.tombstonedAt === null;
    await this.delete();
    return live;
  }

  // WebSocket

  /**
   * `WS /ws/:uuid`, forwarded by the Worker once it saw an upgrade request.
   * Answers 101 (admitted, or refused with a close code), 404, 400, or 503 at
   * {@link REFUSED_SOCKETS_BOUND}.
   */
  override async fetch(request: Request): Promise<Response> {
    const meta = await this.liveMeta();
    // Pre-upgrade rejections stay plain HTTP (ADR-0016, ADR-0050).
    if (meta === null) return new Response(null, { status: 404 });
    const params = new URL(request.url).searchParams;
    const pw = params.get('pw');
    if (meta.digest !== null && !pw) return new Response(null, { status: 400 });
    // ADR-0059: a `did` with a well-formed `pk` may bind or prove that id. A bad
    // or missing `pk` still joins, unbound.
    const did = params.get('did');
    const claimedId = isParticipantId(did) ? did : null;
    const pk = params.get('pk');
    const pkWork = claimedId !== null && isKeyHex(pk) ? keyDigest(meta.uuid, pk) : null;

    // The password can be changed or cleared while it is being checked (the
    // object's input gate stays open across this await), so a verdict counts only
    // against the digest still in force; otherwise check again, a few times. The
    // pk digest is worked out in the same await, so nothing waits after the verdict.
    let digest = meta.digest;
    let admitted: boolean | null = digest === null && pkWork === null ? true : null;
    let pkDigest: string | null = null;
    for (let attempt = 0; admitted === null && attempt < PASSWORD_CHECKS; attempt++) {
      const [matches, submitted] = await Promise.all([
        digest === null ? true : passwordMatches(meta.uuid, pw ?? '', digest),
        pkWork,
      ]);
      pkDigest = submitted;
      const current = this.loadMeta();
      // The room may have been deleted while the password was checked.
      if (isGone(current)) return new Response(null, { status: 404 });
      if (current.digest === digest) {
        admitted = matches;
        break;
      }
      digest = current.digest;
    }
    if (admitted === null) admitted = digest === null;
    if (!admitted) return refuse(this.ctx, 'wrong-password');

    // Everything that can fail runs before the accept: sync-step-1, then every
    // state the room holds plus the relay's own.
    const now = clock.now();
    this.expirePresence(now);
    const opening = [
      syncStep1Message(this.loadDoc()),
      awarenessMessage(this.presence.encode(this.presence.clientIds(), now)),
    ];

    // No await between the cap check and the accept, so it can't be overrun.
    if (this.openSockets().length >= this.config.roomCap) {
      return refuse(this.ctx, 'room-full');
    }
    const { 0: client, 1: server } = new WebSocketPair();
    const id = crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    try {
      this.socketIds.set(server, id);
      // Only an admitted socket binds; the table is read here, after every await.
      const participantId =
        claimedId !== null && pkDigest !== null ? this.tryProveOrBind(claimedId, pkDigest) : null;
      this.identities.set(server, { did: claimedId, participantId });
      this.saveAttachment(server, id);
      this.socketsChanged(now, undefined, participantId);
      for (const frame of opening) this.send(server, id, frame, now);
    } catch (err) {
      // Never leave an accepted socket holding a seat behind a failed join.
      closeQuietly(server, 1011, 'internal error');
      throw err;
    }

    await this.occupied(now, true);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    // A refused client's frames are dropped; its first one is when its close
    // goes out (see `refuse`).
    if (isRefused(this.ctx, ws)) {
      closeRefused(this.ctx, ws);
      return;
    }
    const meta = this.loadMeta();
    if (isGone(meta)) return;
    const id = this.idOf(ws);
    const now = clock.now();

    if (typeof message !== 'string') {
      try {
        this.handleFrame(ws, id, new Uint8Array(message), now);
      } catch (err) {
        // As the Node relay: a frame the relay can't read closes its socket.
        logEvent('room-frame-rejected', err);
        if (err instanceof PresenceLimitError) closeQuietly(ws, 1008, 'too many states');
        else if (err instanceof AwarenessTooLargeError) closeQuietly(ws, 1009, 'message too big');
        else closeQuietly(ws, 1003, 'unsupported data');
        return;
      }
    }

    this.expirePresence(now);
    // Keepalive by piggyback: y-websocket reconnects after 30 s without a frame.
    this.renewIfQuiet(ws, id, now);
    if (this.bufferSince !== null && now - this.bufferSince >= FLUSH_AFTER_MS) this.flush();
    await this.occupied(now, false);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // Complete the closing handshake; harmless if the runtime already did.
    closeQuietly(ws, code === 1005 || code === 1006 ? 1000 : code, reason);
    // A refused socket was never a peer: nothing to drop.
    if (isRefused(this.ctx, ws)) return;
    await this.dropSocket(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    if (isRefused(this.ctx, ws)) return;
    await this.dropSocket(ws);
  }

  // alarm

  /**
   * The hourly occupancy check (contract item 11): stamp an occupied room,
   * delete a due one, otherwise sleep until it is due.
   */
  override async alarm(): Promise<void> {
    const meta = this.loadMeta();
    if (meta === null) return;
    const now = clock.now();
    try {
      this.flush();
      if (meta.tombstonedAt !== null) {
        await this.delete();
        return;
      }
      const open = this.openSockets();
      if (open.length > 0) {
        if (!keepaliveFallback.enabled || now >= meta.lastOccupiedAt + OCCUPANCY_CHECK_MS) {
          this.writeMeta({ ...meta, lastOccupiedAt: now });
        }
        if (keepaliveFallback.enabled) {
          for (const ws of open) {
            this.renewIfQuiet(ws, this.idOf(ws), now);
          }
        }
        await this.ctx.storage.setAlarm(this.nextOccupiedAlarm(now));
        return;
      }
      if (this.isDue(meta, now)) {
        await this.delete();
        return;
      }
      await this.ctx.storage.setAlarm(deadlineOf(meta));
    } catch (err) {
      logEvent('room-alarm-failed', err);
      try {
        await this.ctx.storage.setAlarm(now + RETRY_MS);
      } catch {
        // Storage is down too; the next entry re-arms (see `touch`).
      }
      throw err;
    }
  }

  // frames

  private handleFrame(ws: WebSocket, id: string, frame: Uint8Array, now: number): void {
    const inbound = readMessage(frame);
    if (inbound.type === 'sync') {
      const reply = answerSync(inbound.decoder, this.loadDoc(), id);
      if (reply !== null) this.send(ws, id, reply, now);
    } else if (inbound.type === 'awareness') {
      const { added, updated, removed, previousOwners } = this.presence.apply(
        id,
        inbound.update,
        now,
      );
      const changed = [...added, ...updated, ...removed];
      if (changed.length > 0) {
        this.broadcast(awarenessMessage(this.presence.encode(changed)), id, now);
        this.saveAttachment(ws, id);
        this.refreshAttachments(previousOwners);
      }
    }
  }

  /** A doc change from a socket: fan it out at once, persist it coalesced. */
  private onDocUpdate(update: Uint8Array, origin: unknown): void {
    if (origin === STORAGE_ORIGIN) return;
    this.broadcast(updateMessage(update), typeof origin === 'string' ? origin : null, clock.now());
    const meta = this.loadMeta();
    if (isGone(meta)) return;
    this.buffer.push(update);
    this.bufferBytes += update.byteLength;
    if (this.bufferSince === null) {
      this.bufferSince = clock.now();
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_AFTER_MS);
    }
    if (this.bufferBytes >= FLUSH_AT_BYTES) this.flush();
  }

  private async dropSocket(ws: WebSocket): Promise<void> {
    const id = this.idOf(ws);
    const removed = this.presence.removeOwnedBy(id, clock.now());
    this.lastSentAt.delete(id);
    const meta = this.loadMeta();
    if (isGone(meta)) return;
    const now = clock.now();
    if (removed.length > 0)
      this.broadcast(awarenessMessage(this.presence.encode(removed)), id, now);
    this.socketsChanged(now, ws);
    if (this.openSockets(ws).length === 0) this.flush();
    await this.touch();
  }

  /** Sends the relay's own state to a socket that has been sent nothing for a while. */
  private renewIfQuiet(ws: WebSocket, id: string, now: number): void {
    if (now - (this.lastSentAt.get(id) ?? Number.NEGATIVE_INFINITY) < KEEPALIVE_AFTER_MS) return;
    this.send(ws, id, awarenessMessage(this.presence.encode([], now)), now);
  }

  private expirePresence(now: number): void {
    const owners = new Set<string>();
    const expired = this.presence.expire(now, owners);
    if (expired.length > 0) {
      this.broadcast(awarenessMessage(this.presence.encode(expired)), null, now);
      this.refreshAttachments(owners);
    }
  }

  private send(ws: WebSocket, id: string, frame: Uint8Array, now: number): void {
    try {
      ws.send(frame);
      this.lastSentAt.set(id, now);
    } catch {
      // Closed between the check and the send; its close event cleans up.
    }
  }

  private broadcast(frame: Uint8Array, exceptId: string | null, now: number): void {
    for (const ws of this.openSockets()) {
      const id = this.idOf(ws);
      if (id !== exceptId) this.send(ws, id, frame, now);
    }
  }

  /** The peers: open sockets that were admitted (a refused one is closing, and tagged). */
  private openSockets(except?: WebSocket): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter(
        (ws) => ws !== except && ws.readyState === WebSocket.OPEN && !isRefused(this.ctx, ws),
      );
  }

  private idOf(ws: WebSocket): string {
    let id = this.socketIds.get(ws);
    if (id === undefined) {
      id = (ws.deserializeAttachment() as SocketAttachment | null)?.id ?? crypto.randomUUID();
      this.socketIds.set(ws, id);
    }
    return id;
  }

  /** Re-saves the attachments of sockets whose presence changed under them. */
  private refreshAttachments(ids: Iterable<string>): void {
    const stale = new Set(ids);
    if (stale.size === 0) return;
    for (const ws of this.ctx.getWebSockets()) {
      if (isRefused(this.ctx, ws)) continue;
      const id = this.idOf(ws);
      if (stale.has(id)) this.saveAttachment(ws, id);
    }
  }

  /** Overflow drops presence only: the identity must survive hibernation. */
  private saveAttachment(ws: WebSocket, id: string): void {
    const identity = this.identityOf(ws);
    let presence = this.presence.ownedBy(id);
    if (JSON.stringify(presence).length > ATTACHMENT_PRESENCE_BUDGET) presence = [];
    try {
      ws.serializeAttachment({ id, presence, ...identity } satisfies SocketAttachment);
    } catch {
      ws.serializeAttachment({ id, presence: [], ...identity } satisfies SocketAttachment);
    }
  }

  private identityOf(ws: WebSocket): SocketIdentity {
    let identity = this.identities.get(ws);
    if (identity === undefined) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      identity = { did: attachment?.did ?? null, participantId: attachment?.participantId ?? null };
      this.identities.set(ws, identity);
    }
    return identity;
  }

  // access holder (ADR-0059)

  /**
   * A socket was admitted (`except` unset) or dropped: stamp `everAdmitted` and
   * re-evaluate the holder. A failed write is logged, never fails the join or
   * close; memory still closes the keyless grace.
   */
  private socketsChanged(now: number, except?: WebSocket, opened: string | null = null): void {
    try {
      const meta = this.loadMeta()!;
      if (except === undefined && meta.everAdmitted !== true) {
        this.writeMeta({ ...meta, everAdmitted: true });
      }
      this.evaluateHolder(now, except, opened);
    } catch (err) {
      if (except === undefined) this.meta = { ...this.loadMeta()!, everAdmitted: true };
      logEvent('room-access-state-write-failed', err);
    }
  }

  /** Whether `participantId` has an open, admitted socket that proved it. */
  private hasBoundSocket(participantId: string, except?: WebSocket): boolean {
    return this.openSockets(except).some(
      (ws) => this.identityOf(ws).participantId === participantId,
    );
  }

  /** An open socket says it is `participantId` but did not prove it. */
  private isContested(participantId: string): boolean {
    return this.openSockets().some((ws) => {
      const { did, participantId: bound } = this.identityOf(ws);
      return did === participantId && bound !== participantId;
    });
  }

  /** May become the holder now: bound, uncontested, with an open bound socket. */
  private isClaimable(participantId: string): boolean {
    return (
      isParticipantId(participantId) &&
      this.hasBoundSocket(participantId) &&
      !this.isContested(participantId)
    );
  }

  /**
   * Re-derives the holder's absence from the open sockets, never from a close
   * event, and lapses it after {@link HOLDER_LAPSE_MS}, or when its socket
   * comes back (`opened`) after an absence while the doc names another host.
   * Writes only on change; returns the metadata in force.
   */
  private evaluateHolder(now: number, except?: WebSocket, opened: string | null = null): RoomMeta {
    const meta = this.loadMeta()!;
    const holder = meta.accessHolder ?? null;
    if (holder === null) return meta;
    let accessHolder: string | null = holder;
    let since = meta.holderAbsentSince ?? null;
    if (since !== null && now - since >= HOLDER_LAPSE_MS) {
      accessHolder = null;
      since = null;
    } else if (this.hasBoundSocket(holder, except)) {
      if (since !== null) {
        const host = this.docHost();
        if (opened === holder && typeof host === 'string' && host !== holder) accessHolder = null;
        since = null;
      }
    } else if (since === null) {
      since = now;
    }
    if (accessHolder === holder && since === (meta.holderAbsentSince ?? null)) return meta;
    const updated = { ...meta, accessHolder, holderAbsentSince: since };
    this.writeMeta(updated);
    return updated;
  }

  /**
   * The checks PATCH and handoff share: the caller's key matches its binding
   * (an unbound id compares against a dummy), and its id is not contested.
   */
  private proveCaller(caller: Caller, submitted: string | null): AccessRefusal | null {
    const id = caller.participantId;
    if (!keyDigestMatches(this.bindingOf(id), submitted ?? '')) return 'unauthenticated';
    return this.isContested(id) ? 'not-host' : null;
  }

  /**
   * ADR-0059's PATCH checks, after {@link evaluateHolder}: {@link proveCaller},
   * then holder (or claim, which writes the new holder) and doc host. Null when allowed.
   */
  private authorise(
    caller: Caller,
    submitted: string | null,
    meta: RoomMeta,
  ): AccessRefusal | null {
    const refusal = this.proveCaller(caller, submitted);
    if (refusal !== null) return refusal;
    const id = caller.participantId;
    const host = this.docHost();
    const holder = meta.accessHolder ?? null;
    if (holder === null) {
      // Claim: the doc host, connected and proven, takes the lapsed holder.
      if (host !== id || !this.hasBoundSocket(id)) return 'not-host';
      this.writeMeta({ ...meta, accessHolder: id, holderAbsentSince: null });
      return null;
    }
    // An absent doc host is the creator before its first socket seeded the doc.
    if (holder !== id || (host !== id && host !== undefined)) return 'not-host';
    return null;
  }

  /** `settings.hostParticipantId` as the doc holds it now; read, never trusted alone. */
  private docHost(): unknown {
    return this.loadDoc().getMap(DOC_SETTINGS).get(DOC_HOST);
  }

  /** {@link proveOrBind}, where a storage failure leaves the socket unbound rather than refused. */
  private tryProveOrBind(participantId: string, pkDigest: string): string | null {
    try {
      return this.proveOrBind(participantId, pkDigest);
    } catch (err) {
      logEvent('room-binding-failed', err);
      return null;
    }
  }

  /** The id this socket proved, or null: binds an unbound id while the table has room. */
  private proveOrBind(participantId: string, pkDigest: string): string | null {
    const stored = this.bindingOf(participantId);
    if (stored !== null) return keyDigestMatches(stored, pkDigest) ? participantId : null;
    const count = this.bindingsSql()
      .exec<{ n: number }>('SELECT COUNT(*) AS n FROM bindings')
      .one().n;
    if (count >= BINDINGS_PER_SEAT * this.config.roomCap) return null;
    this.insertBinding(participantId, pkDigest);
    return participantId;
  }

  private bindingOf(participantId: string): string | null {
    if (!isParticipantId(participantId)) return null;
    const rows = this.bindingsSql()
      .exec<{ digest: string }>(
        'SELECT digest FROM bindings WHERE participant_id = ?',
        participantId,
      )
      .toArray();
    return rows[0]?.digest ?? null;
  }

  private insertBinding(participantId: string, digest: string): void {
    this.bindingsSql().exec(
      'INSERT INTO bindings (participant_id, digest) VALUES (?, ?)',
      participantId,
      digest,
    );
  }

  /** The bindings table, made on first use: rooms from before ADR-0059 lack it. */
  private bindingsSql(): SqlStorage {
    const sql = this.ctx.storage.sql;
    if (!this.bindingsReady) {
      sql.exec(
        'CREATE TABLE IF NOT EXISTS bindings (participant_id TEXT PRIMARY KEY, digest TEXT NOT NULL)',
      );
      this.bindingsReady = true;
    }
    return sql;
  }

  // lifecycle

  /**
   * Every entry: the room's metadata, after making sure an alarm is set. The
   * alarm can be lost (it gives up after its retries), so each instance checks
   * once at start and then at most every {@link REARM_CHECK_MS}.
   */
  private async touch(): Promise<RoomMeta | null> {
    const meta = this.loadMeta();
    if (meta === null) return null;
    const now = clock.now();
    if (this.lastRearmCheck === null || now - this.lastRearmCheck >= REARM_CHECK_MS) {
      this.lastRearmCheck = now;
      try {
        if ((await this.ctx.storage.getAlarm()) === null) {
          await this.ctx.storage.setAlarm(now + OCCUPANCY_CHECK_MS);
        }
      } catch (err) {
        logEvent('room-rearm-failed', err);
        this.lastRearmCheck = null;
      }
    }
    // Re-read: the metadata may have changed during the awaits above.
    return this.loadMeta();
  }

  /**
   * The metadata of a room that may be entered, or null. A due room is deleted
   * here (lazy expiry), so it never depends on its alarm alone.
   */
  private async liveMeta(): Promise<RoomMeta | null> {
    const meta = await this.touch();
    if (isGone(meta)) return null;
    if (this.isDue(meta, clock.now())) {
      await this.delete();
      return null;
    }
    return meta;
  }

  /** A socket was accepted or sent a frame: keep the room's TTL from running. */
  private async occupied(now: number, accepted: boolean): Promise<void> {
    const meta = this.loadMeta();
    if (isGone(meta)) return;
    try {
      // The hourly alarm stamps occupancy; this covers an alarm that gave up.
      if (now - meta.lastOccupiedAt >= OCCUPANCY_CHECK_MS) {
        this.writeMeta({ ...meta, lastOccupiedAt: now });
      }
      if (accepted) {
        const alarm = await this.ctx.storage.getAlarm();
        const next = this.nextOccupiedAlarm(now);
        if (alarm === null || alarm > next) await this.ctx.storage.setAlarm(next);
      } else {
        await this.touch();
      }
    } catch (err) {
      logEvent('room-occupancy-write-failed', err);
    }
  }

  /** `min(occupancy check, keepalive due)`: both share the one alarm. */
  private nextOccupiedAlarm(now: number): number {
    const occupancyCheck = this.loadMeta()!.lastOccupiedAt + OCCUPANCY_CHECK_MS;
    return keepaliveFallback.enabled
      ? Math.min(occupancyCheck, now + KEEPALIVE_ALARM_MS)
      : occupancyCheck;
  }

  private isDue(meta: RoomMeta, now: number): boolean {
    return this.openSockets().length === 0 && now >= deadlineOf(meta);
  }

  /**
   * Deletes the room (contract item 11), in this order:
   *
   *   1. tombstone: from here on every entry answers unknown and nothing is flushed;
   *   2. release the code, so it can be reused;
   *   3. delete all storage.
   *
   * A failed release keeps the tombstone and retries from the alarm in 10 min.
   * Returns whether the room is gone.
   */
  private async delete(): Promise<boolean> {
    const meta = this.loadMeta();
    if (meta === null) return true;
    const now = clock.now();
    if (meta.tombstonedAt === null) {
      this.dropBuffer();
      // The room's content goes with the tombstone, so a release that keeps
      // failing never keeps it past the TTL.
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec('DELETE FROM log');
        this.ctx.storage.sql.exec('DELETE FROM snapshot');
        this.writeMeta({ ...meta, tombstonedAt: now });
      });
      this.doc?.destroy();
      this.doc = null;
      this.logRows = 0;
    }
    await this.ctx.storage.setAlarm(now + RETRY_MS);
    try {
      await codesStub(this.env, meta.code).release(meta.uuid);
    } catch (err) {
      logEvent('room-code-release-failed', err);
      return false;
    }
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    this.meta = null;
    this.bindingsReady = false;
    return true;
  }

  // storage

  private loadMeta(): RoomMeta | null {
    if (this.meta === undefined) {
      this.meta = this.ctx.storage.kv.get<RoomMeta>(META) ?? null;
      if (this.meta !== null) this.presence.bindRelay(this.meta.relayClientId);
    }
    return this.meta;
  }

  private writeMeta(meta: RoomMeta): void {
    this.ctx.storage.kv.put(META, meta);
    this.meta = meta;
    this.presence.bindRelay(meta.relayClientId);
  }

  /**
   * The doc, read from storage on first need: a new socket or a sync frame.
   * Awareness-only traffic after a wake never loads it.
   */
  private loadDoc(): Y.Doc {
    if (this.doc !== null) return this.doc;
    const doc = new Y.Doc();
    const sql = this.ctx.storage.sql;
    const chunks = sql
      .exec<{ data: ArrayBuffer }>('SELECT data FROM snapshot ORDER BY chunk')
      .toArray()
      .map((row) => new Uint8Array(row.data));
    if (chunks.length > 0) Y.applyUpdate(doc, concatBytes(chunks), STORAGE_ORIGIN);
    let rows = 0;
    for (const row of sql.exec<{ data: ArrayBuffer }>('SELECT data FROM log ORDER BY seq')) {
      Y.applyUpdate(doc, new Uint8Array(row.data), STORAGE_ORIGIN);
      rows++;
    }
    this.logRows = rows;
    doc.on('update', (update: Uint8Array, origin: unknown) => this.onDocUpdate(update, origin));
    this.doc = doc;
    return doc;
  }

  /**
   * Writes the buffered updates as one log row, or compacts the doc into the
   * snapshot once the log is long. A failed write is logged once; the room
   * keeps relaying from memory and writes the whole doc next time.
   */
  private flush(): void {
    const updates = this.buffer;
    this.dropBuffer();
    if (updates.length === 0 && !this.compactPending) return;
    const meta = this.loadMeta();
    if (isGone(meta) || this.doc === null) return;
    try {
      const merged = updates.length > 0 ? Y.mergeUpdates(updates) : null;
      if (
        this.compactPending ||
        this.logRows + 1 > COMPACT_AFTER_ROWS ||
        (merged !== null && merged.byteLength > SNAPSHOT_CHUNK_BYTES)
      ) {
        this.compact(this.doc);
      } else if (merged !== null) {
        this.ctx.storage.sql.exec('INSERT INTO log (data) VALUES (?)', merged.slice().buffer);
        this.logRows++;
      }
      this.compactPending = false;
    } catch (err) {
      this.compactPending = true;
      if (!this.writeFailureLogged) {
        this.writeFailureLogged = true;
        logEvent('room-storage-write-failed', err);
      }
    }
  }

  /** One transaction: the doc as snapshot chunks, and an empty log. */
  private compact(doc: Y.Doc): void {
    const state = Y.encodeStateAsUpdate(doc);
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      sql.exec('DELETE FROM log');
      sql.exec('DELETE FROM snapshot');
      for (
        let offset = 0, chunk = 0;
        offset < state.byteLength;
        offset += SNAPSHOT_CHUNK_BYTES, chunk++
      ) {
        const part = state.slice(offset, offset + SNAPSHOT_CHUNK_BYTES);
        sql.exec('INSERT INTO snapshot (chunk, data) VALUES (?, ?)', chunk, part.buffer);
      }
    });
    this.logRows = 0;
  }

  private dropBuffer(): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.buffer = [];
    this.bufferBytes = 0;
    this.bufferSince = null;
  }
}

/** No live room: never made, deleted, or tombstoned. */
function isGone(meta: RoomMeta | null): meta is null {
  return meta === null || meta.tombstonedAt !== null;
}

/** A well-formed caller's pk as the room would store it; null if malformed. */
async function submittedKeyDigest(uuid: string, caller: Caller | null): Promise<string | null> {
  if (caller === null || !isParticipantId(caller.participantId) || !isKeyHex(caller.pk)) {
    return null;
  }
  return keyDigest(uuid, caller.pk);
}

/** ADR-0059 released-client grace: one keyless PATCH on a fresh, never-joined keyless room. */
function graceOpen(meta: RoomMeta, now: number): boolean {
  return (
    meta.keylessGrace === true &&
    meta.everAdmitted === false &&
    now - meta.createdAt < KEYLESS_GRACE_MS
  );
}

function accessModeOf(meta: RoomMeta): AccessMode {
  return meta.digest !== null ? 'password' : 'open';
}

/** When an unoccupied room is deleted: TTL plus one occupancy-check interval. */
function deadlineOf(meta: RoomMeta): number {
  return meta.lastOccupiedAt + ROOM_TTL_MS + OCCUPANCY_CHECK_MS;
}

/** Why a join is refused after the upgrade (ADR-0016, ADR-0035). */
type JoinRefusal = Extract<JoinRejectionReason, 'wrong-password' | 'room-full'>;

/** Tag of a socket accepted only to be refused; it never becomes a peer. */
const REFUSED_TAG = 'refused';
/** The reason follows this prefix in a second tag, read back when the socket is closed. */
const REFUSAL_TAG_PREFIX = 'refused:';
/** A refused client that has sent nothing by then gets its close anyway. */
const REFUSED_CLOSE_FALLBACK_MS = 1_000;

function isRefused(ctx: DurableObjectState, ws: WebSocket): boolean {
  return ctx.getTags(ws).includes(REFUSED_TAG);
}

/**
 * Refuses a join after the upgrade, with its close code (ADR-0016, ADR-0035).
 *
 * The socket is accepted as hibernatable, tagged {@link REFUSED_TAG} and its
 * reason, and has no attachment, so it is never a peer: not counted, sent to,
 * restored, or read from. A plain `accept()` would keep the fetch invocation
 * open until the socket ends, which workerd ≤ 1.20261019.1 then logs as the
 * uncaught error "Network connection lost."
 * (https://github.com/cloudflare/workerd/issues/5290, fixed after that version
 * by cloudflare/workerd#7865).
 *
 * The close is not sent here but from `webSocketMessage`, on the client's first
 * frame, or after {@link REFUSED_CLOSE_FALLBACK_MS}. A hibernatable socket the
 * object closes before any frame has come in keeps its TCP connection until the
 * object is evicted, about 10 s after the closing handshake; one closed after a
 * frame ends it at once (https://github.com/cloudflare/workerd/issues/7566).
 * Clients that wait for the server to end the connection (Chrome for 2 s,
 * Node's WebSocket for 10 s) saw the refusal that late (#577). Every client the
 * relay has sends sync-step-1 on open, so its close goes out a round trip after
 * the upgrade; the fallback is for probes and broken clients. An eviction in
 * that second drops the timer, and that socket stays open until its client
 * gives up: the tag keeps it out of the room either way.
 *
 * At {@link REFUSED_SOCKETS_BOUND} held refused sockets the answer is a 503
 * with `Retry-After` instead, same status and body for both reasons.
 */
function refuse(ctx: DurableObjectState, reason: JoinRefusal): Response {
  if (ctx.getWebSockets(REFUSED_TAG).length >= REFUSED_SOCKETS_BOUND) {
    return json(
      503,
      { error: 'unavailable', detail: REFUSED_BOUND_DETAIL },
      { 'retry-after': String(REFUSED_RETRY_AFTER_S) },
    );
  }
  const { 0: client, 1: server } = new WebSocketPair();
  ctx.acceptWebSocket(server, [REFUSED_TAG, `${REFUSAL_TAG_PREFIX}${reason}`]);
  setTimeout(() => closeRefused(ctx, server), REFUSED_CLOSE_FALLBACK_MS);
  return new Response(null, { status: 101, webSocket: client });
}

/** Sends a refused socket its close code, unless it already has one or is gone. */
function closeRefused(ctx: DurableObjectState, ws: WebSocket): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    const tag = ctx.getTags(ws).find((t) => t.startsWith(REFUSAL_TAG_PREFIX));
    if (tag === undefined) return;
    const reason = tag.slice(REFUSAL_TAG_PREFIX.length) as JoinRefusal;
    ws.close(JOIN_REJECTION_CLOSE_CODES[reason], reason);
  } catch {
    // Closed or released meanwhile.
  }
}

function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}
