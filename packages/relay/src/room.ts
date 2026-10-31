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
 */

import { DurableObject } from 'cloudflare:workers';
import * as Y from 'yjs';
import { JOIN_REJECTION_CLOSE_CODES } from '@hnch/shared/auth';
import { clock } from './clock';
import { concatBytes } from './bytes';
import { configOf, type RelayConfig } from './config';
import { passwordDigest, passwordMatches } from './digest';
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
}

export type AccessMode = 'open' | 'password';
export type ExpireOutcome = 'deleted' | 'gone' | 'moved' | 'live';

interface SocketAttachment {
  readonly id: string;
  readonly presence: readonly PresenceEntry[];
}

export class Room extends DurableObject<Env> {
  private readonly config: RelayConfig;
  private readonly presence = new Presence();
  /** When each socket (by attachment id) was last sent a frame. */
  private readonly lastSentAt = new Map<string, number>();
  private readonly socketIds = new WeakMap<WebSocket, string>();

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

  // ------------------------------------------------------------ RPC

  /** Creates the room. Called once by the Worker, after the code is claimed. */
  async init(uuid: string, code: string, passwordHash: string | null): Promise<void> {
    if (this.loadMeta() !== null) throw new Error('room already initialised');
    const digest = passwordHash === null ? null : await passwordDigest(uuid, passwordHash);
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
    };
    this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      sql.exec('CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY, data BLOB NOT NULL)');
      sql.exec(
        'CREATE TABLE IF NOT EXISTS snapshot (chunk INTEGER PRIMARY KEY, data BLOB NOT NULL)',
      );
      this.writeMeta(meta);
    });
    await this.ctx.storage.setAlarm(now + OCCUPANCY_CHECK_MS);
  }

  /** The room's access mode, or null if it is unknown (never made, deleted, expired). */
  async info(): Promise<{ accessMode: AccessMode } | null> {
    const meta = await this.liveMeta();
    return meta === null ? null : { accessMode: accessModeOf(meta) };
  }

  /** Sets or clears the password. Open sockets stay. Null if the room is unknown. */
  async setPassword(passwordHash: string | null): Promise<AccessMode | null> {
    const meta = await this.liveMeta();
    if (meta === null) return null;
    const digest = passwordHash === null ? null : await passwordDigest(meta.uuid, passwordHash);
    const current = this.loadMeta();
    if (isGone(current)) return null;
    const updated = { ...current, digest };
    this.writeMeta(updated);
    return accessModeOf(updated);
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

  /** ADR-0027 `DELETE /test/rooms/:uuid`: delete now. False if the room is unknown. */
  async testEvict(): Promise<boolean> {
    const meta = this.loadMeta();
    if (isGone(meta)) return false;
    await this.delete();
    return true;
  }

  // ------------------------------------------------------------ WebSocket

  /** `WS /ws/:uuid`, forwarded by the Worker once it saw an upgrade request. */
  override async fetch(request: Request): Promise<Response> {
    const meta = await this.liveMeta();
    // Pre-upgrade rejections stay plain HTTP (ADR-0016, ADR-0050).
    if (meta === null) return new Response(null, { status: 404 });
    const pw = new URL(request.url).searchParams.get('pw');
    if (meta.digest !== null && !pw) return new Response(null, { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    // The password can be changed or cleared while it is being checked (the
    // object's input gate stays open across this await), so a verdict counts only
    // against the digest still in force; otherwise check again, a few times.
    let digest = meta.digest;
    let admitted = digest === null;
    for (let attempt = 0; digest !== null && attempt < PASSWORD_CHECKS; attempt++) {
      const matches = await passwordMatches(meta.uuid, pw!, digest);
      const current = this.loadMeta();
      // The room may have been deleted while the password was checked.
      if (isGone(current)) return new Response(null, { status: 404 });
      if (current.digest === digest) {
        admitted = matches;
        break;
      }
      digest = current.digest;
      admitted = digest === null;
    }
    if (!admitted) return refuse(this.ctx, server, client, 'wrong-password');

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
      return refuse(this.ctx, server, client, 'room-full');
    }
    const id = crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    try {
      this.socketIds.set(server, id);
      this.saveAttachment(server, id);
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
    // A refused client can send frames before it reads its close; drop them.
    if (isRefused(this.ctx, ws)) return;
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

  // ------------------------------------------------------------ alarm

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

  // ------------------------------------------------------------ frames

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

  private saveAttachment(ws: WebSocket, id: string): void {
    let presence = this.presence.ownedBy(id);
    if (JSON.stringify(presence).length > ATTACHMENT_PRESENCE_BUDGET) presence = [];
    try {
      ws.serializeAttachment({ id, presence } satisfies SocketAttachment);
    } catch {
      ws.serializeAttachment({ id, presence: [] } satisfies SocketAttachment);
    }
  }

  // ------------------------------------------------------------ lifecycle

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
    return true;
  }

  // ------------------------------------------------------------ storage

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

function accessModeOf(meta: RoomMeta): AccessMode {
  return meta.digest !== null ? 'password' : 'open';
}

/** When an unoccupied room is deleted: TTL plus one occupancy-check interval. */
function deadlineOf(meta: RoomMeta): number {
  return meta.lastOccupiedAt + ROOM_TTL_MS + OCCUPANCY_CHECK_MS;
}

/** Tag of a socket accepted only to be refused; it never becomes a peer. */
const REFUSED_TAG = 'refused';

function isRefused(ctx: DurableObjectState, ws: WebSocket): boolean {
  return ctx.getTags(ws).includes(REFUSED_TAG);
}

/**
 * Refuses a join after the upgrade, with its close code (ADR-0016, ADR-0035).
 *
 * The socket is accepted as hibernatable, tagged {@link REFUSED_TAG}, and has
 * no attachment, so it is never a peer: not counted, sent to, restored, or read
 * from. A plain `accept()` would keep the fetch invocation open until the socket
 * ends, which workerd ≤ 1.20261019.1 then logs as the uncaught error "Network
 * connection lost." (https://github.com/cloudflare/workerd/issues/5290).
 */
function refuse(
  ctx: DurableObjectState,
  server: WebSocket,
  client: WebSocket,
  reason: 'wrong-password' | 'room-full',
): Response {
  ctx.acceptWebSocket(server, [REFUSED_TAG]);
  server.close(JOIN_REJECTION_CLOSE_CODES[reason], reason);
  return new Response(null, { status: 101, webSocket: client });
}

function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}
