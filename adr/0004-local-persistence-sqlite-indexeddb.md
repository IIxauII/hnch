# ADR-0004: Local persistence — Capawesome SQLite (native) + IndexedDB (PWA)

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Each client persists own Yjs doc copy → reload/close/disconnect doesn't wipe state; enables offline.
- PWA standard: `y-indexeddb`.
- iOS Capacitor: IndexedDB lives inside WKWebView storage; WKWebView evicts data after **7 days of app inactivity**. Blocker — teams may go 2–3 weeks between sprints. Native needs different store.

## Decision

- **Web/PWA:** `y-indexeddb`.
- **iOS/Android native (Capacitor):** **@capawesome/capacitor-sqlite** + custom Yjs persistence provider. SQLite files live outside WebView managed storage → survives 7-day eviction.

## Options

- **A — `y-indexeddb` everywhere:** Pros: single provider, simplest model, standard Yjs path. Cons: fatal on iOS Capacitor (7-day eviction); users back from vacation lose state.
- **B — Capawesome SQLite native + y-indexeddb PWA (chosen):** Pros: durable native storage; well-maintained plugin; SQLite familiar/debuggable; PWA stays standard. Cons: must write Yjs persistence provider around plugin; two code paths; two storage-failure modes.
- **C — `@capacitor-community/sqlite` instead of Capawesome:** Pros: equally capable, older + more deployed. Cons: Capawesome's plugin suite already used (Preferences, Filesystem) with consistent conventions; fewer moving parts.
- **D — OPFS web + SQLite native:** Pros: OPFS less eviction-prone on some browsers; Safari support improving. Cons: no official Yjs OPFS provider; need custom; non-WKWebView IndexedDB eviction not a reported blocker. Premature.

## Trade-offs

- Custom Yjs SQLite provider = code we own; surface narrow (observe/persist/load) so manageable.
- Two storage paths to test + handle errors for.
- Capawesome over Community SQLite is judgment call; both work.

## Consequences

- Easier: native sessions survive long inactivity; PWA stays on battle-tested IndexedDB; SQLite enables future per-device session-history queries.
- Harder: two storage paths to keep behaviorally aligned; custom provider bugs are ours; need platform-detect abstraction so app code stays backend-agnostic.
- Revisit when: Apple changes WKWebView eviction (unlikely) → A viable; Capawesome unmaintained or regressing → switch to C.

## Action Items

- [ ] Persistence-provider abstraction so app depends on interface, not concrete backend.
- [ ] Implement SQLite-backed Yjs provider on `@capawesome/capacitor-sqlite`.
- [ ] Spike: Yjs + Capawesome SQLite round-trip on iOS device, survives restart (Phase 1).
- [ ] Document SQLite table schema (room UUID → encoded Yjs updates) for migrations.
