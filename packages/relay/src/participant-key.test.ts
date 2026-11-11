import { describe, expect, it } from 'vitest';
import { isKeyHex, participantKey } from './participant-key';

const UUID = '0f8e1c52-3b7a-4d2e-9c61-5a4b3c2d1e0f';
const DEVICE_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

describe('participant key (ADR-0059)', () => {
  it('is HMAC-SHA-256 keyed with the device key bytes over the room UUID, as hex', async () => {
    // printf '%s' "<uuid>" | openssl dgst -sha256 -mac HMAC -macopt hexkey:<device key>
    expect(await participantKey(DEVICE_KEY, UUID)).toBe(
      'a6bf5f0ce5727a5eab653a0902c3aea1d51870396611d94f1b630980b74112b6',
    );
  });

  it('differs per room, so a leaked pk is worthless elsewhere', async () => {
    const other = '1f8e1c52-3b7a-4d2e-9c61-5a4b3c2d1e0f';
    expect(await participantKey(DEVICE_KEY, other)).not.toBe(
      await participantKey(DEVICE_KEY, UUID),
    );
  });

  it('takes only 64 lowercase hex characters as a key', () => {
    expect(isKeyHex(DEVICE_KEY)).toBe(true);
    for (const bad of [DEVICE_KEY.toUpperCase(), DEVICE_KEY.slice(1), `${DEVICE_KEY}0`, '', 7]) {
      expect(isKeyHex(bad), String(bad)).toBe(false);
    }
  });
});
