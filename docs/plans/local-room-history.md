# Local room history on Home

**Status:** Draft
**Date:** 2026-05-18
**Source spec:** [docs/specs/local-room-history.md](../specs/local-room-history.md) — issue [#224](https://github.com/xauyxau/hnch/issues/224)
**Shape:** Single PR

## Summary

Replace the single-entry "Jump back in" cache (ADR-0022) with a 5-entry local room history rendered on Home. Mobile, CLI, and the shared cache type all change in one coordinated PR alongside a new ADR that supersedes ADR-0022 and explicitly justifies storing `passwordHash` per entry on mobile (today's ADR rejects it).

## Approach

- **Shared (`packages/shared/src/last-session.ts`):** swap the single-object shape for `LastSessionCacheV2 = { version: 2; entries: Record<string, LastSessionEntry> }` keyed by `roomUuid`. `LastSessionEntry` mirrors the current `LastSessionCache` (`roomCode`, `roomUuid`, `lastSeenAt`) plus optional `passwordHash`. Mobile-specific `lastScreen` and CLI-specific fields layer in each consumer's own extension type, same pattern as today. Export a pure `migrateLastSessionCache(unknown): LastSessionCacheV2` that accepts the legacy single-object shape, the v2 shape, or junk.
- **Client (`packages/client/src/app/core/last-session.service.ts`):** rewrite the service to read/write the v2 map via Capacitor Preferences under the same key `hnch.lastSession`. Sort by `lastSeenAt` desc at read. Methods: `list()`, `recordJoin(entry)`, `removeByUuid(uuid)`, `clearAll()`. Read prunes any entry past 24 h. Write caps the map at 5 by dropping the oldest. Same-uuid re-record updates in place and refreshes `lastSeenAt` + `passwordHash`.
- **Client (`packages/client/src/app/home/`):** progressive rendering — `list().length <= 1` reuses the existing `JumpBackInBanner` (visually unchanged); `>= 2` renders a new `RecentRoomsListComponent` (compact list, room name + formatted code + relative-time label). Mobile: `IonItemSliding` with a Remove option. Portal: `:hover, :focus-within { .remove-button { opacity: 1 } }` so the × is reachable via tab as well as hover. Tapping a row reconnects to the cached `lastScreen`. Successful join refreshes the entry; relay `close(4001 unknown-room)` removes the offending entry; relay `close(4002 wrong-password)` clears only the `passwordHash` field on that entry (preserves `roomCode`/`roomUuid`/`lastScreen`/`lastSeenAt`) and routes to `/join?code=…` matching the existing `password-required` flow; a pre-handshake network failure leaves the entry intact and toasts.

- **Client consumer enumeration (every site that reads/writes the cache today must move to v2):**
  - `packages/client/src/app/home/home.page.ts` — banner/list selection, currently three `LastSessionService` callsites; switch to `list()` and render either `JumpBackInBanner` (≤1) or `RecentRoomsListComponent` (≥2).
  - `packages/client/src/app/home/jump-back-in-banner.component.ts` — input changes from single `LastSessionCache` to one `LastSessionEntry`; relative-time helper added.
  - `packages/client/src/app/core/session-resume.guard.ts` — **new behavior:** if the resolved entry has a `passwordHash`, the guard now passes it directly to the relay handshake instead of redirecting `password-required` to `/join?code=…`. Only on relay `4002 wrong-password` does it fall back to `/join?code=…` (and clear the entry's hash field per the failure-diff rule above).
  - `packages/client/src/app/core/room-join.service.ts` — when a join succeeds with a password, call `recordJoin({ …, passwordHash })` so the cache stores the hash that the relay just accepted.
  - `packages/client/src/app/core/session-end.service.ts` — voluntary "Leave session" calls `removeByUuid(uuid)`, not `clearAll()`.
  - `packages/client/src/app/lobby/lobby.page.ts` and `…/estimating/estimating.page.ts` — `recordJoin` callsite updates (already named in build order).
  - `packages/e2e/tests/expired-jump-back-in.spec.ts` — assertions move from single-entry shape to v2; new specs added per the e2e scope decision.
- **CLI (`packages/cli/src/last-session.ts` + `resume` command):** swap reader/writer to v2 map, preserving the existing `0600`/`0700` file/dir modes. `hnch resume` with `entries.size > 1` prints a numbered list (most-recent first, room code + relative time) and reads stdin for a 1-based index. Single-entry resume behavior unchanged.
- **ADR:** new ADR drafted before code; supersedes ADR-0022. Documents the v2 shape, the migration path, the new mobile `passwordHash` storage decision with an honest threat model, and the dedup-on-rejoin rule. The ADR must enumerate three realistic exposure paths for `passwordHash` on mobile and explicitly accept all three: (a) iTunes/Finder/iCloud unencrypted backup of `NSUserDefaults` plist; (b) `adb backup` / Android auto-backup of `SharedPreferences`; (c) jailbreak/root file-level read. Acceptance rationale: hash protects against snapshot-TTL replay only (24 h); password rotation is the persistent-removal lever; one-tap rejoin UX outweighs the residual leak risk at this app's threat model.

## ADR impact

- **ADR-0022** — superseded by new ADR. Must be linked from the new ADR's "Supersedes" field and the existing ADR-0022 status changed to `Superseded by ADR-XXXX` (the only edit allowed to an accepted ADR per CLAUDE.md).
- **ADR-0004** — conforms; persistence path stays Preferences on PWA / Capacitor Preferences on native. No SQLite move.
- **ADR-0009 / ADR-0017** — referenced from the new ADR for the password-hash trust-boundary justification; no change.
- **ADR-0012** — conforms; 24 h TTL invariant preserved and the new ADR re-asserts it.
- **ADR-0021** — conforms; CLI extension shape (`passwordHash`) preserved, now per-entry instead of top-level.
- **ADR-0028** — conforms; no telemetry added.

## Decisions resolved

1. **Mobile passwordHash storage.** Options: Capacitor Preferences (plaintext at rest) / SecureStorage-Keychain / drop the hash. **Chosen:** Capacitor Preferences, stored for **all** entries (not just most-recent). **Why:** keeps one persistence path; SecureStorage would split the path and introduce a new dep for marginal upgrade. The new ADR does **not** claim equivalence with the CLI `0600` file — it explicitly accepts the wider mobile threat boundary (iOS/Android unencrypted backup paths, jailbreak/root file read) on the grounds that the cached hash only grants snapshot-TTL replay (24 h), password rotation revokes it, and one-tap rejoin on five rooms is the whole point of the feature.
2. **Cache shape v2.** Options: ordered array / keyed map by uuid. **Chosen:** `Record<roomUuid, LastSessionEntry>` sorted by `lastSeenAt` desc at read. **Why:** dedup on rejoin is a single map-set; UI render is one sort; matches how rejoin already keys by uuid.
3. **PR shape.** Options: single PR / 3-phase / 2-phase. **Chosen:** single PR. **Why:** the shape change must roll out atomically across shared + both consumers; deferred ADR makes coding ambiguous.
4. **Re-joining a room already in the list.** **Chosen:** update entry in place, refresh `lastSeenAt` and `passwordHash`. **Why:** preserves the same map key; no duplicate; recency floats it to top via the sort.
5. **Portal manual-remove a11y.** **Chosen:** × visible on `:hover` AND `:focus-within`. **Why:** mouse and keyboard parity per `docs/angular.md` baseline; matches existing patterns.
6. **Failure differentiation on tap.** **Chosen:** `4001 unknown-room` → remove the offending entry; `4002 wrong-password` → clear only the entry's `passwordHash` field (keep `roomCode`/`roomUuid`/`lastScreen`/`lastSeenAt`) and route to `/join?code=…`; pre-handshake network errors keep the entry and surface a network toast. **Why:** matches the spec's promise that the list reflects relay state, not transient client state; password rotation shouldn't punish a user who still legitimately accesses the room.
7. **Screenshots.** **Chosen:** required, full set.
8. **e2e additions.** **Chosen:** two-room sequence, 6th-room eviction, relay-reject vs network-fail differentiation. Migration covered by shared unit tests (cheaper, deterministic).
9. **lastScreen on re-record.** **Chosen:** new value overwrites prior `lastScreen`; explicit AC + unit test for the Lobby→Estimating transition firing `recordJoin` twice in seconds.
10. **Clock skew handling.** **Chosen:** clamp future-dated `lastSeenAt` to `now` on read so a forward-jumping write (e.g. manual clock adjustment) cannot permanently pin an entry to the top of the list.
11. **All-five-expired edge.** **Chosen:** when `list()` finds every entry past TTL, clear the Preferences key entirely (not just return `[]`) so the next write starts from a clean map and no dead bytes are re-pruned on each read.
12. **Two-tab concurrent write.** **Chosen:** acknowledged as a known limitation; no mitigation. Last-write-wins on Capacitor Preferences can clobber an entry if the user joins two rooms in two tabs simultaneously. The cost of `BroadcastChannel` mutex or per-uuid keys outweighs the rarity of the case.

## Critique rejected

- **C7 (migration loses `lastScreen` because shared shim doesn't type it).** Rejected: acceptable to lose `lastScreen` on the one-time v1→v2 upgrade; user lands on Lobby (the safe default for any in-session route) instead of Estimating; cost of structural-permissive shim + extension test outweighs the harm.
- **C10 (two separate caches: keep `hnch.lastSession`, add `hnch.recentRooms`).** Rejected: one source of truth wins; the migration shim is small and self-contained; two caches risk drift between "most-recent" and "list head."
- **C12 (split into 2 PRs along non-breaking seam).** Rejected: single PR remains the chosen shape (see Decision §3); atomic shape change across shared + both consumers is the simpler review even if larger.

## Phases

Single PR — no phase split.

### Build order inside the PR

0. **Blocking pre-ADR verification.** Confirm against current `@capacitor/preferences` docs that the PWA backend writes to localStorage (or IndexedDB — note which), iOS backend writes `NSUserDefaults` plist (plaintext at rest, included in iTunes/iCloud backup unless app opts out), and Android backend writes `SharedPreferences` XML (plaintext at rest, included in `adb backup` / auto-backup unless `android:allowBackup="false"`). Cite the finding in the new ADR before step 1 begins. ADR cannot be drafted without this.
1. **ADR draft** (delegated to `adr-writer` agent). Supersedes ADR-0022. Incorporates the step-0 verification verbatim. Reviewer can read this first to anchor the design.
2. **`packages/shared`** — `LastSessionEntry`, `LastSessionCacheV2`, `migrateLastSessionCache()` + unit tests covering: v1 → v2 migration, v2 round-trip, junk → empty v2, version-field gating.
3. **`packages/client`** — `LastSessionService` rewrite + tests; `RecentRoomsListComponent` new; `JumpBackInBanner` retained for the single-entry case; Home page glue to switch between the two; Estimating + Lobby `recordJoin` callsites updated; relative-time helper (shared util or inline `Intl.RelativeTimeFormat`).
4. **`packages/cli`** — `last-session.ts` rewrite + tests; `resume` command numbered-list prompt; integration test for v1 → v2 file migration on read.
5. **`packages/e2e`** — three new specs per the e2e scope decision.
6. **Manual smoke + screenshots** (see Screenshots section).

**PR title scope:** `feat(client,cli,shared,e2e)!: extend last-session cache to a 5-entry local room history` — breaking change because v1 single-entry consumers outside the migration are no longer valid (the migration shim hides it for legitimate callers but the exported type changes). `e2e` included because three new specs are added (CLAUDE.md scope-coverage rule). Reviewer must confirm `!` vs non-breaking; the migration shim arguably keeps it non-breaking from a consumer-API perspective. Decide at PR-open time.

**Worktree:** `git fetch origin && pnpm worktree:add local-room-history main` before opening.

## Open questions

- Relative-time formatter: use `Intl.RelativeTimeFormat` directly (good enough, locale-aware) vs a small in-repo helper for consistency with any other relative-time UI. Resolve at coding time — quick grep for prior usage.
- `!` (breaking) vs non-breaking on the PR title — the migration shim arguably makes this non-breaking from a consumer perspective. Decide at PR-open time after eyeballing the actual public-type diff in `packages/shared`.

## Verification plan

- `pnpm --filter @hnch/shared test` — migration + cache-shape unit tests pass.
- `pnpm --filter @xauyxau/hnch test` — CLI last-session + resume tests pass.
- `pnpm --filter @hnch/client test` — service + component tests pass.
- `pnpm --filter @hnch/client lint && pnpm --filter @hnch/client typecheck && pnpm --filter @hnch/client build`.
- `pnpm --filter @hnch/relay typecheck` — sanity (no relay change expected).
- `pnpm --filter @hnch/e2e test` — three new specs (two-room sequence, 6th-room eviction, relay-reject vs network-fail).
- Unit tests must cover: lastScreen overwrite on re-record (decision §9), future-dated `lastSeenAt` clamped to `now` on read (decision §10), all-five-expired → Preferences key fully cleared (decision §11), `4002 wrong-password` clears only the entry's `passwordHash` field (decision §6).
- Manual smoke (per Screenshots): join three different rooms; verify list renders 2 then 3 entries; remove one via swipe (mobile) and × (portal); confirm 6th-room eviction; rotate a room password and confirm a stale-hash tap clears that entry's hash and routes to /join (not the whole entry removed); airplane-mode tap keeps entry.

## Screenshots

**Required:** Yes

- Screens:
  - Home — 0 entries (empty state unchanged)
  - Home — 1 entry (existing banner unchanged)
  - Home — 2 entries (new compact list)
  - Home — 5 entries (cap state)
  - Home — swipe-open Remove gesture (mobile)
  - Home — hover-× and focus-within-× (portal)
- Variants: light + dark, mobile + portal (Ionic platform mode per `docs/ionic.md`)
- Path: `docs/screenshots/local-room-history/`
- Delivery: PR comment with branch-file links of the form `https://github.com/xauyxau/hnch/blob/<branch>/docs/screenshots/local-room-history/<file>.png` — NOT raw URLs, pasted attachments, or markdown tables (all three fail on the GH mobile app per CLAUDE.md).
- Merge handling: drop the screenshot commit via interactive rebase before merge (not part of the shipped artifact).

## References

- Spec: [docs/specs/local-room-history.md](../specs/local-room-history.md)
- Issue: https://github.com/xauyxau/hnch/issues/224
- ADR-0022 — Last-session cache (to be superseded)
- ADR-0012 — Relay snapshot TTL (24 h)
- ADR-0004 — Local persistence split
- ADR-0009 — Relay-enforced access via opaque tokens
- ADR-0017 — PBKDF2 password hashing
- ADR-0021 — CLI deliverable
- ADR-0028 — No telemetry
- `docs/angular.md` — a11y baseline (focus-visible, keyboard parity)
- `docs/ionic.md` — IonItemSliding pattern + platform mode
