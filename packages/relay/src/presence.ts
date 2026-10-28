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

  /**
   * Applies an awareness update that arrived on socket `owner`. Throws, leaving
   * the store unchanged, on malformed input or past {@link MAX_STATES_PER_SOCKET}.
   */
  apply(owner: string, update: Uint8Array, now: number): PresenceChange {
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    const entries: { clientId: number; clock: number; state: string }[] = [];
    for (let i = 0; i < count; i++) {
      const clientId = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const state = decoding.readVarString(decoder);
      JSON.parse(state); // throws on text a peer could not parse
      entries.push({ clientId, clock, state });
    }
    const owned = new Set(this.ownedBy(owner).map((e) => e.clientId));
    for (const { clientId, state } of entries) {
      if (isNullState(state)) owned.delete(clientId);
      else owned.add(clientId);
    }
    if (owned.size > MAX_STATES_PER_SOCKET) {
      throw new PresenceLimitError(`more than ${MAX_STATES_PER_SOCKET} states on one socket`);
    }

    const change: PresenceChange = { added: [], updated: [], removed: [] };
    for (const { clientId, clock, state } of entries) {
      const known = this.clocks.get(clientId);
      const current = known ?? 0;
      const isNull = isNullState(state);
      const newer = current < clock;
      const sameClockRemoval = current === clock && isNull && this.held.has(clientId);
      if (!newer && !sameClockRemoval) continue;

      this.clocks.set(clientId, clock);
      if (isNull) {
        this.removedAt.set(clientId, now);
        const wasHeld = this.held.delete(clientId);
        if (known !== undefined && wasHeld) change.removed.push(clientId);
      } else {
        this.removedAt.delete(clientId);
        const wasHeld = this.held.has(clientId);
        this.held.set(clientId, { clientId, clock, state, updatedAt: now, owner });
        (known === undefined || !wasHeld ? change.added : change.updated).push(clientId);
      }
    }
    return change;
  }

  /**
   * Encodes the states (or removals) of `clientIds` as one awareness update,
   * followed by `extra` entries that are not held here (the relay's own state).
   */
  encode(
    clientIds: readonly number[],
    extra: readonly Pick<PresenceEntry, 'clientId' | 'clock' | 'state'>[] = [],
  ): Uint8Array {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, clientIds.length + extra.length);
    for (const clientId of clientIds) {
      const held = this.held.get(clientId);
      encoding.writeVarUint(encoder, clientId);
      encoding.writeVarUint(encoder, held?.clock ?? this.clocks.get(clientId) ?? 0);
      encoding.writeVarString(encoder, held?.state ?? NULL_STATE);
    }
    for (const { clientId, clock, state } of extra) {
      encoding.writeVarUint(encoder, clientId);
      encoding.writeVarUint(encoder, clock);
      encoding.writeVarString(encoder, state);
    }
    return encoding.toUint8Array(encoder);
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
   * IDs. Also forgets the clocks of clients removed that long ago.
   */
  expire(now: number): number[] {
    for (const [clientId, at] of this.removedAt) {
      if (now - at >= PRESENCE_TIMEOUT_MS) {
        this.removedAt.delete(clientId);
        this.clocks.delete(clientId);
      }
    }
    return this.remove(
      [...this.held.values()].filter((h) => now - h.updatedAt >= PRESENCE_TIMEOUT_MS),
      now,
    );
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
      // One past the last clock, as y-protocols' removeAwarenessStates does,
      // so clients holding the state apply the removal.
      this.clocks.set(clientId, clock + 1);
      this.removedAt.set(clientId, now);
    }
    return states.map((s) => s.clientId);
  }
}

function isNullState(state: string): boolean {
  return state === NULL_STATE || JSON.parse(state) === null;
}
