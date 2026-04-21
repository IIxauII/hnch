# ADR-0004: Local persistence — Capawesome SQLite on native, IndexedDB on PWA

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

Every client persists its own copy of the Yjs document locally so that reloading, closing the tab, or briefly losing connectivity doesn't wipe session state. The persistence layer also enables offline interaction per the product principles.

Two platforms, two different storage stories:

On the web / PWA, the standard Yjs provider is `y-indexeddb`, which persists the doc to the browser's IndexedDB.

On Capacitor iOS, however, IndexedDB is stored inside WKWebView's storage, and WKWebView has a documented eviction policy: data is deleted after **7 days of the app not being used**. This is a practical blocker for a planning poker app where a team might not open it for 2–3 weeks between sprints. We need a different backing store on native.

## Decision

- **Web / PWA:** use `y-indexeddb` as the Yjs persistence provider.
- **iOS / Android native (Capacitor):** use **@capawesome/capacitor-sqlite** with a custom Yjs persistence provider that wraps it. This survives the WKWebView 7-day eviction because SQLite files are stored outside the WebView's managed storage area.

## Options Considered

### Option A: `y-indexeddb` everywhere

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None |
| Scalability | Fine for per-device state |
| Team familiarity | Standard Yjs path |

**Pros:** single provider, simplest mental model, standard Yjs deployment pattern.
**Cons:** fatal on iOS Capacitor due to the 7-day WKWebView eviction. Users coming back from vacation would lose their local state. Unacceptable for the product.

### Option B: Capawesome SQLite on native, y-indexeddb on PWA (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Open-source |
| Scalability | Fine |
| Team familiarity | Custom provider is new work |

**Pros:** durable storage on native that survives long inactivity; well-maintained Capacitor plugin; SQLite is familiar and debuggable; the PWA path uses the standard `y-indexeddb`.
**Cons:** need to write a Yjs persistence provider around the SQLite plugin (not large, but custom code we own); two code paths to test; two different storage-corruption failure modes to handle.

### Option C: `@capacitor-community/sqlite` instead of Capawesome

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | None |
| Scalability | Fine |
| Team familiarity | Similar |

**Pros:** equally capable; older and more widely deployed.
**Cons:** Capawesome's plugin suite is actively maintained with consistent API conventions across their plugins (Preferences, Filesystem, etc.) that we are already using elsewhere in the stack. Fewer moving parts.

### Option D: OPFS (Origin Private File System) on web, SQLite on native

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | None |
| Scalability | Fine |
| Team familiarity | Lower |

**Pros:** OPFS is less eviction-prone than IndexedDB on some browsers; Safari has been improving OPFS support.
**Cons:** Yjs does not have an official OPFS provider; we'd need a custom one; IndexedDB eviction on browsers other than iOS Capacitor WKWebView is less severe and has not been a reported blocker for Yjs apps. Premature.

## Trade-off Analysis

We accept the cost of writing a custom Yjs persistence provider for SQLite because the 7-day WKWebView eviction makes y-indexeddb non-viable on iOS Capacitor, and the product needs to survive multi-week gaps between uses (e.g. teams that estimate every other sprint). The split between native and PWA introduces two code paths, but the Yjs provider interface is narrow (observe updates, persist, load on startup) so the surface area is manageable.

Capawesome over Capacitor Community SQLite is a judgment call — both work — and it leans on Capawesome's consistent plugin conventions elsewhere in the stack.

## Consequences

**Easier:**
- Sessions survive long app inactivity on iOS, matching user expectations.
- PWA users get the standard, battle-tested y-indexeddb path.
- SQLite on native opens the door to more sophisticated local queries later (e.g. per-device session history listing) without a second storage engine.

**Harder:**
- Two storage paths to keep in sync in terms of behavior and error handling.
- Custom Yjs provider is code we own — if it has a bug, it's ours to fix.
- Need a platform-detect abstraction so the rest of the app doesn't know which backing store is active.

**Revisit triggers:**
- If Apple changes the WKWebView eviction policy meaningfully (unlikely), Option A becomes viable again.
- If the Capawesome plugin becomes unmaintained or introduces a regression, switch to `@capacitor-community/sqlite` (Option C).

## Action Items

- [ ] Design the persistence provider abstraction so the rest of the app depends on an interface, not a concrete backend.
- [ ] Implement the SQLite-backed Yjs provider against `@capawesome/capacitor-sqlite`.
- [ ] Validation spike: confirm Yjs + Capawesome SQLite round-trips on iOS device and survives app restart (Phase 1 task).
- [ ] Document the schema used in the SQLite table (essentially: room UUID → encoded Yjs updates) for future migrations.
