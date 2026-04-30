# ADR-0034: QR scan native-vs-web split — single plugin, runtime platform branch, lazy ZXing-WASM polyfill on web

**Status:** Proposed
**Date:** 2026-04-30
**Deciders:** xau

## Context

The Join page exposes a "Scan QR" affordance so a participant can join a room by pointing their camera at the host's screen-or-printed QR code. The QR payload is the deep-link URL recorded in [ADR-0026](0026-deep-link-url-format.md) (`${appBaseUrl}/join?code=XXXXXX`), parsed client-side by the existing `parseInviteContent()` helper. The scanning surface is therefore content-agnostic — it returns a raw string that is then funneled through the same normalization path as a typed code or a tapped link.

The current implementation lives at [`packages/client/src/app/core/qr-scanner.service.ts`](../packages/client/src/app/core/qr-scanner.service.ts) and uses `@capacitor-mlkit/barcode-scanning`'s `BarcodeScanner.scan()` API. That single call presents a ready-made native camera UI on iOS and Android and resolves with the decoded payload. It is the minimal-code path on native and is working as intended there.

On web (PWA), `BarcodeScanner.scan()` does **not** exist. The plugin's web implementation throws an `Unimplemented` exception, which the service currently swallows. The visible symptom: tapping "Scan QR" in a desktop or iOS-Safari PWA produces a silent no-op. This ADR records the decision made while fixing that bug — a decision about the *shape* of the fix (single library + platform branch + lazy polyfill) rather than the bug fix itself.

The plugin documents a second, lower-level API that does work on web: `BarcodeScanner.startScan()` plus a `barcodesScanned` event listener. The web implementation of that API delegates to the browser's native `BarcodeDetector`. That API is shipped by Chromium-based browsers (Chrome, Edge, Android Chrome) but is **absent from Safari (iOS + macOS) and Firefox**. The Capawesome plugin's own web docs recommend the [`barcode-detector`](https://www.npmjs.com/package/barcode-detector) npm package as a polyfill — a ZXing-C++ build compiled to WASM, which registers a global `BarcodeDetector` shim when its `/polyfill` entry-point is imported. With the polyfill in place, `startScan()` works uniformly across every browser we care about.

The polyfill is large enough to be worth thinking about: ~300–500 KB ungzipped (most of which is the WASM blob). The Angular bundle budget is 1.6 MB warning / 2 MB error. Eagerly importing it into the web client would push noticeably against that budget, and would punish every user who never taps "Scan QR" — which on desktop is most of them.

A reasonable contributor could have decided this differently: hide the button on web, swap the scanning library, or accept the bundle hit and import eagerly. Each has real costs that this ADR makes explicit so the choice is not silently re-litigated.

## Decision

Keep `@capacitor-mlkit/barcode-scanning` as the single QR-scanning dependency. At runtime, branch on `Capacitor.isNativePlatform()`:

1. **Native (iOS, Android).** Continue calling `BarcodeScanner.scan()`. The plugin presents its native camera UI; nothing else changes. Existing behavior preserved.
2. **Web (PWA).** Use the plugin's event-driven `BarcodeScanner.startScan()` / `addListener('barcodesScanned', …)` API, with the [`barcode-detector`](https://www.npmjs.com/package/barcode-detector) polyfill loaded **lazily** via `await import('barcode-detector/polyfill')` only when the user actually taps "Scan QR". Present a thin custom overlay component on this path: full-viewport `<video>` element bound to the camera stream plus a single "Cancel" button. No Ionic header, no reticle, no hint text in v1.

The QR payload returned from either path is opaque to the scanner — it is handed to the existing `parseInviteContent()` helper, which already knows how to extract a room code from a deep-link URL per [ADR-0026](0026-deep-link-url-format.md).

## Options Considered

### Option A: Hide the scan button on web

| Dimension | Assessment |
|-----------|------------|
| Complexity | Trivial |
| Bundle cost | Zero |
| Feature parity | **Lost** — PWA users have no scan path |
| Trust ledger | Unchanged |

**Pros:** zero new code; zero bundle impact; the "silent no-op" bug goes away because the affordance is gone.
**Cons:** loses scan-to-join entirely for the PWA user base. The whole point of the deep-link QR contract in [ADR-0026](0026-deep-link-url-format.md) is that anyone can scan the host's code from across the room — including someone on a laptop or an iPhone running the web app, who today is the largest share of users (the iOS native build is Phase 6b, not yet shipped). Restoring parity later would mean writing exactly the code this ADR's chosen option writes now, plus the cost of the gap in the meantime.

### Option B: Replace the plugin with a different scanner

Candidates surveyed: `@capacitor/barcode-scanner` (an older official Capacitor plugin, less actively maintained than the MLKit one), `ngx-scanner` (Angular wrapper around `zxing-js`), or `zxing-js/library` directly.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — rewrite native + web paths |
| Bundle cost | Comparable or worse on web |
| Native UX | Worse — no MLKit-quality decoder, no ready-made native UI |
| Dep churn | High — drop a vetted, currently-working integration |
| Trust ledger | New maintainer to evaluate |

**Pros:** a single library that works on both surfaces with no platform branch is conceptually cleaner.
**Cons:** the candidates either drop the MLKit-quality native decoder (`zxing-js` everywhere) or keep using a wrapper around the same underlying browser `BarcodeDetector` API and therefore need the same polyfill on Safari / Firefox. We pay rewrite cost and lose the MLKit native experience to land in roughly the same place. No real win.

### Option C: Single plugin, platform branch, lazy ZXing-WASM polyfill on web (CHOSEN)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low–Medium — one `if (isNativePlatform)`, one dynamic import, one overlay component |
| Bundle cost | Zero on initial load (lazy); ~300–500 KB ungzipped on first web scan |
| Feature parity | Full — every supported browser + native gets a working scanner |
| Native UX | Unchanged — keeps MLKit's ready-made UI |
| Trust ledger | Unchanged on native; adds `barcode-detector` (Capawesome-recommended) on web only |

**Pros:**
- Native path is byte-for-byte unchanged → zero regression risk on iOS / Android.
- Web path gains a working scanner across Chromium, Safari, and Firefox without forking the dependency tree.
- Lazy `import('barcode-detector/polyfill')` keeps the WASM blob out of the initial bundle. First scan on web pays a one-time WASM init (typically ~100–300 ms on modern hardware); every subsequent scan in the session is free.
- The custom overlay is intentionally minimal — full-viewport `<video>` + a single Cancel button. Easy to build, easy to brand later if UX demands.
- Stays inside Capawesome's own recommended path, so the upgrade story is "follow plugin docs", not "we forked the integration".

**Cons:**
- Two code paths to keep in sync — the runtime branch is now part of the contract, and unit tests have to mock both.
- The custom web overlay is bare in v1 — no header, no reticle, no hint text. Acceptable for a working baseline; UX may want to revisit.
- HTTPS is required for `getUserMedia()` in the browser. Production already serves over HTTPS via Caddy auto-TLS per [ADR-0029](0029-relay-deployment.md), so the production path is satisfied. Local development runs on `http://localhost:4200`, which counts as a secure context for `getUserMedia()` per browser spec — but the camera path on dev still depends on the browser actually granting permission, and behavioral testing of the camera UI itself is therefore deferred to production or to mocked unit tests.

## Trade-off Analysis

Option C wins because it is the only option that **restores feature parity on web without regressing native UX or breaking the bundle budget**. Option A regresses parity. Option B regresses native UX (worse decoder, no MLKit-supplied camera UI) and pays rewrite cost to land in the same place on web. Option C accepts two costs:

1. **A platform branch.** This is a real maintenance tax — the runtime conditional is now part of the QR scanner's contract and has to be remembered when the plugin ships a major version. The mitigation is that the branch is local to one service file and one overlay component; nothing else in the app needs to know which path was taken. The native and web code paths converge at "raw decoded string", which is then handed to the same `parseInviteContent()` helper that the typed-code and deep-link entry points already use, so the rest of the join flow sees a single surface.

2. **A bare web overlay.** Shipping `<video>` + Cancel without the polished reticle / hint text that an Ionic-styled overlay would have is a UX shortcut. It is acceptable for v1 because the alternative is no scanner at all on web. The overlay component is small and self-contained; brandng it later is straightforward and does not require revisiting this ADR.

The lazy-load decision is the load-bearing one for the bundle budget. Eagerly importing the polyfill would push the initial bundle ~300–500 KB closer to the 2 MB hard limit and would penalize every PWA visitor regardless of whether they scan. Lazy `import('barcode-detector/polyfill')` localizes the cost to users who actually use the feature, on the click that already justifies a brief "starting camera…" spinner.

## Consequences

**Easier:**
- iOS Safari and Firefox PWA users gain working QR scanning where today they get a silent no-op.
- The native path is untouched — no regression risk, no Phase-6b coupling.
- Initial bundle is unchanged; the WASM blob ships only when the feature is invoked.
- One scanning library across both surfaces — no second dependency to vet, version-track, or reconcile in the build.
- The QR payload contract in [ADR-0026](0026-deep-link-url-format.md) is unaffected — the scanner is content-blind and hands the raw string to `parseInviteContent()` regardless of which path produced it.

**Harder:**
- The runtime platform branch is now part of the QR scanner's contract. The service file's tests must cover both branches; the e2e suite covers only one (whichever the test environment exposes).
- The web overlay is bare. UX may want a reticle / hint text / animation pass — that is a follow-up, not a blocker.
- First scan on web pays a one-time WASM init latency (~100–300 ms typical). Subsequent scans in the same session are free. A "starting camera…" spinner during the first call is appropriate UX hygiene.
- `getUserMedia()` requires a secure context. Production HTTPS via [ADR-0029](0029-relay-deployment.md) covers production; local dev on `http://localhost` is fine per spec but is not a substitute for testing on the real production origin. The Playwright e2e suite cannot easily exercise a real camera, so end-to-end coverage of the web scan path is limited to mocked unit tests until / unless we decide to test against a virtual camera device.

**Revisit triggers:**
- A future version of `@capacitor-mlkit/barcode-scanning` ships a usable web `scan()` UI. At that point the platform branch could collapse and the custom overlay could be deleted. (Unlikely soon — the plugin's web implementation is intentionally lower-level.)
- All target browsers (Safari + Firefox) ship a native `BarcodeDetector`. At that point the polyfill becomes dead weight and the dynamic import can be deleted. (Unlikely on Safari short-term; Firefox has been "considering" this API for years.)
- UX demands a polished web scanner overlay (reticle, framing hints, branded chrome). A follow-up implementation task, not a new ADR — the architectural shape stays the same.
- The polyfill bundle grows materially (>1 MB ungzipped) or its maintenance posture changes such that the trust ledger is no longer favorable. At that point we'd revisit Option B with fresh eyes.
- Demand to scan formats other than QR codes (1D barcodes, PDF417, etc.) for some new feature. The native path already supports them via `formats:`; the web path inherits whatever ZXing-C++ supports. This ADR's shape extends without rewrite.

## Action Items

- [ ] Implement the platform branch in [`packages/client/src/app/core/qr-scanner.service.ts`](../packages/client/src/app/core/qr-scanner.service.ts): native path keeps `BarcodeScanner.scan()`; web path lazy-imports `barcode-detector/polyfill`, calls `BarcodeScanner.startScan()`, listens for the `barcodesScanned` event, and resolves with the first match.
- [ ] Add a web-only overlay component (full-viewport `<video>` + Cancel button) co-located with the scanner service, mounted only when the web path is taken.
- [ ] Add `barcode-detector` to `packages/client/package.json` dependencies. Confirm bundle impact is zero on initial load (the dynamic import should produce a separate chunk per Angular's default code-splitting).
- [ ] Add unit tests covering both branches: native path mocks `Capacitor.isNativePlatform → true` and the plugin; web path mocks `→ false`, the dynamic import, and the `BarcodeDetector` polyfill.
- [ ] Verify the production HTTPS origin satisfies `getUserMedia()` end-to-end on a real iOS Safari device after the next deploy.
- [ ] Once accepted, update `adr/README.md` index with this entry (done as part of this PR).
- [ ] Update `CLAUDE.md` "Current decisions at a glance" with a one-liner referencing the QR scan native/web split.
- [ ] If UX later requests a polished web overlay (reticle, framing hints, branded header), file an implementation task — not a new ADR — referencing this one.
