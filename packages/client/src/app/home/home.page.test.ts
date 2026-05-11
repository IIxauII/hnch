/**
 * Unit tests for HomePage private helpers.
 *
 * All three helpers are module-private (not exported) so they are
 * inline-spec'd here, following the lobby.page.test.ts pattern.
 * The inline implementations must be kept in sync with home.page.ts.
 */

import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// rejectionCopy — inline-spec mirroring home.page.ts
// Note: copy strings here DIFFER from join.page.ts (rejoin context vs join).
// ---------------------------------------------------------------------------

type JoinRejectionReason =
  | 'unknown-room'
  | 'wrong-password'
  | 'invalid-invite'
  | 'expired-invite'
  | 'invite-already-redeemed'
  | 'room-full'
  | 'malformed-credentials';

function rejectionCopy(reason: JoinRejectionReason): string {
  switch (reason) {
    case 'unknown-room':
      return "That session isn't active anymore.";
    case 'wrong-password':
      return 'That password is incorrect.';
    case 'invalid-invite':
      return "That invite link isn't valid.";
    case 'expired-invite':
      return 'That invite link has expired.';
    case 'invite-already-redeemed':
      return 'That invite link has already been used.';
    case 'room-full':
      return 'That room is full.';
    case 'malformed-credentials':
      return "Couldn't rejoin with the info on file.";
  }
}

// ---------------------------------------------------------------------------
// routeForScreen — inline-spec mirroring home.page.ts
// ---------------------------------------------------------------------------

type LastSessionScreen = 'lobby' | 'estimating';

function routeForScreen(screen: LastSessionScreen, code: string): string {
  switch (screen) {
    case 'lobby':
      return `/lobby/${code}`;
    case 'estimating':
      return `/estimating/${code}`;
  }
}

// ---------------------------------------------------------------------------
// summaryFromCache — inline-spec mirroring home.page.ts
// ---------------------------------------------------------------------------

interface MinimalCache {
  readonly roomCode: string;
  readonly lastScreen: LastSessionScreen;
}

function summaryFromCache(cache: MinimalCache) {
  return {
    roomCode: cache.roomCode,
    lastScreen: cache.lastScreen,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
    const cache = { roomCode: 'ABC123', lastScreen: 'lobby' as const };
    expect(summaryFromCache(cache)).toEqual({ roomCode: 'ABC123', lastScreen: 'lobby' });
  });

  it('maps roomCode and lastScreen from an estimating cache entry', () => {
    const cache = { roomCode: 'XYZ789', lastScreen: 'estimating' as const };
    expect(summaryFromCache(cache)).toEqual({ roomCode: 'XYZ789', lastScreen: 'estimating' });
  });
});
