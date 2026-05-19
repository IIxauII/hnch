/**
 * Unit tests for HomePage helpers — imports the real exports from
 * home.helpers.ts (no inline mirrors). Tests fail if source breaks.
 */

import { describe, expect, it } from 'vitest';

import { rejectionCopy, routeForScreen, summaryFromCache } from './home.helpers';

describe('HomePage — rejectionCopy', () => {
  it('unknown-room → session expired copy', () => {
    expect(rejectionCopy('unknown-room')).toBe("That session isn't active anymore.");
  });

  it('wrong-password → password incorrect copy', () => {
    expect(rejectionCopy('wrong-password')).toBe('That password is incorrect.');
  });

  it('invalid-invite → invite invalid copy', () => {
    expect(rejectionCopy('invalid-invite')).toBe("That invite link isn't valid.");
  });

  it('expired-invite → invite expired copy', () => {
    expect(rejectionCopy('expired-invite')).toBe('That invite link has expired.');
  });

  it('invite-already-redeemed → already used copy', () => {
    expect(rejectionCopy('invite-already-redeemed')).toBe(
      'That invite link has already been used.',
    );
  });

  it('room-full → room full copy', () => {
    expect(rejectionCopy('room-full')).toBe('That room is full.');
  });

  it('malformed-credentials → rejoin info copy (differs from join page)', () => {
    expect(rejectionCopy('malformed-credentials')).toBe("Couldn't rejoin with the info on file.");
  });
});

describe('HomePage — routeForScreen', () => {
  it('lobby → /lobby/:code', () => {
    expect(routeForScreen('lobby', 'ABC123')).toBe('/lobby/ABC123');
  });

  it('estimating → /estimating/:code', () => {
    expect(routeForScreen('estimating', 'XYZ789')).toBe('/estimating/XYZ789');
  });
});

describe('HomePage — summaryFromCache', () => {
  it('maps roomCode and lastScreen from a lobby cache entry', () => {
    expect(
      summaryFromCache({
        roomCode: 'ABC123',
        roomUuid: 'uuid-1',
        lastSeenAt: 0,
        lastScreen: 'lobby',
      }),
    ).toEqual({ roomCode: 'ABC123', lastScreen: 'lobby' });
  });

  it('maps roomCode and lastScreen from an estimating cache entry', () => {
    expect(
      summaryFromCache({
        roomCode: 'XYZ789',
        roomUuid: 'uuid-2',
        lastSeenAt: 0,
        lastScreen: 'estimating',
      }),
    ).toEqual({ roomCode: 'XYZ789', lastScreen: 'estimating' });
  });

  it('defaults lastScreen to lobby when entry has no lastScreen (v1 migration path)', () => {
    expect(
      summaryFromCache({
        roomCode: 'ABC123',
        roomUuid: 'uuid-3',
        lastSeenAt: 0,
        // lastScreen intentionally omitted — ClientLastSessionEntry has it optional
      }),
    ).toEqual({ roomCode: 'ABC123', lastScreen: 'lobby' });
  });
});
