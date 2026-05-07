# ADR-0002: Frontend framework — Angular + Ionic + Capacitor

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Must ship as PWA, iOS app, Android app from one codebase.
- Need mobile-first component library that adapts to desktop.
- Need native bridge for platform APIs (secure storage, device ID, possibly Bluetooth in v2).
- Team familiarity highest with Angular.

## Decision

**Angular** app framework + **Ionic** UI components + **Capacitor** native bridge for iOS/Android. Single TS codebase serves web + native; Capacitor plugin ecosystem (Device, Preferences, SQLite) covers required platform APIs.

## Trade-offs

- WebView-based native → bounded iOS perf, but UI is not graphics-heavy.
- WKWebView storage quirks affect persistence model (see ADR-0004).
- Ionic styling restyle work budgeted for visual pass.

## Consequences

- Easier: one codebase, three platforms; first-class PWA; adaptive desktop-in-browser via same components.
- Harder: iOS WebView lifecycle (background/foreground, storage) needs early validation; Ionic style overrides cost time.
- Revisit when: WebView perf becomes real user complaint; feature requires native-only rendering (drop Capacitor plugin without changing framework).
