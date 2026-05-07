# ADR-0002: Frontend framework — Angular + Ionic + Capacitor

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Must ship as PWA, iOS app, Android app from one codebase.
- Need mobile-first component library that adapts to desktop.
- Need native bridge for platform APIs (secure storage, device ID, possibly Bluetooth in v2).
- Team familiarity highest with Angular.

## Decision

**Angular** app framework + **Ionic** UI components + **Capacitor** native bridge for iOS/Android.

## Options

- **A — Angular + Ionic + Capacitor (chosen):** single TS codebase, web + native. Pros: mobile-first adaptive components; Capacitor plugin ecosystem (Device, Preferences, SQLite); Angular DI scales; first-class PWA. Cons: steeper learning curve than React/Vue; Ionic styling occasionally fights customization; iOS WebView perf bounded by WKWebView.
- **B — React Native:** native rendering. Pros: smoother iOS animations; large community. Cons: PWA via RN-Web is second-class; Yjs less trodden on RN; native rendering overkill for card+list+timer UI.
- **C — Flutter:** Pros: one codebase across iOS/Android/web/desktop; strong perf. Cons: Dart adds a language; web rendering has a11y/SEO caveats; Yjs needs FFI or secondary JS runtime; cuts off the TS/Yjs ecosystem.
- **D — Vue + Quasar + Capacitor:** Pros: gentler curve; Quasar capable; same Capacitor bridge. Cons: smaller enterprise ecosystem; no advantage over A given team preference.

## Trade-offs

- WebView-based native (vs B's native render) → bounded iOS perf, but UI is not graphics-heavy.
- WKWebView storage quirks affect persistence model (see ADR-0004).
- Ionic styling restyle work budgeted for visual pass.

## Consequences

- Easier: one codebase, three platforms; first-class PWA; adaptive desktop-in-browser via same components.
- Harder: iOS WebView lifecycle (background/foreground, storage) needs early validation; Ionic style overrides cost time.
- Revisit when: WebView perf becomes real user complaint; feature requires native-only rendering (drop Capacitor plugin without changing framework).

## Action Items

- [ ] Scaffold via `ionic start` (Angular template); configure Capacitor iOS + Android (Phase 1).
- [ ] Spike on iOS Capacitor: WebSocket stability across background/foreground + Yjs+storage round-trip (Phase 1).
