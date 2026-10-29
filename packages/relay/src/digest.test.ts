import { describe, expect, it } from 'vitest';
import { passwordDigest, passwordMatches } from './digest';

const UUID = '0f8e1c52-3b7a-4d2e-9c61-5a4b3c2d1e0f';
const HASH = 'ab'.repeat(32);

describe('password digest at rest (contract item 16)', () => {
  it('is SHA-256 of the room UUID followed by the password hash, as hex', async () => {
    // printf '%s' "<uuid><hash>" | shasum -a 256
    expect(await passwordDigest(UUID, HASH)).toBe(
      'b6ba7e1379f4f6c9382939c2fd8204c7641459c2c73190999439e641ee37b58d',
    );
  });

  it('is not the hash itself, so a leaked row is not the pw credential', async () => {
    expect(await passwordDigest(UUID, HASH)).not.toBe(HASH);
  });

  it('accepts the hash it was made from', async () => {
    const digest = await passwordDigest(UUID, HASH);
    expect(await passwordMatches(UUID, HASH, digest)).toBe(true);
  });

  it('refuses any other pw, whatever its length', async () => {
    const digest = await passwordDigest(UUID, HASH);
    for (const pw of ['cd'.repeat(32), HASH.toUpperCase(), HASH.slice(1), `${HASH}0`, 'x', '']) {
      expect(await passwordMatches(UUID, pw, digest), pw).toBe(false);
    }
  });

  it('binds the digest to its room', async () => {
    const digest = await passwordDigest(UUID, HASH);
    const otherRoom = '1f8e1c52-3b7a-4d2e-9c61-5a4b3c2d1e0f';
    expect(await passwordMatches(otherRoom, HASH, digest)).toBe(false);
  });
});
