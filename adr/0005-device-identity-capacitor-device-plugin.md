# ADR-0005: Device identity via the Capacitor Device plugin

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Need stable per-device ID for: nickname association, host-election peer ID (ADR-0010), recognizing returning participants across reconnects.
- Product is accountless → cannot depend on sign-in.
- Must work on PWA, iOS, Android.

## Decision

Use Capacitor `Device.getId()` on first launch; cache in Capacitor Preferences (or SQLite) to avoid repeated bridge calls. ID lives for install lifetime. If lost (storage cleared, reinstall), generate new — user appears as new participant silently, no UX surface.

## Options

- **A — Capacitor `Device.getId()` + Preferences cache (chosen):** Pros: leans on platform-native ID logic (Android `ANDROID_ID`, iOS `identifierForVendor`, generated UUID on web); consistent API; slightly more durable on Android than self-rolled UUID; no new deps (Capacitor core). Cons: iOS `identifierForVendor` resets on last-app-uninstall (single-app vendor → reinstall resets); web is just generated UUID anyway.
- **B — Self-generated UUID in localStorage/Preferences:** Pros: dead simple; one code path. Cons: no better than A on iOS/web; loses Android `ANDROID_ID` durability.
- **C — Browser fingerprinting (canvas/WebGL/fonts):** Pros: potentially more durable across storage clears. Cons: increasingly spoofed by privacy browsers; GDPR/CCPA treats as tracking → consent required; reputational damage; contradicts ADR-0001 privacy stance. Rejected on effectiveness + ethics.
- **D — Optional passkey-based persistent identity:** Pros: survives reinstall via iCloud Keychain / Google Password Manager; cryptographically strong; no server auth. Cons: adds passkey-creation UX; overkill for v1 ghost-participant pain; WebAuthn varies by platform.

## Trade-offs

- A is pragmatic minimum: no worse than B anywhere, slightly better on Android.
- Identifier loss pain is narrow (re-enter nickname, possible session ghost) — better solved at presence layer with heartbeat TTL.
- C rejected on ethical + legal grounds, not just effectiveness.

## Consequences

- Easier: one ID API across platforms; no auth/passwords; host election (ADR-0010) gets stable lex-sortable peer ID.
- Harder: iOS reinstall users appear as new participants in persistent contexts (Teams, snapshots).
- Revisit when: ghost participants become frequent complaint → strengthen presence TTL; cross-device "same person" becomes must-have → add D as opt-in.

## Action Items

- [ ] `IdentityService` returns cached ID, generates via `Device.getId()` on first access.
- [ ] Handle "ID missing from cache, plugin returns known one" path explicitly (Preferences reset without reinstall).
- [ ] Decide presence-TTL values when designing awareness protocol (separate work).
