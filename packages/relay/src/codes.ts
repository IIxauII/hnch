/**
 * `Codes` Durable Object: one per room code (ADR-0008), holding the UUID of the
 * room that owns it. Codes stay unique across live rooms without a global
 * registry, and become reusable once their room is deleted or tombstoned.
 *
 * Storage (kv): `uuid` the holder, `claimedAt` when it claimed the code.
 */

import { DurableObject } from 'cloudflare:workers';
import { clock } from './clock';
import { roomStub } from './stubs';

const HOLDER = 'uuid';
const CLAIMED_AT = 'claimedAt';

/**
 * How long a holder whose room reports unknown keeps the code anyway: its room
 * may still be being created (the Worker claims the code, then initialises the
 * room). Past this, an unknown holder is a dead one.
 */
export const CLAIM_GRACE_MS = 60_000;

export class Codes extends DurableObject<Env> {
  /** The room holding this code, or null. */
  lookup(): string | null {
    return this.ctx.storage.kv.get<string>(HOLDER) ?? null;
  }

  /**
   * Takes the code for `uuid` if it is free: no holder, or a holder room that
   * reports itself unknown (deleted, tombstoned, or never initialised) and
   * claimed the code over {@link CLAIM_GRACE_MS} ago. Returns whether `uuid`
   * now holds it.
   */
  async claim(uuid: string): Promise<boolean> {
    const holder = this.lookup();
    if (holder === uuid) return true;
    if (holder !== null) {
      const claimedAt = this.ctx.storage.kv.get<number>(CLAIMED_AT) ?? 0;
      if (clock.now() - claimedAt < CLAIM_GRACE_MS) return false;
      try {
        if ((await roomStub(this.env, holder).info()) !== null) return false;
      } catch {
        // No verdict on the holder: leave the code to it, the caller tries another.
        return false;
      }
    }
    // Other requests ran during the await. Take the code only if nobody else
    // did; the dead holder may have released it meanwhile.
    const current = this.lookup();
    if (current !== null && current !== holder) return false;
    this.ctx.storage.kv.put(HOLDER, uuid);
    this.ctx.storage.kv.put(CLAIMED_AT, clock.now());
    return true;
  }

  /**
   * Frees the code if `uuid` still holds it. Idempotent: a code already free,
   * or held by another room, is left as it is.
   */
  async release(uuid: string): Promise<void> {
    if (this.lookup() !== uuid) return;
    await this.ctx.storage.deleteAll();
  }
}
