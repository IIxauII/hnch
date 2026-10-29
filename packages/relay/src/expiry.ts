/**
 * `Expiry` Durable Object: one per UTC day, listing the rooms created that day
 * and the rooms a sweep found still live that day.
 *
 * A backstop for room deletion (contract item 11). Each room deletes itself
 * through its alarm and through lazy expiry on entry; the daily cron sweeps the
 * last 30 days here so a room whose alarm gave up is still deleted. A room the
 * sweep finds live moves to the sweep's day, so it stays covered however long
 * it lives.
 */

import { DurableObject } from 'cloudflare:workers';
import { logEvent, roomStub } from './stubs';

const PREFIX = 'room:';
/** Where the last sweep stopped, so the next one picks up after it. */
const CURSOR = 'cursor';

/**
 * Rooms checked per sweep. Each check is a subrequest, and the Free plan caps
 * those per invocation; the rest wait for the next day's sweep, which starts
 * where this one stopped.
 */
export const SWEEP_BATCH = 40;

export interface SweepResult {
  readonly deleted: number;
  readonly gone: number;
  /** Still live, and now listed under the sweep's day instead. */
  readonly moved: number;
  /** Still live, and still listed here (its move failed). */
  readonly live: number;
  readonly failed: number;
}

export class Expiry extends DurableObject<Env> {
  register(uuid: string): void {
    this.ctx.storage.kv.put(PREFIX + uuid, 1);
  }

  /**
   * Asks each listed room to expire if due, or else to list itself under
   * `today`; forgets the deleted, gone and moved ones.
   */
  async sweep(today: string): Promise<SweepResult> {
    const kv = this.ctx.storage.kv;
    const cursor = kv.get<string>(CURSOR);
    const page = (startAfter: string | undefined) =>
      [
        ...kv.list(
          startAfter === undefined
            ? { prefix: PREFIX, limit: SWEEP_BATCH }
            : { prefix: PREFIX, limit: SWEEP_BATCH, startAfter },
        ),
      ].map(([key]) => key);
    let keys = page(cursor);
    // Past the end: start over from the first room.
    if (keys.length === 0 && cursor !== undefined) keys = page(undefined);
    if (keys.length > 0) kv.put(CURSOR, keys.at(-1)!);
    const uuids = keys.map((key) => key.slice(PREFIX.length));

    const result = { deleted: 0, gone: 0, moved: 0, live: 0, failed: 0 };
    for (const uuid of uuids) {
      try {
        const outcome = await roomStub(this.env, uuid).expireIfDue(today);
        result[outcome]++;
        if (outcome !== 'live') this.ctx.storage.kv.delete(PREFIX + uuid);
      } catch (err) {
        result.failed++;
        logEvent('expiry-sweep-room-failed', err);
      }
    }
    if ([...this.ctx.storage.kv.list({ prefix: PREFIX, limit: 1 })].length === 0) {
      await this.ctx.storage.deleteAll();
    }
    return result;
  }
}
