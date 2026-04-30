/**
 * Unit tests for QrScannerService exported pure functions.
 *
 * Tests `scanNative()`, `scanWeb()`, `QrScannerService.scanForCode()` routing,
 * and `mapDomErrorToReason` (from overlay) directly — no DI context needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before imports)
// ---------------------------------------------------------------------------

const mockScan = vi.fn()
const mockRequestPermissions = vi.fn()
vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeFormat: { QrCode: 'QR_CODE' },
  BarcodeScanner: {
    scan: (...args: unknown[]) => mockScan(...args),
    requestPermissions: (...args: unknown[]) => mockRequestPermissions(...args),
  },
}))

let isNative = false
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNative },
}))

vi.mock('@ionic/angular/standalone', () => ({
  ModalController: vi.fn(),
}))

vi.mock('./web-qr-scanner.overlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./web-qr-scanner.overlay')>()
  return {
    ...actual,
    WebQrScannerOverlayComponent: class WebQrScannerOverlayComponent {},
  }
})

vi.mock('barcode-detector/polyfill', () => ({}))

// ---------------------------------------------------------------------------
// Imported after mocks
// ---------------------------------------------------------------------------

import {
  scanNative,
  scanWeb,
  ensurePolyfill,
  resetPolyfillPromise,
  getPolyfillPromise,
  setPolyfillPromiseForTesting,
  QrScannerService,
  type MinimalModalController,
  type QrScanErrorReason,
} from './qr-scanner.service'

import { mapDomErrorToReason } from './web-qr-scanner.overlay'
import { TestBed } from '@angular/core/testing'
import { ModalController } from '@ionic/angular/standalone'

// ---------------------------------------------------------------------------
// Helper: build a mock ModalController
// ---------------------------------------------------------------------------

function makeMockModalCtrl(dismissData: string | { reason: QrScanErrorReason } | null = null): {
  ctrl: MinimalModalController
  mockCreate: ReturnType<typeof vi.fn>
  mockPresent: ReturnType<typeof vi.fn>
  mockOnWillDismiss: ReturnType<typeof vi.fn>
} {
  const mockPresent = vi.fn().mockResolvedValue(undefined)
  const mockOnWillDismiss = vi.fn().mockResolvedValue({ data: dismissData, role: 'cancel' })
  const mockCreate = vi.fn().mockResolvedValue({
    present: mockPresent,
    onWillDismiss: mockOnWillDismiss,
  })
  return { ctrl: { create: mockCreate }, mockCreate, mockPresent, mockOnWillDismiss }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ensurePolyfill()', () => {
  beforeEach(() => {
    resetPolyfillPromise()
  })

  afterEach(() => {
    resetPolyfillPromise()
  })

  it('caches the resolved promise — second call returns same promise', async () => {
    const p1 = ensurePolyfill()
    const p2 = ensurePolyfill()
    expect(p1).toBe(p2)
    await p1
    expect(getPolyfillPromise()).not.toBeNull()
  })

  it('resetPolyfillPromise() sets cache to null', () => {
    // Warm up cache then reset.
    ensurePolyfill()
    expect(getPolyfillPromise()).not.toBeNull()
    resetPolyfillPromise()
    expect(getPolyfillPromise()).toBeNull()
  })

  // NOTE: The rejection test (production .catch path at qr-scanner.service.ts:41-44)
  // lives in qr-scanner.polyfill-rejection.test.ts — a dedicated file with its own
  // top-level vi.mock() so the throwing polyfill factory does not leak into this
  // file's scanWeb() / scanForCode() tests which require a resolving polyfill.
})

describe('scanNative()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok with rawValue when camera granted and scan succeeds', async () => {
    mockRequestPermissions.mockResolvedValue({ camera: 'granted' })
    mockScan.mockResolvedValue({
      barcodes: [{ rawValue: 'hnch://ABC123' }],
    })

    const result = await scanNative()

    expect(mockScan).toHaveBeenCalledOnce()
    expect(mockScan).toHaveBeenCalledWith({ formats: ['QR_CODE'] })
    expect(result).toEqual({ status: 'ok', value: 'hnch://ABC123' })
  })

  it('returns ok when camera permission is limited', async () => {
    mockRequestPermissions.mockResolvedValue({ camera: 'limited' })
    mockScan.mockResolvedValue({
      barcodes: [{ rawValue: 'hnch://LIMITED' }],
    })

    const result = await scanNative()
    expect(result).toEqual({ status: 'ok', value: 'hnch://LIMITED' })
  })

  it('returns cancelled when permission denied', async () => {
    mockRequestPermissions.mockResolvedValue({ camera: 'denied' })

    const result = await scanNative()

    expect(mockScan).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'cancelled' })
  })

  it('returns cancelled when scan() throws (user cancelled)', async () => {
    mockRequestPermissions.mockResolvedValue({ camera: 'granted' })
    mockScan.mockRejectedValue(new Error('Cancelled'))

    const result = await scanNative()

    expect(result).toEqual({ status: 'cancelled' })
  })

  it('returns cancelled when barcodes array is empty', async () => {
    mockRequestPermissions.mockResolvedValue({ camera: 'limited' })
    mockScan.mockResolvedValue({ barcodes: [] })

    const result = await scanNative()

    expect(result).toEqual({ status: 'cancelled' })
  })
})

describe('scanWeb()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPolyfillPromise()
  })

  it('creates modal with WebQrScannerOverlayComponent and returns ok on success', async () => {
    const { ctrl, mockCreate, mockPresent, mockOnWillDismiss } = makeMockModalCtrl('hnch://XYZ999')
    mockOnWillDismiss.mockResolvedValue({ data: 'hnch://XYZ999', role: 'backdrop' })

    const result = await scanWeb(ctrl)

    expect(mockCreate).toHaveBeenCalledOnce()
    const createArg = mockCreate.mock.calls[0][0] as { component: unknown }
    expect(createArg.component).toBeTruthy()
    expect(mockPresent).toHaveBeenCalledOnce()
    expect(mockOnWillDismiss).toHaveBeenCalledOnce()
    expect(result).toEqual({ status: 'ok', value: 'hnch://XYZ999' })
  })

  it('returns cancelled when modal dismisses with null data', async () => {
    const { ctrl } = makeMockModalCtrl(null)

    const result = await scanWeb(ctrl)

    expect(result).toEqual({ status: 'cancelled' })
  })

  it('returns cancelled when modal dismisses with undefined data', async () => {
    const { ctrl, mockOnWillDismiss } = makeMockModalCtrl(null)
    mockOnWillDismiss.mockResolvedValue({ data: undefined, role: 'backdrop' })

    const result = await scanWeb(ctrl)

    expect(result).toEqual({ status: 'cancelled' })
  })

  it('returns error with reason when overlay dismisses with { reason }', async () => {
    const { ctrl } = makeMockModalCtrl({ reason: 'permission-denied' })

    const result = await scanWeb(ctrl)

    expect(result).toEqual({ status: 'error', reason: 'permission-denied' })
  })

  it('maps unavailable reason correctly', async () => {
    const { ctrl } = makeMockModalCtrl({ reason: 'unavailable' })

    const result = await scanWeb(ctrl)

    expect(result).toEqual({ status: 'error', reason: 'unavailable' })
  })

  it('maps no-camera reason correctly', async () => {
    const { ctrl } = makeMockModalCtrl({ reason: 'no-camera' })

    const result = await scanWeb(ctrl)

    expect(result).toEqual({ status: 'error', reason: 'no-camera' })
  })

  it('does not call BarcodeScanner.scan on web path', async () => {
    const { ctrl } = makeMockModalCtrl(null)

    await scanWeb(ctrl)

    expect(mockScan).not.toHaveBeenCalled()
  })

  it('does not call BarcodeScanner.requestPermissions on web path', async () => {
    const { ctrl } = makeMockModalCtrl(null)

    await scanWeb(ctrl)

    expect(mockRequestPermissions).not.toHaveBeenCalled()
  })

})

// ---------------------------------------------------------------------------
// QrScannerService.scanForCode() — branch routing (uses TestBed for inject())
// ---------------------------------------------------------------------------

describe('QrScannerService.scanForCode() routing', () => {
  let mockModalCreate: ReturnType<typeof vi.fn>
  let mockModalPresent: ReturnType<typeof vi.fn>
  let mockModalOnWillDismiss: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    resetPolyfillPromise()
    isNative = false

    mockModalPresent = vi.fn().mockResolvedValue(undefined)
    mockModalOnWillDismiss = vi.fn().mockResolvedValue({ data: null })
    mockModalCreate = vi.fn().mockResolvedValue({
      present: mockModalPresent,
      onWillDismiss: mockModalOnWillDismiss,
    })

    await TestBed.configureTestingModule({
      providers: [
        QrScannerService,
        {
          provide: ModalController,
          useValue: { create: mockModalCreate },
        },
      ],
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('routes to scanNative when isNativePlatform is true', async () => {
    isNative = true
    mockRequestPermissions.mockResolvedValue({ camera: 'denied' })

    const service = TestBed.inject(QrScannerService)
    const result = await service.scanForCode()

    // scanNative path: requestPermissions is its first call
    expect(mockRequestPermissions).toHaveBeenCalledOnce()
    expect(mockModalCreate).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'cancelled' })
  })

  it('routes to scanWeb when isNativePlatform is false', async () => {
    isNative = false

    const service = TestBed.inject(QrScannerService)
    const result = await service.scanForCode()

    // scanWeb path: modalCtrl.create is its first call
    expect(mockModalCreate).toHaveBeenCalledOnce()
    expect(mockRequestPermissions).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'cancelled' })
  })

  it('returns error:unknown when scanForCode throws internally', async () => {
    isNative = false
    mockModalCreate.mockRejectedValue(new Error('unexpected modal error'))

    const service = TestBed.inject(QrScannerService)
    const result = await service.scanForCode()

    expect(result).toEqual({ status: 'error', reason: 'unknown' })
  })
})

// ---------------------------------------------------------------------------
// mapDomErrorToReason
// ---------------------------------------------------------------------------

describe('mapDomErrorToReason()', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['PermissionDeniedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'no-camera'],
    ['OverconstrainedError', 'no-camera'],
    ['ConstraintNotSatisfiedError', 'no-camera'],
    ['NotReadableError', 'camera-busy'],
    ['TrackStartError', 'camera-busy'],
    ['AbortError', 'camera-busy'],
  ] as const)(
    'maps DOMException name "%s" → "%s"',
    (name, expected) => {
      const err = Object.assign(new Error('test'), { name })
      expect(mapDomErrorToReason(err)).toBe(expected)
    },
  )

  it.each([
    'Feature is unsupported on this platform',
    'not implemented in this browser',
    'Barcode Detection API is not available',
  ])('maps message containing barcode-detector hint to unavailable: %s', (message) => {
    expect(mapDomErrorToReason(new Error(message))).toBe('unavailable')
  })

  it('maps unknown DOMException name to unknown', () => {
    const err = Object.assign(new Error('weird'), { name: 'WeirdError' })
    expect(mapDomErrorToReason(err)).toBe('unknown')
  })

  it('maps non-Error (string) to unknown', () => {
    expect(mapDomErrorToReason('some string error')).toBe('unknown')
  })

  it('maps null to unknown', () => {
    expect(mapDomErrorToReason(null)).toBe('unknown')
  })
})
