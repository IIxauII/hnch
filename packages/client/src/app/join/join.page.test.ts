/**
 * Unit tests for JoinPage pure helpers.
 *
 * Full component-mount tests (DI heavy) are deferred to e2e.
 * Tests here cover:
 * - shouldAutoSubmitDeepLink: deep-link auto-submit gate
 * - rejectionCopy: close-code → user-visible copy mapping (regression lock)
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({
  IonBackButton: {},
  IonButton: {},
  IonButtons: {},
  IonCol: {},
  IonContent: {},
  IonFooter: {},
  IonGrid: {},
  IonHeader: {},
  IonIcon: {},
  IonInput: {},
  IonItem: {},
  IonLabel: {},
  IonList: {},
  IonRow: {},
  IonTitle: {},
  IonToolbar: {},
}));
vi.mock('ionicons', () => ({}));
vi.mock('ionicons/icons', () => ({ qrCodeOutline: '' }));
vi.mock('@hnch/shared', () => ({
  formatRoomCode: (s: string) => s,
  hashPassword: vi.fn(),
  isValidRoomCode: (s: string) => s.length === 6,
  normalizeRoomCode: (s: string) => s.toUpperCase().replaceAll(/-/g, ''),
  parseInviteContent: vi.fn(),
  // last-session service imports
  LAST_SESSION_TTL_MS: 24 * 60 * 60 * 1000,
  LAST_SESSION_MAX_ENTRIES: 5,
  migrateLastSessionCache: (_input: unknown) => ({ version: 2, entries: {} }),
  pruneLastSessionEntries: (cache: unknown) => cache,
}));

import { qrScanErrorCopy, rejectionCopy, shouldAutoSubmitDeepLink } from './join.page';

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

describe('rejectionCopy', () => {
  it('maps malformed-credentials (close code 4010) to expected copy', () => {
    expect(rejectionCopy('malformed-credentials')).toBe("Couldn't join with the info provided.");
  });

  it('maps unknown-room to expected copy', () => {
    expect(rejectionCopy('unknown-room')).toBe(
      "That room code isn't active. Double-check with your host.",
    );
  });

  it('maps wrong-password to expected copy', () => {
    expect(rejectionCopy('wrong-password')).toBe('That password is incorrect.');
  });

  it('maps room-full to expected copy', () => {
    expect(rejectionCopy('room-full')).toBe(
      'This room is full (max 20 participants). Navigate back and try another room.',
    );
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
});

// Exercises: join.page:qrScanErrorCopy
describe('qrScanErrorCopy', () => {
  it('maps permission-denied to expected copy', () => {
    expect(qrScanErrorCopy('permission-denied')).toBe(
      'Camera access blocked. Allow camera in browser settings to scan.',
    );
  });

  it('maps no-camera to expected copy', () => {
    expect(qrScanErrorCopy('no-camera')).toBe('No camera available on this device.');
  });

  it('maps camera-busy to expected copy', () => {
    expect(qrScanErrorCopy('camera-busy')).toBe('Camera is in use by another app.');
  });

  it('maps unavailable to expected copy', () => {
    expect(qrScanErrorCopy('unavailable')).toBe("Scanning isn't supported on this browser.");
  });

  it('maps unknown to expected copy', () => {
    expect(qrScanErrorCopy('unknown')).toBe("Couldn't start the scanner.");
  });
});
