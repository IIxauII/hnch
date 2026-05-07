# ADR-0034: QR scan native-vs-web split — single plugin, runtime platform branch, lazy ZXing-WASM polyfill on web

**Status:** Proposed
**Date:** 2026-04-30

## Context

- Join page exposes "Scan QR"; payload = deep-link URL per [ADR-0026](0026-deep-link-url-format.md), parsed via existing `parseInviteContent()` — scanner is content-blind.
- Current impl ([`packages/client/src/app/core/qr-scanner.service.ts`](../packages/client/src/app/core/qr-scanner.service.ts)) calls `BarcodeScanner.scan()` from `@capacitor-mlkit/barcode-scanning`. Works on iOS/Android (native UI ready-made).
- On web, `BarcodeScanner.scan()` throws `Unimplemented` → silent no-op.
- Plugin's lower-level `startScan()` + `barcodesScanned` event uses browser `BarcodeDetector` — present on Chromium, absent on Safari + Firefox. Plugin docs recommend [`barcode-detector`](https://www.npmjs.com/package/barcode-detector) npm package (ZXing-C++ → WASM) as polyfill.
- Polyfill ~300–500 KB ungzipped. Angular budget: 1.6 MB warn / 2 MB error. Eager import punishes every PWA visitor.

## Decision

Keep `@capacitor-mlkit/barcode-scanning` as sole QR dep. Branch on `Capacitor.isNativePlatform()`:
1. **Native:** keep `BarcodeScanner.scan()`. Unchanged.
2. **Web:** `BarcodeScanner.startScan()` + `barcodesScanned` listener; lazy `await import('barcode-detector/polyfill')` only on user tap. Custom overlay = full-viewport `<video>` + Cancel button. No header/reticle/hint in v1.

Decoded payload → existing `parseInviteContent()`.

## Options

- **A — Hide button on web:** zero new code. Cons: loses scan-to-join for entire PWA user base (largest share pre-Phase-6b). Rejected.
- **B — Replace plugin (`@capacitor/barcode-scanner`, `ngx-scanner`, `zxing-js`):** single library across surfaces. Cons: drops MLKit-quality native decoder + native UI; web side still needs same polyfill on Safari/Firefox; rewrite cost for no win. Rejected.
- **C — Single plugin + platform branch + lazy ZXing-WASM polyfill on web (CHOSEN):** native byte-for-byte unchanged → zero regression risk; lazy import keeps WASM out of initial bundle (~100–300 ms one-time WASM init on first scan); follows Capawesome's recommended path. Cons: two code paths to keep in sync; bare web overlay in v1; HTTPS required for `getUserMedia()` (prod via [ADR-0029](0029-relay-deployment.md), localhost OK per spec).

## Trade-offs

- Platform branch in QR service contract — must remember on plugin major-version bump. Mitigation: branch local to one service + one overlay; converges at "raw decoded string" → existing `parseInviteContent()`.
- Bare web overlay in v1 (no reticle/hint/branded chrome). Acceptable vs no scanner at all; brandable later without ADR.
- Lazy import is load-bearing for bundle budget; eager would push ~300–500 KB closer to 2 MB hard limit and penalize non-scanners.

## Consequences

- Easier: iOS Safari + Firefox PWA gain working scan; native untouched (no Phase-6b coupling); initial bundle unchanged; one library across both surfaces; deep-link contract unaffected.
- Harder: runtime branch part of contract → tests must mock both; bare web overlay; first-scan WASM init latency (need "starting camera…" spinner); Playwright e2e can't easily exercise real camera → web path coverage limited to mocked unit tests.
- Revisit when: plugin ships usable web `scan()` UI (collapse branch); Safari + Firefox both ship native `BarcodeDetector` (delete polyfill); UX demands polished web overlay (impl task, not ADR); polyfill bundle >1 MB or trust posture changes (revisit Option B); demand for non-QR formats (current shape extends).

## Action Items

- [ ] Implement platform branch in [`packages/client/src/app/core/qr-scanner.service.ts`](../packages/client/src/app/core/qr-scanner.service.ts).
- [ ] Add web-only overlay component (`<video>` + Cancel) co-located with service.
- [ ] Add `barcode-detector` to `packages/client/package.json`; confirm zero initial-bundle impact (separate chunk).
- [ ] Unit tests: both branches (`isNativePlatform` true/false, mock dynamic import + `BarcodeDetector` polyfill).
- [ ] Verify production HTTPS satisfies `getUserMedia()` end-to-end on real iOS Safari after next deploy.
- [ ] Update `CLAUDE.md` glance with one-liner.
