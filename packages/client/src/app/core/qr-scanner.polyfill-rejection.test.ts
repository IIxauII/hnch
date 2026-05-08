/**
 * Dedicated test file for the ensurePolyfill() rejection path.
 *
 * Kept separate from qr-scanner.service.test.ts because the top-level
 * vi.mock() here makes 'barcode-detector/polyfill' throw, which would
 * poison the scanWeb() / scanForCode() tests that need a resolving polyfill.
 *
 * What this tests:
 *   - The production `.catch` handler at qr-scanner.service.ts:41-44 clears
 *     `polyfillPromise` on rejection (not a test-mirror side-effect).
 *   - After clearing, a subsequent ensurePolyfill() call triggers a new
 *     dynamic import (cache repopulated, re-attempted).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — hoisted before imports.
// The polyfill throws to exercise the production .catch path.
// ---------------------------------------------------------------------------

vi.mock('barcode-detector/polyfill', () => {
  throw new Error('chunk load failed');
});

vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeFormat: { QrCode: 'QR_CODE' },
  BarcodeScanner: { scan: vi.fn(), requestPermissions: vi.fn() },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@ionic/angular/standalone', () => ({
  ModalController: vi.fn(),
}));

vi.mock('./web-qr-scanner.overlay', () => ({
  WebQrScannerOverlayComponent: class WebQrScannerOverlayComponent {},
  mapDomErrorToReason: () => 'unknown',
}));

// ---------------------------------------------------------------------------
// Imported after mocks
// ---------------------------------------------------------------------------

import { ensurePolyfill, resetPolyfillPromise, getPolyfillPromise } from './qr-scanner.service';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ensurePolyfill() — rejection path (production .catch at service.ts:41-44)', () => {
  beforeEach(() => {
    resetPolyfillPromise();
  });

  afterEach(() => {
    resetPolyfillPromise();
  });

  /**
   * R4-1: drives the production `.catch` path directly.
   *
   * The top-level vi.mock above makes `import('barcode-detector/polyfill')`
   * throw, so ensurePolyfill() itself (not a test mirror) runs the .catch
   * branch at qr-scanner.service.ts:41-44.
   *
   * Assertions:
   *   1. ensurePolyfill() rejects with the simulated error.
   *   2. After rejection, getPolyfillPromise() returns null — the production
   *      `.catch` cleared it.
   *   3. A second ensurePolyfill() call creates a new promise (re-attempted the
   *      import), confirming the retry mechanism works once the cache is null.
   */
  it('clears cache on rejection so a subsequent call gets a fresh promise', async () => {
    // --- 1. First call: production .catch must reject and clear cache --------
    // Vitest wraps factory-throw errors; we assert it rejects (any error) —
    // what matters is the cache state, not the exact message.
    await expect(ensurePolyfill()).rejects.toThrow();

    // Cache cleared by production .catch (not by test code).
    expect(getPolyfillPromise()).toBeNull();

    // --- 2. Second call: a new promise must be created (retry attempted) -----
    // ensurePolyfill() finds null cache → creates a new promise.
    // The new promise will also reject (same mock), but a new attempt was made.
    const secondAttempt = ensurePolyfill();
    // Cache is populated immediately (before await) — a new dynamic import started.
    expect(getPolyfillPromise()).not.toBeNull();
    expect(getPolyfillPromise()).toBe(secondAttempt);

    // The second attempt also rejects (same polyfill mock).
    await expect(secondAttempt).rejects.toThrow();

    // Cache cleared again by production .catch.
    expect(getPolyfillPromise()).toBeNull();
  });
});
