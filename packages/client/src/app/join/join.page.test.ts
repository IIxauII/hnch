/**
 * Unit tests for JoinPage pure helpers.
 *
 * Full component-mount tests (DI heavy) are deferred to e2e.
 * Tests here cover:
 * - shouldAutoSubmitDeepLink: deep-link auto-submit gate
 * - joinLinkAction: what entering the page with a link means
 * - shouldAutoSubmitTypedCode: typed-code auto-submit gate
 * - qrScanErrorCopy: reason → user-visible copy (regression lock)
 */

import { describe, expect, it } from 'vitest';

import {
  joinLinkAction,
  qrScanErrorCopy,
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

describe('joinLinkAction', () => {
  const followed = { id: 4, trigger: 'imperative' } as const;

  it('joins when a link has just been followed', () => {
    expect(
      joinLinkAction({ codeParam: 'K7P9MR', navigation: followed, lastNavigationId: undefined }),
    ).toBe('join');
  });

  it('has nothing to act on without a code', () => {
    expect(
      joinLinkAction({ codeParam: null, navigation: followed, lastNavigationId: undefined }),
    ).toBe('none');
    expect(
      joinLinkAction({ codeParam: '', navigation: followed, lastNavigationId: undefined }),
    ).toBe('none');
  });

  // Back from the Lobby. Joining again would put the user straight back
  // where they are backing out of.
  it('only puts the code back when the page is gone back to', () => {
    expect(
      joinLinkAction({
        codeParam: 'K7P9MR',
        navigation: { id: 7, trigger: 'popstate' },
        lastNavigationId: 4,
      }),
    ).toBe('fill');
    // Also when the page had to be created again for it
    expect(
      joinLinkAction({
        codeParam: 'K7P9MR',
        navigation: { id: 7, trigger: 'popstate' },
        lastNavigationId: undefined,
      }),
    ).toBe('fill');
  });

  // The page is kept in the stack. Sent to it again — by a session that
  // turned the user away, by a second invite — it is entered, not created.
  it('joins when the page is sent to anew, with the same code or another', () => {
    expect(
      joinLinkAction({
        codeParam: 'K7P9MR',
        navigation: { id: 9, trigger: 'imperative' },
        lastNavigationId: 4,
      }),
    ).toBe('join');
    expect(
      joinLinkAction({
        codeParam: 'A2B3C4',
        navigation: { id: 9, trigger: 'imperative' },
        lastNavigationId: 4,
      }),
    ).toBe('join');
  });

  it('acts on one navigation once, however often the page says it was entered', () => {
    expect(joinLinkAction({ codeParam: 'K7P9MR', navigation: followed, lastNavigationId: 4 })).toBe(
      'none',
    );
  });

  it('joins once where the router has no navigation to show', () => {
    expect(
      joinLinkAction({ codeParam: 'K7P9MR', navigation: null, lastNavigationId: undefined }),
    ).toBe('join');
    expect(joinLinkAction({ codeParam: 'K7P9MR', navigation: null, lastNavigationId: null })).toBe(
      'none',
    );
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
