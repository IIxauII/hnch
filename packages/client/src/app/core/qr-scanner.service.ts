import { Injectable, inject } from '@angular/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { ModalController } from '@ionic/angular/standalone';
import { WebQrScannerOverlayComponent } from './web-qr-scanner.overlay';

/**
 * Thin wrapper around `@capacitor-mlkit/barcode-scanning` for QR
 * code scanning on the Join page.
 *
 * On native (iOS / Android): uses the plugin's `scan()` method directly.
 * On web (PWA / browser): lazy-loads the `barcode-detector` polyfill once,
 * then opens a full-viewport `WebQrScannerOverlayComponent` modal that drives
 * the event-based `startScan()` / `barcodesScanned` API.
 */

/** Discriminated scan result returned by `QrScannerService.scanForCode()`. */
export type QrScanResult =
  | { status: 'ok'; value: string }
  | { status: 'cancelled' }
  | { status: 'error'; reason: QrScanErrorReason };

export type QrScanErrorReason =
  | 'permission-denied'
  | 'no-camera'
  | 'camera-busy'
  | 'unavailable'
  | 'unknown';

/** Singleton polyfill-load promise — runs at most once per app lifetime. */
let polyfillPromise: Promise<void> | null = null;

/** @internal exported for testing only */
export function ensurePolyfill(): Promise<void> {
  if (!polyfillPromise) {
    polyfillPromise = import('barcode-detector/polyfill')
      .then(() => undefined)
      .catch((err) => {
        polyfillPromise = null;
        throw err;
      });
  }
  return polyfillPromise;
}

/** @internal Reset polyfill promise between tests. @internal */
export function resetPolyfillPromise(): void {
  polyfillPromise = null;
}

/** @internal Read current cache state in tests. @internal */
export function getPolyfillPromise(): Promise<void> | null {
  return polyfillPromise;
}

/** @internal Inject a pre-built promise into the cache for testing rejection paths. @internal */
export function setPolyfillPromiseForTesting(p: Promise<void> | null): void {
  polyfillPromise = p;
}

/** @internal exported for testing only */
export async function scanNative(): Promise<QrScanResult> {
  const { camera } = await BarcodeScanner.requestPermissions();
  if (camera !== 'granted' && camera !== 'limited') return { status: 'cancelled' };

  try {
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.QrCode],
    });
    const rawValue = barcodes[0]?.rawValue ?? null;
    if (rawValue === null) return { status: 'cancelled' };
    return { status: 'ok', value: rawValue };
  } catch {
    // User cancelled the scanner or an unexpected error occurred.
    return { status: 'cancelled' };
  }
}

export interface MinimalModalController {
  create(opts: { component: unknown }): Promise<{
    present(): Promise<void>;
    onWillDismiss<T = unknown>(): Promise<{ data?: T | null; role?: string }>;
  }>;
}

/** @internal exported for testing only */
export async function scanWeb(modalCtrl: MinimalModalController): Promise<QrScanResult> {
  await ensurePolyfill();

  const modal = await modalCtrl.create({
    component: WebQrScannerOverlayComponent,
  });
  await modal.present();

  const { data } = await modal.onWillDismiss<string | { reason: QrScanErrorReason } | null>();

  if (data == null) return { status: 'cancelled' };
  if (typeof data === 'object' && 'reason' in data) {
    return { status: 'error', reason: data.reason };
  }
  return { status: 'ok', value: data };
}

@Injectable({ providedIn: 'root' })
export class QrScannerService {
  private readonly modalCtrl = inject(ModalController);

  /**
   * Prompt for camera permission (if needed), then open the scanner.
   * Returns a discriminated `QrScanResult`:
   * - `{ status: 'ok', value }` — QR code decoded
   * - `{ status: 'cancelled' }` — user cancelled or denied (native)
   * - `{ status: 'error', reason }` — web-path failure with mapped reason
   */
  async scanForCode(): Promise<QrScanResult> {
    try {
      if (Capacitor.isNativePlatform()) {
        return await scanNative();
      }
      return await scanWeb(this.modalCtrl);
    } catch {
      // Unexpected throw (e.g. polyfill chunk-load failure, permissions check
      // error before the modal opens). Convert to a typed error result so
      // callers are never left with an unhandled rejection.
      return { status: 'error', reason: 'unknown' };
    }
  }
}
