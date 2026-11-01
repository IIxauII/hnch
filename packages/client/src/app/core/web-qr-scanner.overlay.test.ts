/**
 * Unit tests for WebQrScannerOverlayComponent.
 *
 * Uses Angular TestBed to satisfy the inject(ModalController) context.
 * BarcodeScanner is mocked at the module level.
 */

import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Module-level mocks (hoisted before imports)

const mockDismiss = vi.fn().mockResolvedValue();
const mockModalCtrlCreate = vi.fn();

vi.mock('@ionic/angular/standalone', () => ({
  ModalController: class MockModalController {
    dismiss = mockDismiss;
    create = mockModalCtrlCreate;
  },
}));

const mockStartScan = vi.fn().mockResolvedValue();
const mockStopScan = vi.fn().mockResolvedValue();
const mockAddListener = vi.fn();

vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeFormat: { QrCode: 'QR_CODE' },
  BarcodeScanner: {
    startScan: (...args: unknown[]) => mockStartScan(...args),
    stopScan: (...args: unknown[]) => mockStopScan(...args),
    addListener: (...args: unknown[]) => mockAddListener(...args),
  },
}));

// Imported after mocks

import { WebQrScannerOverlayComponent } from './web-qr-scanner.overlay';
import { ModalController } from '@ionic/angular/standalone';
import { ComponentFixture } from '@angular/core/testing';

// Helpers

/**
 * Sets up the TestBed module (does NOT yet create or render the component).
 * Call this before configuring per-test mocks, then call `renderComponent()`
 * to trigger detectChanges (which fires ngAfterViewInit).
 */
async function setupTestBed(): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [WebQrScannerOverlayComponent],
    providers: [ModalController],
  }).compileComponents();
}

/**
 * Creates + renders the component. ngAfterViewInit fires here, so callers
 * must set up all mocks before calling this.
 *
 * Returns fixture + instance + a flush helper that drains the microtask queue.
 */
async function renderComponent(): Promise<{
  fixture: ComponentFixture<WebQrScannerOverlayComponent>;
  comp: WebQrScannerOverlayComponent;
  flush: () => Promise<void>;
}> {
  const fixture = TestBed.createComponent(WebQrScannerOverlayComponent);
  // detectChanges triggers ngAfterViewInit which starts the async init.
  fixture.detectChanges();
  // Drain the microtask queue so async ngAfterViewInit progresses fully.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  return { fixture, comp: fixture.componentInstance, flush };
}

// Tests

describe('WebQrScannerOverlayComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default implementations after clearAllMocks
    mockStartScan.mockResolvedValue();
    mockStopScan.mockResolvedValue();
    mockDismiss.mockResolvedValue();
    TestBed.resetTestingModule();
  });

  // Barcode scan success

  it('dismisses with rawValue when barcode is scanned', async () => {
    let capturedListener: ((e: unknown) => void) | null = null;
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockImplementation((_event: string, cb: (e: unknown) => void) => {
      capturedListener = cb;
      return Promise.resolve(listenerHandle);
    });

    await setupTestBed();
    const { flush } = await renderComponent();

    capturedListener!({ barcodes: [{ rawValue: 'hnch://TEST99' }] });
    await flush();

    expect(mockStopScan).toHaveBeenCalled();
    expect(mockDismiss).toHaveBeenCalledWith('hnch://TEST99');
  });

  it('removes listener on successful scan', async () => {
    let capturedListener: ((e: unknown) => void) | null = null;
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockImplementation((_event: string, cb: (e: unknown) => void) => {
      capturedListener = cb;
      return Promise.resolve(listenerHandle);
    });

    await setupTestBed();
    const { flush } = await renderComponent();

    capturedListener!({ barcodes: [{ rawValue: 'hnch://RM' }] });
    await flush();

    expect(listenerHandle.remove).toHaveBeenCalled();
  });

  // Cancel

  it('dismisses with null when cancel is pressed', async () => {
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockResolvedValue(listenerHandle);

    await setupTestBed();
    const { comp, flush } = await renderComponent();

    await (comp as unknown as { onCancel: () => Promise<void> }).onCancel();
    await flush();

    expect(mockStopScan).toHaveBeenCalled();
    expect(mockDismiss).toHaveBeenCalledWith(null);
  });

  // ngOnDestroy teardown

  it('calls stopScan and removes listener on ngOnDestroy', async () => {
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockResolvedValue(listenerHandle);

    await setupTestBed();
    const { comp, flush } = await renderComponent();

    comp.ngOnDestroy();
    await flush();

    expect(mockStopScan).toHaveBeenCalled();
    expect(listenerHandle.remove).toHaveBeenCalled();
  });

  it('teardown is idempotent — stopScan called only once even if destroyed twice', async () => {
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockResolvedValue(listenerHandle);

    await setupTestBed();
    const { comp, flush } = await renderComponent();

    comp.ngOnDestroy();
    await flush();
    comp.ngOnDestroy();
    await flush();

    expect(mockStopScan).toHaveBeenCalledTimes(1);
  });

  // startScan receives videoElement (B1 fix verification)

  it('passes videoElement to startScan', async () => {
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockResolvedValue(listenerHandle);

    await setupTestBed();
    await renderComponent();

    expect(mockStartScan).toHaveBeenCalledWith(
      expect.objectContaining({ videoElement: expect.anything() }),
    );
  });

  it('starts scan with QrCode format', async () => {
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockResolvedValue(listenerHandle);

    await setupTestBed();
    await renderComponent();

    expect(mockStartScan).toHaveBeenCalledWith(expect.objectContaining({ formats: ['QR_CODE'] }));
  });

  // startScan throws (B1/B3 — plugin error → dismiss with reason)

  it('dismisses with { reason: unknown } when startScan throws generic error', async () => {
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockResolvedValue(listenerHandle);
    mockStartScan.mockRejectedValue(new Error('videoElement must be provided.'));

    await setupTestBed();
    await renderComponent();

    expect(mockDismiss).toHaveBeenCalledWith({ reason: 'unknown' });
  });

  it('dismisses with { reason: unavailable } when BarcodeDetector unsupported', async () => {
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockResolvedValue(listenerHandle);
    mockStartScan.mockRejectedValue(new Error('Barcode Detection API is not available'));

    await setupTestBed();
    await renderComponent();

    expect(mockDismiss).toHaveBeenCalledWith({ reason: 'unavailable' });
  });

  it('dismisses with { reason: permission-denied } when camera access denied', async () => {
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockResolvedValue(listenerHandle);
    const err = Object.assign(new DOMException('Permission denied', 'NotAllowedError'), {});
    mockStartScan.mockRejectedValue(err);

    await setupTestBed();
    await renderComponent();

    expect(mockDismiss).toHaveBeenCalledWith({ reason: 'permission-denied' });
  });

  it('calls stopScan when startScan throws even after listener registered', async () => {
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockResolvedValue(listenerHandle);
    mockStartScan.mockRejectedValue(new Error('some camera error'));

    await setupTestBed();
    await renderComponent();

    expect(listenerHandle.remove).toHaveBeenCalled();
    expect(mockStopScan).toHaveBeenCalled();
  });

  // Race: component destroyed mid-init (B3 fix verification)

  it('does not dismiss when destroyed before addListener resolves', async () => {
    let resolveAddListener!: (v: unknown) => void;
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockReturnValue(
      new Promise((res) => {
        resolveAddListener = res;
      }),
    );

    await setupTestBed();
    const { comp } = await renderComponent();

    // Destroy before addListener resolves (renderComponent drained microtasks
    // but addListener promise is still pending because it's not auto-resolved)
    comp.ngOnDestroy();

    // Let addListener resolve now
    resolveAddListener(listenerHandle);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Listener removed, stopScan called, no modal dismiss
    expect(listenerHandle.remove).toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it('calls stopScan when destroyed before startScan resolves', async () => {
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockResolvedValue(listenerHandle);

    let resolveStartScan!: () => void;
    mockStartScan.mockReturnValue(
      new Promise<void>((res) => {
        resolveStartScan = res;
      }),
    );

    await setupTestBed();
    const fixture = TestBed.createComponent(WebQrScannerOverlayComponent);
    fixture.detectChanges();
    // Don't drain fully — we want to catch after addListener resolves but before startScan
    await Promise.resolve();
    await Promise.resolve();

    const comp = fixture.componentInstance;

    // Destroy while startScan is still in flight
    comp.ngOnDestroy();
    await Promise.resolve();
    await Promise.resolve();

    // Let startScan resolve — the post-startScan guard should call stopScan
    resolveStartScan();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockStopScan).toHaveBeenCalled();
  });

  // Listener fires twice — idempotency guard

  it('dismiss runs only once even when listener fires twice', async () => {
    let capturedListener: ((e: unknown) => void) | null = null;
    const listenerHandle = { remove: vi.fn().mockResolvedValue() };
    mockAddListener.mockImplementation((_event: string, cb: (e: unknown) => void) => {
      capturedListener = cb;
      return Promise.resolve(listenerHandle);
    });

    await setupTestBed();
    const { flush } = await renderComponent();

    capturedListener!({ barcodes: [{ rawValue: 'hnch://A' }] });
    capturedListener!({ barcodes: [{ rawValue: 'hnch://B' }] });

    await flush();
    await flush();

    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockDismiss).toHaveBeenCalledWith('hnch://A');
  });
});
