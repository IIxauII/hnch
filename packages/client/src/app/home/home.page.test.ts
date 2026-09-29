/**
 * Unit tests for HomePage helpers — imports the real exports from
 * home.helpers.ts (no inline mirrors). Tests fail if source breaks.
 */

import { describe, expect, it } from 'vitest';

import { greetingFor, rejectionCopy, RELAY_UNREACHABLE_COPY, routeForScreen } from './home.helpers';

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

  it('room-full → session full copy', () => {
    expect(rejectionCopy('room-full')).toBe('That session is full.');
  });

  it('malformed-credentials → rejoin info copy (differs from join page)', () => {
    expect(rejectionCopy('malformed-credentials')).toBe("Couldn't rejoin with the info on file.");
  });

  it('speaks of sessions, never rooms', () => {
    const reasons = [
      'unknown-room',
      'wrong-password',
      'invalid-invite',
      'expired-invite',
      'invite-already-redeemed',
      'room-full',
      'malformed-credentials',
    ] as const;
    for (const reason of reasons) {
      expect(rejectionCopy(reason)).not.toMatch(/\broom\b/iu);
    }
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

describe('HomePage — greetingFor', () => {
  it('greets by name', () => {
    expect(greetingFor('Alex')).toBe('Hi, Alex');
  });

  it('trims the stored name', () => {
    expect(greetingFor('  Alex  ')).toBe('Hi, Alex');
  });

  it('falls back to a neutral line until the name has loaded', () => {
    expect(greetingFor(null)).toBe('Welcome');
    expect(greetingFor('   ')).toBe('Welcome');
  });
});

describe('HomePage — RELAY_UNREACHABLE_COPY', () => {
  it('tells the user what to do next', () => {
    expect(RELAY_UNREACHABLE_COPY).toBe(
      "Couldn't reach the relay. Check your connection and try again.",
    );
  });
});
