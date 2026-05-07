# ADR-0005: Device identity via the Capacitor Device plugin

**Status:** Accepted
**Date:** 2026-04-21

## Context

- Need stable per-device ID for: nickname association, host-election peer ID (ADR-0010), recognizing returning participants across reconnects.
- Product is accountless → cannot depend on sign-in.
- Must work on PWA, iOS, Android.

## Decision

Use Capacitor `Device.getId()` on first launch; cache in Capacitor Preferences (or SQLite) to avoid repeated bridge calls. ID lives for install lifetime. If lost (storage cleared, reinstall), generate new — user appears as new participant silently, no UX surface. Leans on platform-native ID logic (Android `ANDROID_ID`, iOS `identifierForVendor`, generated UUID on web); slightly more durable on Android than self-rolled UUID; no new deps.

## Trade-offs

- iOS `identifierForVendor` resets on last-app-uninstall.
- Web is just generated UUID.
- Identifier loss pain narrow (re-enter nickname, possible session ghost) — better solved at presence layer with heartbeat TTL.
- Fingerprinting rejected on ethical + legal grounds (GDPR/CCPA tracking, contradicts ADR-0001 privacy stance).

## Consequences

- Easier: one ID API across platforms; no auth/passwords; host election (ADR-0010) gets stable lex-sortable peer ID.
- Harder: iOS reinstall users appear as new participants in persistent contexts (Teams, snapshots).
- Revisit when: ghost participants become frequent complaint → strengthen presence TTL; cross-device "same person" becomes must-have → add opt-in passkey-based identity.
