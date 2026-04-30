# Plan — QR scan in mobile browser (PWA camera bridge)

## Context

The Join page exposes a "Scan QR code" entry point, but on mobile **browsers**
(Safari iOS / Chrome Android, the PWA build at `hnch.dev`) tapping it does
nothing — no camera UI, no error toast, no feedback. Native iOS/Android
builds work fine.

Root cause is a missing platform branch, not a missing capability:

- `QrScannerService.scanForCode()` (`packages/client/src/app/core/qr-scanner.service.ts:22-35`)
  unconditionally calls `BarcodeScanner.scan()` from
  `@capacitor-mlkit/barcode-scanning`.
- That method's web implementation throws `CapacitorException(Unimplemented)`.
- The service catches the exception and returns `null`.
- The caller (`onScanQr()` in `packages/client/src/app/join/join.page.ts:356-370`)
  treats `null` as "user cancelled" and bails silently.

The plugin **does** support web — but only via the event-driven
`startScan()` API (verified against Capawesome's `barcode-scanning`
GitHub README), not the ready-made `scan()` UI which is native-only. Web
parity therefore requires:

1. Branching on `Capacitor.isNativePlatform()` in `QrScannerService`.
2. A web path that builds its own camera-preview overlay (full-screen
   `<video>` + reticle + cancel button) and listens to `barcodesScanned`
   events from `startScan()`.
3. The Capawesome-recommended `barcode-detector` polyfill (ZXing-C++ WASM)
   for cross-browser support — Safari has no native `BarcodeDetector` API,
   only Chromium does.
4. Dynamic import of the polyfill so the ~300–500 KB chunk stays out of
   the initial bundle.

Production already serves over HTTPS (`hnch.dev`, Caddy auto-TLS), so
`getUserMedia` works there. Local dev runs HTTP — that's a developer
ergonomics concern, addressed below.

## Goals

- Mobile-browser users who tap "Scan QR" see a working camera scanner and
  can join a room without leaving the PWA.
- Native iOS/Android keeps the existing `scan()` flow — no regression.
- Bundle size stays under the existing 1.6 MB warning / 2 MB error budget
  (`packages/client/angular.json:40-44`); polyfill ships as a lazy chunk.
- Dark mode + safe areas honored (per `ionic.md`).
- E2E gains a real scan test (mocked `getUserMedia` with a known QR
  frame), not just the button-visibility check that exists today
  (`packages/e2e/tests/qr-scan.spec.ts`).
- One new ADR (`0034`) records the native + web split decision.

## Non-goals

- Replacing the `@capacitor-mlkit/barcode-scanning` plugin. Stays.
- Torch / zoom / multi-format support on web — out of scope (not supported
  by the plugin web path; QR-only is fine).
- HTTPS for `pnpm dev:client` by default — flagged as an optional
  developer convenience; production HTTPS already covers the user-facing
  case.
- Phase 6b iOS native build work.

## Worktree workflow

CLAUDE.md prescribes worktrees for any multi-phase chunk. Use it here.

```bash
# from repo root
pnpm worktree:add qr-pwa-scan main
cd ../hnch-qr-pwa-scan
# .env.local auto-generated with CLIENT_PORT / RELAY_PORT offsets
pnpm dev:client &
pnpm dev:relay &
```

All implementation, tests, ADR, PR happen in `../hnch-qr-pwa-scan`. `main`
worktree (`./hnch`) stays clean for hotfixes / unrelated review.

Cleanup after merge:

```bash
pnpm worktree:remove qr-pwa-scan
git branch -D qr-pwa-scan   # only if the PR was squash-merged
```

## Decisions (locked)

- **D1 — Polyfill loading: lazy.** Dynamic `import('barcode-detector/polyfill')`
  inside the web branch of `QrScannerService.scanForCode()` only when the
  user taps "Scan QR". Keeps initial bundle unchanged; first scan pays
  ~100-300 ms one-time WASM init. Required for Safari iOS + Firefox; the
  plugin's native web path covers Chromium-based browsers without it.
- **D2 — Overlay: bare.** Full-viewport `<video>` element with a single
  floating "Cancel" button. No Ionic header / reticle / hint text. Simpler
  component, faster to ship, can be branded later if UX wants.
- **D3 — Dev HTTPS: skip.** Camera path tested on production
  (`https://hnch.dev`) via mobile device. Dev server stays on HTTP. No
  `--ssl` flag, no mkcert, no `angular.md` change. Manual on-device dev
  testing of the camera path is deferred until needed.
- **D4 — E2E: skip; unit tests only.** Cover the new web path with
  Vitest unit tests for `QrScannerService` (web branch) and the overlay
  component (mocked `getUserMedia` + plugin). The existing
  `qr-scan.spec.ts` Playwright spec stays as-is (button-visibility only).
  E2E coverage of the camera path is a follow-up if regressions surface.

## Implementation phases

### Phase 1 — service + polyfill (ADR + plumbing)

- Write `adr/0034-qr-scan-native-web-split.md` first (immutable once
  accepted; references ADR-0002 stack, ADR-0026 deep-link format). Status:
  Proposed.
- Add `barcode-detector` to `packages/client/package.json` devDependencies.
- Refactor `QrScannerService.scanForCode()`:
  - Native path: existing `scan()` unchanged.
  - Web path: dynamic-import polyfill, present new
    `WebQrScannerOverlayComponent` modal, await its result, return.
  - Signature became `Promise<QrScanResult>` (discriminated union covering `ok` / `cancelled` / `error` with reason codes). `onScanQr()` updated in lockstep to map error reasons to user-facing toast copy.

**Files touched**

- `adr/0034-qr-scan-native-web-split.md` (new)
- `packages/client/package.json` (one dep)
- `packages/client/src/app/core/qr-scanner.service.ts` (branch added)

### Phase 2 — web overlay component (bare)

- Create `packages/client/src/app/core/web-qr-scanner.overlay.ts`
  (standalone, signals, `@if` control flow). Layout: full-viewport
  `<video>` element + a single floating "Cancel" button (absolute-
  positioned, safe-area-inset aware). No `ion-header`, no reticle, no
  hint text.
- Pass the `<video>` ElementRef to `BarcodeScanner.startScan({ formats: [QrCode], videoElement })` — plugin owns the `getUserMedia` stream lifecycle on web; no direct `getUserMedia` call in the overlay.
- Listen via `BarcodeScanner.addListener('barcodesScanned', …)`.
- On first match: stop listener + `stopScan()`, dismiss modal with `rawValue`.
- On cancel button: same teardown, dismiss with `null` (becomes `cancelled`).
- On `ngOnDestroy`: defensive teardown (stop listener + `stopScan()` if still active).
- On thrown error: map via `mapDomErrorToReason` (`NotAllowedError` → `permission-denied`, `NotFoundError` / `OverconstrainedError` → `no-camera`, `NotReadableError` / `AbortError` → `camera-busy`, BarcodeDetector unsupported → `unavailable`, else `unknown`), dismiss with `{ reason }`.
- Unit tests cover the `mapDomErrorToReason` mapping table + race guards (double-listener idempotency) + teardown on destroy.

**Files touched**

- `packages/client/src/app/core/web-qr-scanner.overlay.ts` (new)
- `packages/client/src/app/core/web-qr-scanner.overlay.test.ts` (new)
- `packages/client/src/app/core/qr-scanner.service.test.ts` (extend — cover
  web branch with mocked `Capacitor.isNativePlatform()` returning false)

### Phase 3 — bundle audit + PR

- Run `pnpm --filter @hnch/client build` and verify the emitted lazy chunk
  for `barcode-detector` is split off; initial bundle stays under
  `angular.json:40-44` 1.6 MB warning / 2 MB error budget.
- If over budget, narrow polyfill imports (e.g.
  `barcode-detector/pure`) or only-QR build.
- Open PR with the standard hnch checklist + a note that production
  smoke-test (real iPhone Safari + Android Chrome on `hnch.dev`) is the
  acceptance gate.

## Verification end-to-end

1. **Unit tests:** `pnpm --filter @hnch/client test` — overlay component
   + service web branch covered.
2. **Build + bundle:** `pnpm --filter @hnch/client build` — initial
   bundle under 1.6 MB warning threshold; emitted lazy chunk for
   `barcode-detector` visible in stats.
3. **Lint + typecheck:** `pnpm --filter @hnch/client lint && pnpm
   --filter @hnch/client typecheck`.
4. **Production smoke (post-deploy):** push tag → `deploy-client.yml`
   ships PWA → open `https://hnch.dev/join` on a real iPhone Safari and
   real Android Chrome; confirm scan works on both. Document result in
   the PR description (or in a follow-up comment after merge if testing
   from prod).
5. **Native regression check:** install the iOS/Android dev build on the
   simulator/device (Phase 6b not required — existing native builds);
   confirm the original `scan()` path still works unchanged.

## Risk register

- **Safari iOS support:** `BarcodeDetector` isn't native in Safari. Polyfill
  (ZXing-C++ WASM) covers it. If WASM startup latency is unacceptable,
  fall back to `readBarcodesFromImage()` triggered on a `requestVideoFrameCallback`
  loop. Defer until measured.
- **Camera-permission UX:** A user who once denies camera access on Safari
  cannot easily re-prompt. Show a toast on `NotAllowedError` directing
  them to Safari settings → camera. Keep the share-link / paste-code path
  as a permanent first-class alternative on the Join page (already
  exists).
- **Bundle bloat:** Polyfill is ~300-500 KB. Dynamic import keeps it off
  the critical path. If bundle audit flags an issue, narrow to
  `barcode-detector/pure` build (no fallbacks for unsupported barcode
  types — we only need QR).
- **E2E flake:** Camera mocks in Playwright can race with the polyfill's
  first-frame detection. Use deterministic timing: render the QR canvas,
  call `requestAnimationFrame` ×2 before asserting detection, and use
  `expect.poll()` for the input-populated assertion.

## File-touch summary

| File | Action |
|---|---|
| `adr/0034-qr-scan-native-web-split.md` | **new** |
| `packages/client/package.json` | add `barcode-detector` dep |
| `packages/client/pnpm-lock.yaml` | regen |
| `packages/client/src/app/core/qr-scanner.service.ts` | platform branch + lazy import + modal-presentation logic |
| `packages/client/src/app/core/web-qr-scanner.overlay.ts` | **new** standalone bare-camera component |
| `packages/client/src/app/core/web-qr-scanner.overlay.test.ts` | **new** unit tests |
| `packages/client/src/app/core/qr-scanner.service.test.ts` | extend to cover web branch (mocked `Capacitor.isNativePlatform()`) |
