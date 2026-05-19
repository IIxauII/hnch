# Local room history on Home

**Status:** Draft
**Date:** 2026-05-18
**Source:** https://github.com/xauyxau/hnch/issues/224

## Problem

> "Power users — scrum masters, tech leads, developers — often facilitate or participate in multiple estimation sessions per sprint week."

Today the Home screen's "Jump back in" banner shows only the single most-recently-visited room (ADR-0022). A user who joins Room A (Monday backlog) and then Room B (Tuesday refinement) loses one-tap access to Room A even while the relay still holds its 24-hour snapshot — they must remember or retype the old room code.

## Users

- **Host and voter on mobile/PWA** — primary beneficiary, running back-to-back sessions within a sprint week.
- **CLI user** — `hnch resume` today picks the single cached room; extends to choosing among recent rooms.
- Viewers benefit incidentally; no role-specific behavior.

## Proposed behavior

Home screen shows up to 5 recently-visited rooms within the relay's 24-hour snapshot window. Each row shows room name, formatted code (`K7P-9MR`), and relative time ("2h ago"). Tapping reconnects and navigates to the cached screen (Lobby or Estimating).

- **1 entry:** rendered as the existing "Jump back in" banner, visually unchanged.
- **2–5 entries:** rendered as a compact "Recent rooms" list, most-recent first.
- **6th room joined:** prepends to the front; oldest entry evicted.
- **TTL:** entries with `lastSeenAt` older than 24h are pruned silently on app launch (aligned to ADR-0012).
- **Manual remove:** swipe-to-remove on mobile (IonItemSliding); hover-reveal × button on portal.
- **Voluntary "Leave session":** removes that room's entry (existing behavior preserved).
- **Relay rejects entry on tap** (unknown / expired room): entry is removed, existing "room expired" toast appears.
- **Network failure on tap** (relay unreachable, not a rejection): entry is **kept**; user sees a network toast and can retry.
- **Password-protected rooms:** `passwordHash` is stored per-entry on mobile (new — today only CLI does this); tapping reconnects directly without re-prompting. Re-prompt only occurs if the relay rejects the hash (e.g. password rotated).
- **CLI:** `hnch resume` with multiple cached entries presents a numbered list; user picks by number. Single-entry behavior unchanged.
- **Migration:** existing v1 (single-entry) cache becomes the sole entry in the new `entries[]` array on first load under the new code. No crash, no data loss.

## Success criteria

- After joining two different rooms in sequence, both appear as separate entries on the Home screen, most-recent first.
- With one cached room, the Home screen is visually identical to today's "Jump back in" banner.
- Entries older than 24 h are not shown on next app launch.
- Tapping a recent entry reconnects and routes to Lobby or Estimating per the cached `lastScreen`.
- Tapping a password-protected entry reconnects without re-prompting unless the relay rejects the stored hash.
- A relay rejection (expired/unknown) removes only that entry; other entries are untouched.
- A network failure on tap leaves the entry in place; a retry succeeds once the network recovers.
- Swiping (mobile) or clicking the hover × (portal) removes a single entry without affecting others.
- Voluntary "Leave session" removes that session's entry.
- Joining a 6th room evicts the oldest; the list never exceeds 5.
- CLI `hnch resume` with N>1 cached rooms accepts a numbered selection and rejoins the chosen room.
- Upgrading from the v1 single-entry cache surfaces that room as the sole entry in the new list.

## Scope

**In:**

- New ADR superseding ADR-0022's single-entry cache shape.
- Cache shape change to `{ version: 2, entries: LastSessionEntry[] }` with per-entry `lastSeenAt`.
- Per-entry `passwordHash` on mobile (alignment with CLI; new for mobile).
- Home screen progressive rendering (1 entry = banner, 2–5 = list).
- Manual remove gesture/affordance (swipe mobile / hover-× portal).
- TTL pruning on app launch.
- Relay-rejection vs network-failure differentiation on tap.
- Migration from v1 cache shape.
- CLI numbered-list `hnch resume` flow.

**Out (explicit anti-goals):**

- Syncing recent rooms across devices.
- Showing rooms older than 24 h.
- Starred / pinned rooms.
- Team-level session history (ADR-0007 scope).
- More than 5 entries.
- Yjs doc changes; relay changes; network impact of any kind.

## Open questions

- Mobile `passwordHash` storage location: Capacitor Preferences (today's last-session location) vs SQLite (other persistence). Pick during `/plan` against ADR-0004's persistence-path split. Note: storing the hash on-device widens the local secrets surface — the new ADR must justify this against ADR-0009 / ADR-0017 (password handling).
- Visual treatment of the 2–5 entry list (item height, dividers, empty-state transition from 0→1→2) — settle during `/plan` with reference to `docs/ux.md`.
- Portal × button focus / keyboard a11y (must satisfy ADR-0020/`docs/angular.md` a11y baseline) — define during `/plan`.

## ADR impact

A new ADR is required before coding. It supersedes the single-entry cache shape from **ADR-0022** and must address:

- New `entries[]` shape (max 5) and per-entry `lastSeenAt`.
- Per-entry `passwordHash` on mobile (new) — justification against **ADR-0009** (relay-enforced password access) and **ADR-0017** (PBKDF2 password hashing).
- Migration from v1 single-entry shape.
- CLI multi-entry `hnch resume` selection.
- TTL alignment with **ADR-0012** (24 h relay snapshot TTL).
- Persistence path per **ADR-0004** (Preferences on PWA, SQLite on native).

No other ADRs touched. No telemetry implications (ADR-0028).

## References

- Issue: https://github.com/xauyxau/hnch/issues/224
- ADR-0022 — Last-session cache (single-entry, to be superseded)
- ADR-0012 — Relay snapshot TTL (24 h)
- ADR-0004 — Local persistence split (Preferences / SQLite)
- ADR-0009 — Relay-enforced access via opaque tokens
- ADR-0017 — PBKDF2 password hashing
- ADR-0007 — Teams (long-term crew continuity; out of scope here)
