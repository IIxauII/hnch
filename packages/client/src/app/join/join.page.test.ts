/**
 * Unit tests for JoinPage pure helpers.
 *
 * Full component-mount tests (DI heavy) are deferred to e2e.
 * Tests here cover:
 * - shouldAutoSubmitDeepLink: deep-link auto-submit gate
 * - shouldAutoSubmitTypedCode: typed-code auto-submit gate
 * - rejectionCopy / qrScanErrorCopy: reason → user-visible copy (regression lock)
 */

import { describe, expect, it } from 'vitest';

import {
  qrScanErrorCopy,
  rejectionCopy,
  shouldAutoSubmitDeepLink,
  shouldAutoSubmitTypedCode,
} from './join.helpers';

describe('shouldAutoSubmitDeepLink', () => {
  it('returns false when no code param', () => {
    expect(shouldAutoSubmitDeepLink(null, 'Alice')).toBe(false);
  });

  it('returns false when code param is empty string', () => {
    expect(shouldAutoSubmitDeepLink('', 'Alice')).toBe(false);
  });

  it('returns false when code present but displayName is null (pre-onboarding)', () => {
    expect(shouldAutoSubmitDeepLink('ABC123', null)).toBe(false);
  });

  it('returns false when code present but displayName is whitespace only', () => {
    expect(shouldAutoSubmitDeepLink('ABC123', '   ')).toBe(false);
  });

  it('returns true when code present and displayName is set', () => {
    expect(shouldAutoSubmitDeepLink('ABC123', 'Alice')).toBe(true);
  });

  it('returns true after onboarding resume (code from pending URL, name just saved)', () => {
    expect(shouldAutoSubmitDeepLink('K7P9MR', 'Bob')).toBe(true);
  });

  it('does not auto-submit for direct nav (no code, name present)', () => {
    expect(shouldAutoSubmitDeepLink(null, 'Alice')).toBe(false);
  });
});

describe('shouldAutoSubmitTypedCode', () => {
  const base = {
    codeIsValid: true,
    code: 'K7P9MR',
    lastAttemptedCode: null,
    isSubmitting: false,
  };

  it('submits as soon as the sixth character lands', () => {
    expect(shouldAutoSubmitTypedCode(base)).toBe(true);
  });

  it('waits while the code is still incomplete', () => {
    expect(shouldAutoSubmitTypedCode({ ...base, codeIsValid: false, code: 'K7P9M' })).toBe(false);
  });

  it('does not stack a second attempt on one that is in flight', () => {
    expect(shouldAutoSubmitTypedCode({ ...base, isSubmitting: true })).toBe(false);
  });

  it('does not retry a code that was already attempted', () => {
    // Backspace-then-retype of the same character must not re-toast the
    // same "code isn't active" failure; Join is there for a deliberate retry.
    expect(shouldAutoSubmitTypedCode({ ...base, lastAttemptedCode: 'K7P9MR' })).toBe(false);
  });

  it('submits again once the user has corrected the code', () => {
    expect(shouldAutoSubmitTypedCode({ ...base, lastAttemptedCode: 'K7P9MX' })).toBe(true);
  });
});

describe('rejectionCopy', () => {
  it('maps malformed-credentials (close code 4010) to expected copy', () => {
    expect(rejectionCopy('malformed-credentials')).toBe("Couldn't join with the info provided.");
  });

  it('maps unknown-room to expected copy', () => {
    expect(rejectionCopy('unknown-room')).toBe(
      "That code isn't active. Double-check it with your host.",
    );
  });

  it('maps wrong-password to expected copy', () => {
    expect(rejectionCopy('wrong-password')).toBe('That password is incorrect.');
  });

  it('maps room-full to expected copy', () => {
    expect(rejectionCopy('room-full')).toBe('This session is full (20 participants max).');
  });

  it('maps invalid-invite to expected copy', () => {
    expect(rejectionCopy('invalid-invite')).toBe("That invite link isn't valid.");
  });

  it('maps expired-invite to expected copy', () => {
    expect(rejectionCopy('expired-invite')).toBe('That invite link has expired.');
  });

  it('maps invite-already-redeemed to expected copy', () => {
    expect(rejectionCopy('invite-already-redeemed')).toBe(
      'That invite link has already been used.',
    );
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

describe('qrScanErrorCopy', () => {
  it('has distinct copy for every failure reason', () => {
    const reasons = [
      'permission-denied',
      'no-camera',
      'camera-busy',
      'unavailable',
      'unknown',
    ] as const;
    const copies = reasons.map((r) => qrScanErrorCopy(r));
    expect(new Set(copies).size).toBe(reasons.length);
    for (const copy of copies) expect(copy.length).toBeGreaterThan(0);
  });
});
