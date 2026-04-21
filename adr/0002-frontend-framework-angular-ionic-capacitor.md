# ADR-0002: Frontend framework — Angular + Ionic + Capacitor

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

hnch must run as a PWA (browser), an iOS app, and an Android app. The team wants one codebase covering all three, a mobile-first component library that adapts to desktop, and a native bridge for platform APIs (secure storage, device identifiers, potentially Bluetooth in v2).

## Decision

Use **Angular** as the application framework, **Ionic** as the UI component library, and **Capacitor** as the native bridge for iOS and Android.

## Options Considered

### Option A: Angular + Ionic + Capacitor (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Open-source; no runtime fees |
| Scalability | Excellent; mature ecosystem |
| Team familiarity | High (stated) |

**Pros:** single TypeScript codebase for web + native; Ionic's component set is mobile-first and built for adaptive layouts; Capacitor replaced Cordova as the modern bridge and has a healthy plugin ecosystem including the Device plugin we rely on in ADR-0005; Angular's dependency injection and module system scales well as the app grows; straightforward PWA story.
**Cons:** Angular has a steeper learning curve than React/Vue for new contributors; Ionic components are opinionated and occasionally hard to restyle at the edges; Capacitor WebView performance is bounded by WKWebView on iOS (a known cross-platform tax).

### Option B: React Native

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-High |
| Cost | Open-source; some native expertise eventually required |
| Scalability | Excellent |
| Team familiarity | Lower |

**Pros:** native rendering (not WebView) so potentially smoother on iOS; huge community; the React model suits some developers well.
**Cons:** no first-class PWA story — a separate web build via React Native Web is a second-class citizen; Yjs integration works but is less well-trodden on RN than on web; a WebView-based architecture is simpler for our use case where we don't need 60fps native animations.

### Option C: Flutter

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Open-source |
| Scalability | Excellent |
| Team familiarity | Low |

**Pros:** single codebase across iOS, Android, web, desktop; Dart is pleasant; Google-backed; excellent performance story.
**Cons:** Dart is an additional language to learn; the web story uses a custom rendering path that works but has accessibility and SEO caveats; Yjs integration requires FFI or a secondary JS runtime; no practical path for collaboration with the existing Yjs/TypeScript ecosystem.

### Option D: Vue + Quasar + Capacitor

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low-Medium |
| Cost | Open-source |
| Scalability | Good |
| Team familiarity | Medium |

**Pros:** Quasar is an excellent cross-platform Vue UI framework; Capacitor still provides the native bridge; Vue has a gentler learning curve than Angular.
**Cons:** smaller enterprise ecosystem than Angular; dependency injection is less formal; no meaningful advantage over Option A given the team already prefers Angular.

## Trade-off Analysis

The decisive factor is that we want one TypeScript codebase that ships to PWA and native stores with the least impedance, and that's what Angular + Ionic + Capacitor was specifically designed to do. Every other option either accepts the web as a second-class target (React Native, Flutter) or doesn't improve meaningfully on what Angular offers given the existing familiarity.

The WebView-based native approach (versus Option B's native rendering) is acceptable because hnch is not a graphics-heavy app. The UI is cards, lists, and a timer — all of which render well in WebView. The known iOS WKWebView constraint affects storage behavior (see ADR-0004) but not sync or rendering meaningfully.

## Consequences

**Easier:**
- One codebase, three platforms, no separate engineering tracks.
- The PWA story is first-class, not an afterthought.
- Ionic's adaptive layout means desktop-in-the-browser gets handled with the same components.

**Harder:**
- iOS WebView lifecycle (background/foreground transitions, storage quirks) needs to be tested early (Phase 1 validation spike).
- Ionic styling sometimes fights against custom design; budget time for that when we do the visual pass.

**Revisit triggers:**
- WebView perf becoming an actual user complaint (unlikely for this app).
- If we ever need a feature that requires native-only rendering (e.g. advanced animations) we can drop Capacitor plugins into the gap without changing frameworks.

## Action Items

- [ ] Scaffold with `ionic start` using the Angular template and configure Capacitor for iOS and Android (Phase 1).
- [ ] Run a spike on iOS Capacitor: WebSocket stability across app background/foreground transitions and Yjs+storage behavior (Phase 1 validation).
