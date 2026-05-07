# ADR-0004: Local persistence — Capawesome SQLite (native) + IndexedDB (PWA)

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Each client persists own Yjs doc copy → reload/close/disconnect doesn't wipe state; enables offline.
- PWA standard: `y-indexeddb`.
- iOS Capacitor: IndexedDB lives inside WKWebView storage; WKWebView evicts data after **7 days of app inactivity**. Blocker — teams may go 2–3 weeks between sprints. Native needs different store.

## Decision

- **Web/PWA:** `y-indexeddb`.
- **iOS/Android native (Capacitor):** **@capawesome/capacitor-sqlite** + custom Yjs persistence provider. SQLite files live outside WebView managed storage → survives 7-day eviction. Capawesome chosen over `@capacitor-community/sqlite` for consistency with already-used Capawesome plugin suite (Preferences, Filesystem).

## Trade-offs

- Custom Yjs SQLite provider = code we own; surface narrow (observe/persist/load) so manageable.
- Two storage paths to test + handle errors for.
- Capawesome over Community SQLite is judgment call; both work.

## Consequences

- Easier: native sessions survive long inactivity; PWA stays on battle-tested IndexedDB; SQLite enables future per-device session-history queries.
- Harder: two storage paths to keep behaviorally aligned; custom provider bugs are ours; need platform-detect abstraction so app code stays backend-agnostic.
- Revisit when: Apple changes WKWebView eviction (unlikely) → single provider viable; Capawesome unmaintained or regressing → switch to Community SQLite.
