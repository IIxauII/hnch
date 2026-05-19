# ADR-0044: Local room history cache — per-room entries, mobile passwordHash reversal

**Status:** Accepted
**Date:** 2026-05-18

## Context

- ADR-0022 established last-session cache with TTL = 24 h (matching ADR-0012 snapshot TTL) to enable "jump back in" on mobile and `hnch resume` on CLI.
- ADR-0022 §3 explicitly forbade `passwordHash` on mobile: "no UX benefit + threat surface".
- Experience shows password re-prompt on mobile breaks password-protected room re-entry flow; CLI can rejoin unattended only if hash cached.
- Single-entry pointer no longer covers "I have multiple recent rooms I might jump back to" — users re-join same room code only 67% of the time (incomplete data from Phase 6b beta).
- ADR-0022 cache lives in `packages/shared/src/last-session.ts`; coupling to ADR-0012 visible but no per-room support.

## Decision

Replace single-entry cache with **versioned multi-entry record keyed by `roomUuid`**. All clients now cache `passwordHash` on successful join (reversing ADR-0022 §3). Shape v2 in `packages/shared/src/last-session.ts`:

```
{
  version: 2
  entries: Record<roomUuid, {
    roomCode: string
    roomUuid: string
    lastSeenAt: number (ms since epoch)
    passwordHash?: string (PBKDF2-hex, ADR-0017)
  }>
}
```

Mobile extends per-entry with `lastScreen: 'lobby' | 'estimating'` (route restoration on rejoin). CLI extends entry-level (same shape, no mobile-specific field). **Cap 5 entries; oldest by `lastSeenAt` evicted on overflow.** On re-record (same `roomUuid`), update in place (touch `lastSeenAt`, replace `passwordHash` if provided). **Sort by `lastSeenAt` descending at read** for UI display. TTL **remains 24 h** — same ADR-0012 snapshot boundary; invariant preserved. Eviction: lazy at read (entry with `lastSeenAt + 24h < now` removed); eager on relay close `4001 unknown-room` (clear entry); `4002 wrong-password` (clear **only** `passwordHash` field, retain room code/uuid/lastScreen/lastSeenAt, navigate to `/join?code=…`).

**Mobile caches `passwordHash`.** Threat model:
- **iOS:** `NSUserDefaults` plist plaintext in app sandbox. Included in iTunes/Finder local backup (unencrypted unless user device password set) and iCloud backup (encrypted by Apple in transit and at rest; no per-app opt-out).
- **Android:** `SharedPreferences` XML plaintext in app data dir (`/data/data/…/shared_prefs/`). Included in `adb backup` (requires USB debugging enabled) and Google Auto Backup (default `android:allowBackup="true"`).
- **PWA:** `localStorage` plaintext per-origin, no automatic backup integration.

Acceptance rationale: cached hash grants **snapshot-TTL-bounded replay only** (24 h, ADR-0012); password rotation is persistent revocation lever (ADR-0017); one-tap rejoin across 5 rooms is the feature's whole point; ADR-0028 forbids telemetry so cannot track misuse; threat boundary intentionally widened from ADR-0022 baseline. References: https://capacitorjs.com/docs/apis/preferences, https://developer.apple.com/documentation/foundation/userdefaults, https://developer.android.com/guide/topics/data/backup.

**Storage paths preserved:**
- Mobile: Capacitor Preferences key `hnch.lastSession` (v1 single object → v2 object at same key).
- CLI: `~/.config/hnch/last-session.json`, mode `0600`.

**Migration v1 → v2:**
- Single-entry object `{ roomCode, roomUuid, lastSeenAt, lastScreen? }` becomes sole entry in `entries` map keyed by its `roomUuid`.
- Mobile v1 has no `passwordHash` field; v2 entry migrated has none (user prompted on first password-protected rejoin).
- CLI v1's top-level `passwordHash` (if present) moves onto the entry.
- Mobile `lastScreen` may be lost if migration occurs via shared-side logic (acceptable; user lands on Lobby).

## Trade-offs

- Two-tab PWA write race (last-write-wins clobber of `entries` object) — acknowledged, no mitigation in v2.
- Clock skew: future-dated `lastSeenAt` values clamped to `now` on read to prevent permanent entry pinning.
- All-five-expired condition: read clears Preferences key entirely (no empty object persisted).
- Mobile now holds plaintext `passwordHash` per threat model above — trades UX fluidity (one-tap rejoin) against device-level access boundary.

## Consequences

- Easier: one-tap rejoin for 5 recent rooms; unified per-room shape simplifies mobile/CLI parity; TTL coupling to ADR-0012 remains visible; successful rejoin rate improves for password-protected rooms.
- Harder: mobile now stores hashes (threat surface widened from ADR-0022); migrating v1 → v2 must handle missing `passwordHash` gracefully; cap at 5 requires LRU eviction logic.
- Revisit when: ADR-0012 changes snapshot TTL or adds per-room snapshots (update/supersede same PR); per-room sync architecture changes (ADR-0001 refactor) → multi-entry shape moot; SecureStorage migration for iOS (ADR-0004 successor) → reevaluate threat model; users ask for >5 room slots or permanent storage → supersede with bigger cap or disk persistence.
