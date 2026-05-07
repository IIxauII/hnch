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

## Trade-offs

- Platform branch in QR service contract — must remember on plugin major-version bump. Mitigation: branch local to one service + one overlay; converges at "raw decoded string" → existing `parseInviteContent()`.
- Bare web overlay in v1 (no reticle/hint/branded chrome). Acceptable vs no scanner at all; brandable later without ADR.
- Lazy import is load-bearing for bundle budget; eager would push ~300–500 KB closer to 2 MB hard limit and penalize non-scanners.
- HTTPS required for `getUserMedia()` (prod via [ADR-0029](0029-relay-deployment.md), localhost OK per spec).
- Hide-button-on-web rejected: loses scan-to-join for entire PWA user base.
- Replace-plugin (`zxing-js`/`ngx-scanner`) rejected: drops MLKit-quality native decoder + native UI; web side still needs same polyfill anyway.

## Consequences

- Easier: iOS Safari + Firefox PWA gain working scan; native untouched (no Phase-6b coupling); initial bundle unchanged; one library across both surfaces; deep-link contract unaffected.
- Harder: runtime branch part of contract → tests must mock both; bare web overlay; first-scan WASM init latency (need "starting camera…" spinner); Playwright e2e can't easily exercise real camera → web path coverage limited to mocked unit tests.
- Revisit when: plugin ships usable web `scan()` UI (collapse branch); Safari + Firefox both ship native `BarcodeDetector` (delete polyfill); UX demands polished web overlay; polyfill bundle >1 MB or trust posture changes; demand for non-QR formats.
