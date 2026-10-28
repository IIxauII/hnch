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

/**
 * States one socket may hold. A client announces one; a few allow for odd
 * clients, and the cap keeps a peer from growing the room's memory unbounded.
 */
export const MAX_STATES_PER_SOCKET = 8;

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
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    const entries: { clientId: number; clock: number; state: string; isNull: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const clientId = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const state = decoding.readVarString(decoder);
      const isNull = JSON.parse(state) === null; // throws on text a peer could not parse
      if (clientId !== this.relay?.clientId) entries.push({ clientId, clock, state, isNull });
    }
    // Only entries this socket would take over count toward its cap. y-websocket
    // echoes every change it applies, so a joiner repeats the whole opening
    // presence; those are not newer than what the room holds and cost nothing.
    const owned = new Set(this.ownedBy(owner).map((e) => e.clientId));
    for (const { clientId, clock, isNull } of entries) {
      if (!this.takesOver(clientId, clock, isNull)) continue;
      if (isNull) owned.delete(clientId);
      else owned.add(clientId);
    }
    if (owned.size > MAX_STATES_PER_SOCKET) {
      throw new PresenceLimitError(`more than ${MAX_STATES_PER_SOCKET} states on one socket`);
    }

    const change: PresenceChange = { added: [], updated: [], removed: [], previousOwners: [] };
    for (const { clientId, clock, state, isNull } of entries) {
      if (!this.takesOver(clientId, clock, isNull)) continue;
      const known = this.clocks.get(clientId);
      const previous = this.held.get(clientId);
      if (previous !== undefined && previous.owner !== owner) {
        change.previousOwners.push(previous.owner);
      }

      this.clocks.set(clientId, clock);
      if (isNull) {
        this.removedAt.set(clientId, now);
        this.held.delete(clientId);
        if (known !== undefined && previous !== undefined) change.removed.push(clientId);
      } else {
        this.removedAt.delete(clientId);
        this.held.set(clientId, { clientId, clock, state, updatedAt: now, owner });
        (known === undefined || previous === undefined ? change.added : change.updated).push(
          clientId,
        );
      }
    }
    return change;
  }

  /** y-protocols' rule: a newer clock, or a removal at the held clock. */
  private takesOver(clientId: number, clock: number, isNull: boolean): boolean {
    const current = this.clocks.get(clientId) ?? 0;
    return current < clock || (current === clock && isNull && this.held.has(clientId));
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
      this.removedAt.set(clientId, now);
    }
    return states.map((s) => s.clientId);
  }
}
