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
      .then(() => {})
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

/**
 * Pre-flight camera availability check.
 *
 * Runs before opening the scanner modal so devices without a camera
 * (e.g. desktops, Mac minis) get an immediate typed error rather than a
 * black overlay that never resolves.
 *
 * - `mediaDevices` missing (insecure context / very old browser) → `'unavailable'`.
 * - `enumerateDevices` reports zero `videoinput` entries → `'no-camera'`.
 * - `enumerateDevices` itself throws → `null` (caller falls through to the
 *   scan path so the plugin can produce its own typed error).
 *
 * @internal exported for testing only
 */
export async function detectCameraAvailability(): Promise<QrScanErrorReason | null> {
  const md = (globalThis as { navigator?: { mediaDevices?: MediaDevices } }).navigator
    ?.mediaDevices;
  if (!md || typeof md.enumerateDevices !== 'function') return 'unavailable';
  try {
    const devices = await md.enumerateDevices();
    const hasCamera = devices.some((d) => d.kind === 'videoinput');
    return hasCamera ? null : 'no-camera';
  } catch {
    return null;
  }
}

/** @internal exported for testing only */
export async function scanWeb(modalCtrl: MinimalModalController): Promise<QrScanResult> {
  const preflight = await detectCameraAvailability();
  if (preflight) return { status: 'error', reason: preflight };

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
   * Returns `true` when this device is capable of scanning a QR code —
   * native platforms always qualify; on web we require at least one
   * `videoinput` device to be present (e.g. Mac mini desktops without
   * a built-in camera return `false`).
   *
   * Used by the Join page to hide the "Scan QR code" entry entirely
   * when there is no camera, rather than opening a black overlay that
   * cannot resolve.
   */
  async isScanningAvailable(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) return true;
    return (await detectCameraAvailability()) === null;
  }

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
