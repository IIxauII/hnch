// Exercises: core/relay-copy:rejectionCopy, RELAY_UNREACHABLE_COPY

import type { JoinRejectionReason } from '@hnch/shared';
import { describe, expect, it } from 'vitest';

import { rejectionCopy, RELAY_UNREACHABLE_COPY } from './relay-copy';

const REASONS: JoinRejectionReason[] = [
  'unknown-room',
  'wrong-password',
  'invalid-invite',
  'expired-invite',
  'invite-already-redeemed',
  'room-full',
  'malformed-credentials',
];

describe('rejectionCopy', () => {
  it('says the same thing for the same refusal, wherever it surfaces', () => {
    for (const reason of ['room-full', 'invalid-invite'] as const) {
      expect(rejectionCopy(reason, 'join')).toBe(rejectionCopy(reason, 'rejoin'));
    }
  });

  // Whoever is turned away from a session they were in did not just type a
  // password: telling them it was incorrect would be news about nothing.
  it('a password that was just typed is wrong; one that worked before has changed', () => {
    expect(rejectionCopy('wrong-password', 'join')).toBe('That password is incorrect.');
    expect(rejectionCopy('wrong-password', 'rejoin')).toBe("This session's password has changed.");
    expect(rejectionCopy('wrong-password')).toBe('That password is incorrect.');
  });

  it('a code that was just typed may be mistyped', () => {
    expect(rejectionCopy('unknown-room', 'join')).toBe(
      "That code isn't active. Double-check it with your host.",
    );
  });

  it('a session the device remembers has ended', () => {
    expect(rejectionCopy('unknown-room', 'rejoin')).toBe("That session isn't active anymore.");
  });

  it('defaults to the wording for someone joining', () => {
    expect(rejectionCopy('unknown-room')).toBe(rejectionCopy('unknown-room', 'join'));
    expect(rejectionCopy('malformed-credentials')).toBe("Couldn't join with the info provided.");
  });

  it('names the limit when a session is full', () => {
    expect(rejectionCopy('room-full')).toBe('This session is full (20 participants max).');
  });

  it('has copy for every reason, in both contexts', () => {
    for (const reason of REASONS) {
      for (const context of ['join', 'rejoin'] as const) {
        expect(rejectionCopy(reason, context).length).toBeGreaterThan(0);
      }
    }
  });

  // ux.md: the user reads "session", never "room".
  it('never says "room"', () => {
    for (const reason of REASONS) {
      for (const context of ['join', 'rejoin'] as const) {
        expect(rejectionCopy(reason, context)).not.toMatch(/\broom\b/iu);
      }
    }
  });
});

describe('RELAY_UNREACHABLE_COPY', () => {
  it('says what happened and what to do about it', () => {
    expect(RELAY_UNREACHABLE_COPY).toMatch(/reach the relay/u);
    expect(RELAY_UNREACHABLE_COPY).toMatch(/try again/u);
  });
});
