/**
 * Unit tests for JoinPage pure helpers.
 *
 * Full component-mount tests (DI heavy) are deferred to e2e.
 * Tests here cover:
 * - shouldAutoSubmitDeepLink: deep-link auto-submit gate
 * - joinLinkAction: what entering the page with a link means
 * - isJoinUrl: whether the router has arrived on the page
 * - shouldAutoSubmitTypedCode: typed-code auto-submit gate
 * - qrScanErrorCopy: reason → user-visible copy (regression lock)
 */

import { describe, expect, it } from 'vitest';

import {
  isJoinUrl,
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
      joinLinkAction({
        codeParam: 'K7P9MR',
        navigation: followed,
        lastNavigationId: undefined,
        routerIsHere: true,
      }),
    ).toBe('join');
  });

  it('has nothing to act on when it is first entered without a code', () => {
    expect(
      joinLinkAction({
        codeParam: null,
        navigation: followed,
        lastNavigationId: undefined,
        routerIsHere: true,
      }),
    ).toBe('none');
    expect(
      joinLinkAction({
        codeParam: '',
        navigation: followed,
        lastNavigationId: undefined,
        routerIsHere: true,
      }),
    ).toBe('none');
  });

  // "Join session" on Home, with the page still in the stack from the last
  // session: the form, not the code and the password typed back then.
  it('starts over when it is sent to again without a code', () => {
    expect(
      joinLinkAction({
        codeParam: null,
        navigation: { id: 9, trigger: 'imperative' },
        lastNavigationId: 4,
        routerIsHere: true,
      }),
    ).toBe('reset');
  });

  it('is left as it was when it is gone back to without a code', () => {
    expect(
      joinLinkAction({
        codeParam: null,
        navigation: { id: 9, trigger: 'popstate' },
        lastNavigationId: 4,
        routerIsHere: true,
      }),
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
        routerIsHere: true,
      }),
    ).toBe('fill');
    // Also when the page had to be created again for it
    expect(
      joinLinkAction({
        codeParam: 'K7P9MR',
        navigation: { id: 7, trigger: 'popstate' },
        lastNavigationId: undefined,
        routerIsHere: true,
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
        routerIsHere: true,
      }),
    ).toBe('join');
    expect(
      joinLinkAction({
        codeParam: 'A2B3C4',
        navigation: { id: 9, trigger: 'imperative' },
        lastNavigationId: 4,
        routerIsHere: true,
      }),
    ).toBe('join');
  });

  it('acts on one navigation once, however often the page says it was entered', () => {
    expect(
      joinLinkAction({
        codeParam: 'K7P9MR',
        navigation: followed,
        lastNavigationId: 4,
        routerIsHere: true,
      }),
    ).toBe('none');
  });

  // A swipe back from the Lobby. Ionic runs the page transition first and
  // the navigation after it: the router is still on the Lobby, its last
  // navigation is the one that led there, and there is no code in its URL.
  // Read as "sent here anew without a code", that emptied the form the user
  // was coming back to.
  describe('entered ahead of the router', () => {
    const leadingToTheLobby = { id: 5, trigger: 'imperative' } as const;

    it('leaves the form as it was', () => {
      expect(
        joinLinkAction({
          codeParam: null,
          navigation: leadingToTheLobby,
          lastNavigationId: 4,
          routerIsHere: false,
        }),
      ).toBe('none');
    });

    it('acts on nothing the router says, whatever it says', () => {
      for (const codeParam of [null, 'K7P9MR']) {
        for (const navigation of [
          leadingToTheLobby,
          { id: 5, trigger: 'popstate' } as const,
          null,
        ]) {
          for (const lastNavigationId of [undefined, null, 4]) {
            expect(
              joinLinkAction({ codeParam, navigation, lastNavigationId, routerIsHere: false }),
            ).toBe('none');
          }
        }
      }
    });
  });

  it('joins once where the router has no navigation to show', () => {
    expect(
      joinLinkAction({
        codeParam: 'K7P9MR',
        navigation: null,
        lastNavigationId: undefined,
        routerIsHere: true,
      }),
    ).toBe('join');
    expect(
      joinLinkAction({
        codeParam: 'K7P9MR',
        navigation: null,
        lastNavigationId: null,
        routerIsHere: true,
      }),
    ).toBe('none');
  });
});

describe('isJoinUrl', () => {
  it('is true for the Join page, with a link on it or without', () => {
    expect(isJoinUrl('/join')).toBe(true);
    expect(isJoinUrl('/join?code=K7P9MR')).toBe(true);
    expect(isJoinUrl('/join?code=K7P9MR&pw=1')).toBe(true);
    expect(isJoinUrl('/join#x')).toBe(true);
  });

  it('is false everywhere else', () => {
    expect(isJoinUrl('/lobby/K7P9MR')).toBe(false);
    expect(isJoinUrl('/estimating/K7P9MR')).toBe(false);
    expect(isJoinUrl('/home')).toBe(false);
    expect(isJoinUrl('/')).toBe(false);
    expect(isJoinUrl('')).toBe(false);
  });

  it('is not fooled by a path that merely starts the same', () => {
    expect(isJoinUrl('/joined')).toBe(false);
    expect(isJoinUrl('/join/K7P9MR')).toBe(false);
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
