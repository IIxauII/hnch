/**
 * The awareness states a room holds (contract item 8).
 *
 * Wire-compatible with y-protocols' awareness update (`varUint count`, then per
 * client `varUint clientID, varUint clock, varString JSON state`) and with its
 * apply rules, but built for a Durable Object:
 *
 * - No interval timer, which would keep the object from hibernating. A state
 *   not renewed for {@link PRESENCE_TIMEOUT_MS} is dropped by `expire()`, which
 *   the room calls on inbound events.
 * - Each state remembers the socket that last announced it, so a socket's
 *   states can be dropped when it closes and saved in its attachment.
 * - States stay the client's JSON text. The relay checks the text parses (a
 *   peer's y-protocols would throw on it otherwise) and never reads it.
 */

import { MAX_ROOM_PARTICIPANTS } from '@hnch/shared/auth';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

/** y-protocols' `outdatedTimeout`: clients renew every 15 s and drop after 30 s. */
export const PRESENCE_TIMEOUT_MS = 30_000;

/** One client's state, as kept in memory and in a socket attachment. */
export interface PresenceEntry {
  readonly clientId: number;
  readonly clock: number;
  /** The client's JSON text, never `null`. */
  readonly state: string;
  /** When the client last renewed it (ms). */
  readonly updatedAt: number;
}

export interface PresenceChange {
  readonly added: number[];
  readonly updated: number[];
  readonly removed: number[];
  /**
   * Other sockets that held a state this update removed or took over; their
   * attachments are out of date.
   */
  readonly previousOwners: string[];
}

interface Held extends PresenceEntry {
  readonly owner: string;
}

const NULL_STATE = 'null';

interface Entry {
  readonly clientId: number;
  readonly clock: number;
  readonly state: string;
  readonly isNull: boolean;
}

/**
 * States one socket may hold. A client announces one; a few allow for odd
 * clients, and the cap keeps a peer from growing the room's memory unbounded.
 */
export const MAX_STATES_PER_SOCKET = 8;

/**
 * The most one state may weigh (its JSON text and length prefix). A hnch client
 * announces `{"participantId": "<uuid>"}`, about 60 bytes.
 */
export const MAX_STATE_BYTES = 1024;

/** Sockets one room admits (ADR-0024); the relay's own frames are sized for it. */
const ROOM_CAP = MAX_ROOM_PARTICIPANTS;

/**
 * The most an awareness update may weigh. A joiner's y-websocket echoes the
 * whole opening presence as one update, so this must fit every state a full
 * room can hold: cap x states per socket x (state + client ID and clock).
 * That is about 163 KiB.
 */
export const MAX_AWARENESS_BYTES = 192 * 1024;

/**
 * Clients whose clock is remembered after removal, room-wide. Enough for a full
 * room to turn over several times within the timeout; past it, the oldest go.
 */
export const MAX_REMEMBERED = 4 * ROOM_CAP * MAX_STATES_PER_SOCKET;

/** An awareness update, or a state in it, past its size limit. */
export class AwarenessTooLargeError extends Error {
  override readonly name = 'AwarenessTooLargeError';
}

/** An update that would make one socket hold more than its share of states. */
export class PresenceLimitError extends Error {
  override readonly name = 'PresenceLimitError';
}

export class Presence {
  private readonly held = new Map<number, Held>();
  /**
   * Last clock seen per client, including removed ones, so a late update with
   * an older clock can't bring a state back. A removed client's clock is kept
   * for {@link PRESENCE_TIMEOUT_MS} (`removedAt`), after which no client still
   * holds the state it would revive.
   */
  private readonly clocks = new Map<number, number>();
  private readonly removedAt = new Map<number, number>();
  private relay: { clientId: number; clock: number } | undefined;

  /**
   * Applies an awareness update that arrived on socket `owner`. Throws, leaving
   * the store unchanged, on malformed input or past {@link MAX_STATES_PER_SOCKET}.
   * Entries for the relay's own client ID (see {@link bindRelay}) are ignored:
   * peers echo it back.
   */
  apply(owner: string, update: Uint8Array, now: number): PresenceChange {
    if (update.byteLength > MAX_AWARENESS_BYTES) {
      throw new AwarenessTooLargeError(`awareness update over ${MAX_AWARENESS_BYTES} bytes`);
    }
    // A copy: `update` is a view into the whole frame, and lib0 bounds-checks a
    // string's length only against the buffer, so it could read past the update.
    const decoder = decoding.createDecoder(update.slice());
    const count = decoding.readVarUint(decoder);
    const entries: Entry[] = [];
    for (let i = 0; i < count; i++) {
      const clientId = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const stateStart = decoder.pos;
      const state = decoding.readVarString(decoder);
      if (decoder.pos - stateStart > MAX_STATE_BYTES) {
        throw new AwarenessTooLargeError(`awareness state over ${MAX_STATE_BYTES} bytes`);
      }
      const isNull = JSON.parse(state) === null; // throws on text a peer could not parse
      if (clientId !== this.relay?.clientId) entries.push({ clientId, clock, state, isNull });
    }
    // Work out the frame's net effect first, on an overlay of the store that is
    // updated after each entry exactly as the commit below mutates it, so the
    // cap check and the commit can't disagree (an id may appear twice in a frame).
    // Only entries this socket would take over count: y-websocket echoes every
    // change it applies, so a joiner repeats the whole opening presence, and
    // those entries are not newer than what the room holds.
    const overlay = new Map<number, { clock: number | undefined; held: Held | undefined }>();
    // Per client, what the store held before the frame and the frame's last word.
    const staged = new Map<number, { known: boolean; previous: Held | undefined; entry: Entry }>();
    const owned = new Set(this.ownedBy(owner).map((e) => e.clientId));
    for (const entry of entries) {
      const { clientId, clock, isNull } = entry;
      const seen = overlay.get(clientId) ?? {
        clock: this.clocks.get(clientId),
        held: this.held.get(clientId),
      };
      const newer = (seen.clock ?? 0) < clock;
      const sameClockRemoval = seen.clock === clock && isNull && seen.held !== undefined;
      // A removal of a state the room doesn't hold has nothing to take away.
      if ((!newer && !sameClockRemoval) || (isNull && seen.held === undefined)) continue;

      staged.set(clientId, {
        known: staged.get(clientId)?.known ?? seen.clock !== undefined,
        previous: staged.has(clientId) ? staged.get(clientId)!.previous : seen.held,
        entry,
      });
      overlay.set(clientId, {
        clock,
        held: isNull ? undefined : { clientId, clock, state: entry.state, updatedAt: now, owner },
      });
      if (isNull) owned.delete(clientId);
      else owned.add(clientId);
    }
    if (owned.size > MAX_STATES_PER_SOCKET) {
      throw new PresenceLimitError(`more than ${MAX_STATES_PER_SOCKET} states on one socket`);
    }

    // Commit each client's last word. One that went from nothing to nothing
    // within the frame (added, then removed) leaves no trace.
    const change: PresenceChange = { added: [], updated: [], removed: [], previousOwners: [] };
    for (const { known, previous, entry } of staged.values()) {
      const { clientId, clock, state, isNull } = entry;
      if (isNull && previous === undefined) continue;
      if (previous !== undefined && previous.owner !== owner) {
        change.previousOwners.push(previous.owner);
      }
      this.clocks.set(clientId, clock);
      if (isNull) {
        this.forget(clientId, now);
        this.held.delete(clientId);
        change.removed.push(clientId);
      } else {
        this.removedAt.delete(clientId);
        this.held.set(clientId, { clientId, clock, state, updatedAt: now, owner });
        (!known || previous === undefined ? change.added : change.updated).push(clientId);
      }
    }
    this.prune();
    return change;
  }

  /** Remembers a removal, as the newest of the removed. */
  private forget(clientId: number, now: number): void {
    // Delete first so the map's insertion order is the order of removal.
    this.removedAt.delete(clientId);
    this.removedAt.set(clientId, now);
  }

  /** Holds the removed clients' clocks to {@link MAX_REMEMBERED}, oldest first. */
  private prune(): void {
    for (const clientId of this.removedAt.keys()) {
      if (this.removedAt.size <= MAX_REMEMBERED) break;
      this.removedAt.delete(clientId);
      this.clocks.delete(clientId);
    }
  }

  /**
   * Sets the relay's own awareness client ID, once the room knows it. The relay
   * announces a `{}` state under it; peers' echoes of it are never adopted.
   */
  bindRelay(clientId: number): void {
    this.relay ??= { clientId, clock: 0 };
  }

  /**
   * Encodes the states (or removals) of `clientIds` as one awareness update.
   * With `relayAt` (the time, ms) the relay's own `{}` state follows, at a clock
   * that keeps rising across wakes and evictions.
   */
  encode(clientIds: readonly number[], relayAt?: number): Uint8Array {
    const relay = relayAt === undefined ? null : this.nextRelayState(relayAt);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, clientIds.length + (relay === null ? 0 : 1));
    for (const clientId of clientIds) {
      const held = this.held.get(clientId);
      encoding.writeVarUint(encoder, clientId);
      encoding.writeVarUint(encoder, held?.clock ?? this.clocks.get(clientId) ?? 0);
      encoding.writeVarString(encoder, held?.state ?? NULL_STATE);
    }
    if (relay !== null) {
      encoding.writeVarUint(encoder, relay.clientId);
      encoding.writeVarUint(encoder, relay.clock);
      encoding.writeVarString(encoder, '{}');
    }
    return encoding.toUint8Array(encoder);
  }

  private nextRelayState(now: number): { clientId: number; clock: number } {
    const relay = this.relay;
    if (relay === undefined) throw new Error('relay client ID not bound');
    relay.clock = Math.max(relay.clock + 1, Math.floor(now / 1000));
    return relay;
  }

  /** Drops what socket `owner` announced; returns the client IDs removed. */
  removeOwnedBy(owner: string, now: number): number[] {
    return this.remove(
      [...this.held.values()].filter((h) => h.owner === owner),
      now,
    );
  }

  /**
   * Drops states not renewed for {@link PRESENCE_TIMEOUT_MS}; returns their
   * IDs, adding the sockets that held them to `owners`. Also forgets the clocks
   * of clients removed that long ago.
   */
  expire(now: number, owners?: Set<string>): number[] {
    for (const [clientId, at] of this.removedAt) {
      if (now - at >= PRESENCE_TIMEOUT_MS) {
        this.removedAt.delete(clientId);
        this.clocks.delete(clientId);
      }
    }
    const stale = [...this.held.values()].filter((h) => now - h.updatedAt >= PRESENCE_TIMEOUT_MS);
    for (const { owner } of stale) owners?.add(owner);
    return this.remove(stale, now);
  }

  /** Clients whose clock is remembered, held or recently removed. */
  remembered(): number {
    return this.clocks.size;
  }

  /** The states socket `owner` last announced, for its attachment. */
  ownedBy(owner: string): PresenceEntry[] {
    return [...this.held.values()]
      .filter((h) => h.owner === owner)
      .map(({ clientId, clock, state, updatedAt }) => ({ clientId, clock, state, updatedAt }));
  }

  /** Puts back what a socket held before the object was evicted or hibernated. */
  restore(owner: string, entries: readonly PresenceEntry[]): void {
    for (const entry of entries) {
      const current = this.held.get(entry.clientId);
      if (current !== undefined && current.clock >= entry.clock) continue;
      this.held.set(entry.clientId, { ...entry, owner });
      this.clocks.set(entry.clientId, Math.max(entry.clock, this.clocks.get(entry.clientId) ?? 0));
    }
  }

  /** IDs of every state held. */
  clientIds(): number[] {
    return [...this.held.keys()];
  }

  private remove(states: readonly Held[], now: number): number[] {
    for (const { clientId, clock } of states) {
      this.held.delete(clientId);
      // The clock stays: y-protocols' removeAwarenessStates bumps it only for
      // the local client, and peers apply a removal at the clock they hold.
      this.clocks.set(clientId, clock);
      this.forget(clientId, now);
    }
    this.prune();
    return states.map((s) => s.clientId);
  }
}
