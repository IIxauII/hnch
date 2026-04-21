# ADR-0005: Device identity via the Capacitor Device plugin

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

hnch needs a stable per-device identifier for three purposes: associating a persisted nickname with the device, serving as the peer ID for host election (see ADR-0010), and recognizing returning participants across reconnects within a session. Because the product is accountless (see `project.md` principles), the identifier cannot depend on a user sign-in and must work across PWA, iOS, and Android.

## Decision

Use the Capacitor Device plugin's `Device.getId()` method to obtain a per-device identifier on first launch, then cache it in Capacitor Preferences (or SQLite) to avoid repeated bridge calls. The cached identifier is used for the lifetime of that install; if lost (storage cleared, app reinstalled), a new identifier is generated and the user appears as a new participant — silently, with no UX surface.

## Options Considered

### Option A: Capacitor Device.getId() + Preferences cache (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None |
| Scalability | N/A |
| Team familiarity | Good |

**Pros:** leans on platform-native identifier logic (Android's `ANDROID_ID`, iOS's `identifierForVendor`, a generated UUID on web); consistent API across all three platforms; slightly more durable on Android than a self-generated UUID; no new dependencies needed — the plugin is part of the Capacitor core.
**Cons:** iOS `identifierForVendor` resets when the last app from the vendor is uninstalled, which for a single-app vendor means "resets on every reinstall"; web just gets a generated UUID stored via Capacitor anyway, so it's no better than rolling our own there.

### Option B: Self-generated UUID in localStorage / Preferences

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None |
| Scalability | N/A |
| Team familiarity | Good |

**Pros:** dead simple; one code path across all platforms; no plugin dependency.
**Cons:** no better than Option A on iOS or web, and slightly worse than Option A on Android where we'd forgo the more durable `ANDROID_ID`.

### Option C: Browser fingerprinting (canvas/WebGL/fonts)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-High |
| Cost | Low infra, high reputational |
| Scalability | N/A |
| Team familiarity | Low |

**Pros:** potentially more durable across storage clears.
**Cons:** increasingly unreliable as privacy-conscious browsers spoof fingerprinting signals; legally fraught under GDPR/CCPA, which treat fingerprinting as tracking requiring consent; makes users who notice it uncomfortable; contradicts the privacy principles we chose in ADR-0001. Rejected on both effectiveness and ethical grounds.

### Option D: Optional passkey-based persistent identity

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | None (free cryptography) |
| Scalability | N/A |
| Team familiarity | Medium |

**Pros:** survives reinstalls via iCloud Keychain / Google Password Manager sync; cryptographically strong; no server required for auth; fits the accountless principle while giving users an opt-in path to durable identity.
**Cons:** adds a UI touch (passkey creation prompt); overkill for the ghost-participant problem it would solve at v1; WebAuthn implementation details vary by platform.

## Trade-off Analysis

Option A is the pragmatic minimum: no worse than B on any platform and slightly better on Android. We explicitly rejected C (fingerprinting) on ethical and legal grounds. D (passkeys) is a credible future upgrade but not worth the v1 complexity, because the actual user-visible pain of identifier loss is narrow (re-entering a nickname, possibly appearing as a ghost in a session). The "ghost" problem is better solved at the session-presence layer with heartbeat-based TTL rather than by strengthening identity.

## Consequences

**Easier:**
- One identifier API across platforms.
- No accounts, no auth, no passwords to reset.
- Host election (ADR-0010) has a stable lexicographically-sortable peer ID to work with.

**Harder:**
- iOS users who reinstall will appear as new participants in any persistent contexts (Teams, session snapshots).
- If the app becomes popular enough that "I reinstalled and lost my presence" becomes a real complaint, we'll need to add Option D as an opt-in feature.

**Revisit triggers:**
- Ghost participants becoming a frequent user complaint → strengthen session-presence TTL (separate work).
- Cross-device identity becoming a must-have (e.g. users wanting to appear as the "same person" when they rejoin from a different device) → add Option D as opt-in.

## Action Items

- [ ] Implement an `IdentityService` that returns the cached identifier, generating via `Device.getId()` on first access.
- [ ] Handle the "identifier missing from cache but plugin returns a known one" path explicitly (e.g. user reset Preferences but didn't reinstall).
- [ ] Decide separately on session-presence TTL values when we design the awareness protocol.
