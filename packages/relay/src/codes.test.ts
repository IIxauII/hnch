/**
 * `Codes`: one room per code among live rooms (ADR-0008, contract items 2 and 11).
 */

import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { CLAIM_GRACE_MS } from './codes';
import { ROOM_TTL_MS, OCCUPANCY_CHECK_MS } from './room';
import { createRoom, restoreClock, setNow } from './test-support/peer';

const codesStub = (code: string) => env.CODES.get(env.CODES.idFromName(code));

describe('Codes', () => {
  it('gives a free code to the first claimant, and only to it', async () => {
    const codes = codesStub('FREE01');
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    expect(await codes.claim(a)).toBe(true);
    expect(await codes.lookup()).toBe(a);
    expect(await codes.claim(b)).toBe(false);
    // A claim by the holder again is idempotent.
    expect(await codes.claim(a)).toBe(true);
    expect(await codes.lookup()).toBe(a);
  });

  it('refuses the code of a live room', async () => {
    const { uuid, code } = await createRoom();
    expect(await codesStub(code).claim(crypto.randomUUID())).toBe(false);
    expect(await codesStub(code).lookup()).toBe(uuid);
  });

  it('keeps a fresh claim whose room is still being created', async () => {
    const t0 = Date.now();
    setNow(t0);
    try {
      const codes = codesStub('INIT01');
      const creating = crypto.randomUUID();
      await codes.claim(creating);
      // Its room is not initialised yet: another create must not take the code.
      setNow(t0 + CLAIM_GRACE_MS - 1);
      expect(await codes.claim(crypto.randomUUID())).toBe(false);
      expect(await codes.lookup()).toBe(creating);
    } finally {
      restoreClock();
    }
  });

  it('treats a holder that never became a room as free once its claim is old', async () => {
    const t0 = Date.now();
    setNow(t0);
    try {
      const codes = codesStub('ORPHAN');
      await codes.claim(crypto.randomUUID());
      setNow(t0 + CLAIM_GRACE_MS);
      const next = crypto.randomUUID();
      expect(await codes.claim(next)).toBe(true);
      expect(await codes.lookup()).toBe(next);
    } finally {
      restoreClock();
    }
  });

  it('frees the code of a room that has expired, which deletes on the way', async () => {
    const t0 = Date.now();
    setNow(t0);
    try {
      const { code } = await createRoom();
      setNow(t0 + ROOM_TTL_MS + OCCUPANCY_CHECK_MS);
      const next = crypto.randomUUID();
      expect(await codesStub(code).claim(next)).toBe(true);
      expect(await codesStub(code).lookup()).toBe(next);
    } finally {
      restoreClock();
    }
  });

  it('releases only for the holder, and releasing twice is a no-op', async () => {
    const codes = codesStub('REL001');
    const [holder, other] = [crypto.randomUUID(), crypto.randomUUID()];
    await codes.claim(holder);

    await codes.release(other);
    expect(await codes.lookup()).toBe(holder);

    await codes.release(holder);
    expect(await codes.lookup()).toBeNull();
    await codes.release(holder);
    expect(await codes.lookup()).toBeNull();
  });
});
