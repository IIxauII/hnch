import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  viewChild,
} from '@angular/core';
import {
  BarcodeFormat,
  BarcodeScanner,
  type BarcodesScannedEvent,
} from '@capacitor-mlkit/barcode-scanning';
import type { PluginListenerHandle } from '@capacitor/core';
import { ModalController } from '@ionic/angular/standalone';
import type { QrScanErrorReason } from './qr-scanner.service';

/**
 * Full-viewport camera overlay for web-platform QR scanning.
 *
 * Opened programmatically by `QrScannerService` on non-native platforms.
 * Uses `BarcodeScanner.startScan()` event API with a `barcode-detector`
 * polyfill (loaded before this component is created).
 *
 * The plugin's web implementation owns the `getUserMedia` stream lifecycle —
 * we pass the `<video>` element and the plugin binds/stops the stream.
 *
 * Bare by design — no reticle, no header, no hint text — per spec.
 */
@Component({
  selector: 'app-web-qr-scanner-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" role="dialog" aria-modal="true" aria-label="QR code scanner">
      <video
        #videoEl
        autoplay
        playsinline
        muted
        class="video"
        aria-hidden="true"
      ></video>

      <button
        class="cancel-btn"
        (click)="onCancel()"
        aria-label="Cancel QR scanner"
        type="button"
      >
        Cancel
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .overlay {
        position: fixed;
        inset: 0;
        background: #000;
        z-index: 9999;
      }

      .video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .cancel-btn {
        position: absolute;
        top: max(env(safe-area-inset-top, 0px), 16px);
        left: max(env(safe-area-inset-left, 0px), 16px);
        padding: var(--hnch-sp-2) var(--hnch-sp-5);
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        border: 1.5px solid rgba(255, 255, 255, 0.6);
        border-radius: var(--hnch-r-lg);
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        z-index: 10;
        -webkit-tap-highlight-color: transparent;
        min-width: 44px;
        min-height: 44px;
      }

      .cancel-btn:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
      }
    `,
  ],
})
export class WebQrScannerOverlayComponent implements AfterViewInit, OnDestroy {
  private readonly videoEl = viewChild.required<ElementRef<HTMLVideoElement>>('videoEl');

  private readonly modalCtrl = inject(ModalController);

  private listenerHandle: PluginListenerHandle | null = null;
  private tornDown = false;

  async ngAfterViewInit(): Promise<void> {
    const videoElement = this.videoEl().nativeElement;

    try {
      this.listenerHandle = await BarcodeScanner.addListener(
        'barcodesScanned',
        (event: BarcodesScannedEvent) => {
          const rawValue = event.barcodes[0]?.rawValue ?? null;
          void this.resolveWith(rawValue);
        },
      );

      // Guard: component may have been destroyed while addListener was in flight.
      if (this.tornDown) {
        await this.listenerHandle.remove();
        this.listenerHandle = null;
        await this.teardown();
        return;
      }

      await BarcodeScanner.startScan({
        formats: [BarcodeFormat.QrCode],
        videoElement,
      });

      // Guard: component may have been destroyed while startScan was in flight.
      if (this.tornDown) {
        await this.teardown();
        return;
      }
    } catch (err) {
      // Plugin threw (e.g. camera denied, no camera, BarcodeDetector unsupported).
      // Map to a specific reason so caller can show appropriate copy.
      if (!this.tornDown) {
        const reason = mapDomErrorToReason(err);
        await this.teardown();
        await this.modalCtrl.dismiss({ reason });
      }
    }
  }

  ngOnDestroy(): void {
    void this.teardown();
  }

  protected async onCancel(): Promise<void> {
    await this.teardown();
    await this.modalCtrl.dismiss(null);
  }

  private async resolveWith(value: string | null): Promise<void> {
    if (this.tornDown) return;
    await this.teardown();
    await this.modalCtrl.dismiss(value);
  }

  private async teardown(): Promise<void> {
    if (this.tornDown) return;
    this.tornDown = true;

    if (this.listenerHandle) {
      await this.listenerHandle.remove();
      this.listenerHandle = null;
    }

    try {
      await BarcodeScanner.stopScan();
    } catch {
      // stopScan may throw if scan was never started — ignore.
    }
  }
}

// ---------------------------------------------------------------------------
// Error-reason mapper (exported for unit tests)
// ---------------------------------------------------------------------------

const UNSUPPORTED_PHRASES = ['unsupported', 'not implemented', 'Barcode Detection API'];

/**
 * Map a thrown camera / plugin error to a `QrScanErrorReason`.
 *
 * Priority:
 * 1. DOMException name (or any Error with a `.name` matching known names).
 * 2. Error message hinting that BarcodeDetector is unavailable.
 * 3. Fallback: `'unknown'`.
 */
export function mapDomErrorToReason(err: unknown): QrScanErrorReason {
  const name = (err as { name?: unknown })?.name;
  if (typeof name === 'string') {
    if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)) {
      return 'permission-denied';
    }
    if (['NotFoundError', 'OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(name)) {
      return 'no-camera';
    }
    if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(name)) {
      return 'camera-busy';
    }
  }

  const message = (err as { message?: unknown })?.message;
  if (typeof message === 'string' && UNSUPPORTED_PHRASES.some((p) => message.includes(p))) {
    return 'unavailable';
  }

  return 'unknown';
}
