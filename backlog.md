# hnch Backlog

Findings from a codebase audit conducted 2026-04-28. Items are grouped by category and ordered by approximate priority within each group.

---

## Bugs

### B1 — PWA reload loses local doc state
**File:** `packages/client/src/app/core/doc/doc.service.ts`

`IndexeddbPersistence` is not awaited before the y-websocket provider connects. On a hard PWA reload mid-session the local Yjs snapshot is ignored, forcing the user to rejoin instead of rehydrating silently.

**AC:** `await provider.whenSynced()` before `connect()`; PWA reload mid-round restores doc state without a relay round-trip.

---

### B2 — Deep-link `/join?code=` requires manual tap
**File:** `packages/client/src/app/join/join.page.ts`

The join page reads the `code` query param but does not auto-submit. Users arriving via a share-sheet invite URL must manually tap the Join button.

**AC:** `/join?code=PUBLIC` navigates directly to Lobby; `/join?code=LOCKED` opens the password half-sheet without an extra tap.

---

### B3 — Focus not restored when half-sheet modals are dismissed
**Files:** all `presentSheet()` call sites (settings, scale picker, access picker, theme picker, display-name editor, round-start)

Dismissing any half-sheet drops keyboard focus to `<body>`, breaking screen-reader navigation and violating WCAG 2.1 §3.2.2.

**AC:** Every half-sheet dismissal restores focus to the element that triggered `presentSheet()`.

---

### B4 — Silent reconnect retries after relay disconnect
**File:** `packages/client/src/app/core/doc/sync-provider.ts`

After a relay drops the connection, the provider retries indefinitely with no user-visible feedback. Three consecutive unknown WS close codes within 60 s should produce an error toast.

**AC:** Three failed reconnect attempts within 60 s → error toast "Connection lost — retrying"; toast clears on successful reconnect.

---

### B5 — Close-code comment typo (4404 → 4001)
**File:** `packages/client/src/app/core/last-session.service.ts:22`

Comment references close code `4404`; the correct unknown-room close code is `4001` (ADR-0016).

**AC:** `grep -r '4404' packages/` returns no results (excluding any genuine HTTP 404 strings).

---

### B6 — Test-route bad-UUID response leaks gate status
**File:** `packages/relay/src/server.ts:357–375` (`handleTestDeleteRoom`)

A malformed UUID returns `400 { error: 'bad-uuid' }`, which differs from the gate-off `404 { error: 'not-found' }` response. This reveals that test routes exist in the binary even when disabled (violates ADR-0027 §5 "no tell").

**AC:** Malformed UUID → `404 { error: 'not-found' }`, byte-identical to unknown-UUID and gate-off responses.

---

## Technical debt / code quality

### T1 — CLI `dist/` directory committed to VCS
**File:** `packages/cli/dist/`

Compiled output is tracked by git. It should be `.gitignore`'d and regenerated at build time.

**AC:** `git ls-files packages/cli/dist` returns empty.

---

### T2 — Room code normalisation doesn't strip whitespace or dashes
**Files:** `packages/shared/src/room-code.ts:54`, `packages/cli/src/index.ts:114,130`

`normalizeRoomCode()` does not `trim()` or strip `-`. A user typing `  k7p-9mr  ` (copy-pasted from a share message with a dash separator) fails to join.

**AC:** `normalizeRoomCode('  k7p-9mr  ')` → `'K7P9MR'`; new unit tests cover leading/trailing spaces, embedded dashes, and mixed case.

---

### T3 — CLI session cache written with default umask (world-readable)
**File:** `packages/cli/src/` (last-session cache write path)

`~/.config/hnch/last-session.json` is created with whatever the user's umask is (typically `0644`). Session UUIDs are sensitive — they grant access to active rooms.

**AC:** File created with mode `0600`; parent directory with `0700`; enforced on POSIX; no-op on Windows (where mode bits are ignored).

---

### T4 — CLI does not observe `meta.sessionEndedAt`
**File:** `packages/cli/src/` (no `session-end-observer` equivalent)

The mobile client observes `meta.sessionEndedAt` and navigates away when the host ends the session. The CLI has no equivalent — the host can end the session while a CLI participant is connected and the CLI process never exits or notifies the user.

**AC:** CLI observes `meta.sessionEndedAt`; on first non-null value prints "Session ended by `<hostName>`", clears local cache, disconnects, and exits 0. Guard against firing on initial sync of an already-ended session.

---

### T5 — Relay boot log missing structured configuration line
**File:** `packages/relay/src/index.ts`

Operators cannot verify the effective `ROOM_CAP` or `TEST_ROUTES_ENABLED` values from logs without reading env directly.

**AC:** Single structured log line at startup: `hnch relay listening on :${port} (roomCap=${ROOM_CAP}, testRoutes=${TEST_ROUTES_ENABLED})`; logged at `warn` level when `testRoutes=true`.

---

### T6 — `JoinRejectionReason` missing ADR-0024 citation
**File:** `packages/shared/src/auth.ts:60–67`

The `room-full` variant in `JoinRejectionReason` has no JSDoc noting that this is enforced at WS upgrade per ADR-0024, making the non-obvious two-phase enforcement invisible to future readers.

**AC:** One-line JSDoc on the `room-full` branch citing ADR-0024.

---

## Documentation drift

### D1 — `project.md` preset list outdated
**File:** `project.md:28–32`

Lists "Modified Fibonacci" instead of the five ADR-0019 official presets: Fibonacci, T-shirt, Powers-of-2, Linear, Risk.

---

### D2 — `project.md` timer description contradicts ADR-0018
**File:** `project.md:72`

Describes "countdown or auto-reveal-on-expiry" — both removed by ADR-0018. The correct description is stopwatch (elapsed time only) with manual reveal and unanimous auto-reveal.

---

### D3 — `project.md` references removed invite-only mode
**File:** `project.md:115`

References "Invite-only" access mode, which was dropped from v1 scope in ADR-0017.

---

### D4 — `ux.md` Estimating wireframe shows removed sentinel cards
**File:** `ux.md:~527,~530`

Wireframe still shows `?` and `☕` sentinel cards, which were removed in ADR-0019.

---

### D5 — `ux.md` scale-picker wireframe lists removed preset
**File:** `ux.md:630–635`

Lists "Modified Fibonacci" instead of the five ADR-0019 presets.

---

### D6 — `ux.md` access-picker wireframe shows removed "Invite only" row
**File:** `ux.md:~649`

"Invite only" row was removed in ADR-0017 and should be struck from the wireframe.

---

### D7 — `ux.md` missing voter/viewer role documentation (ADR-0020)
**File:** `ux.md §5.5, §5.7`

ADR-0020 introduced a voter/viewer role toggle on the Estimating screen, but `ux.md` has no wireframe or interaction spec for the role chip, the observer empty state, or the exclusion from the unanimous-reveal denominator.

---

### D8 — `ux.md` marks consensus overlay as "open question" but it is implemented
**File:** `ux.md §8`

`ux.md` lists "All votes match → celebratory state?" as an open UX question. The feature is fully implemented in `vote-results.component.ts` (scale-in animation, pulse, `prefers-reduced-motion` guard). The spec should be updated to record the decision.

---

## UX gaps

### U1 — Stale Jump-back-in banner not visually muted
**Spec:** `ux.md §5.2`

When the relay evicts a room (24-hour TTL), the Jump-back-in banner on Home should render muted (reduced opacity, no chevron) to signal the session is gone. Currently the banner looks identical whether the session is live or expired.

**AC:** Expired sessions render at `opacity: 0.6` with no chevron; tapping shows a toast "Session no longer available" and clears the banner.

---

### U2 — Toast calls inconsistent across codebase
**Spec:** `ux.md §6`

Direct `ToastController.create()` calls are scattered with ad-hoc durations, positions, and icon configurations. A thin `ToastService` wrapper (`info(message)` / `error(message, opts)`) would enforce the spec-defined defaults (top position, 3 s / 5 s durations, optional close button for errors) and simplify future changes.

---

### U3 — No "Reconnecting…" banner
**Spec:** `ux.md §8` (noted as deferred)

There is no user-visible indicator when the WS connection is lost and the provider is retrying. The silent-retry bug (B4) fix should be paired with a persistent "Reconnecting…" banner that clears on reconnect, giving users confidence the app is not frozen.

---

## Test coverage gaps

### TC1 — No ESLint configuration outside `packages/client`
`packages/relay`, `packages/shared`, `packages/cli`, and `packages/e2e` have no ESLint config. Lint errors in these packages are invisible in CI.

**AC:** ESLint 9 flat config applied to all five packages; `pnpm lint` passes from the repo root.

---

### TC2 — No code coverage reporting in any package
`vitest` is run without `--coverage` in all packages. There are no coverage thresholds and no reports uploaded to CI.

**AC:** `@vitest/coverage-v8` wired up; per-package thresholds set; CI uploads LCOV to a coverage artifact.

---

### TC3 — Malformed-credentials close code (4010) not tested e2e
**Spec:** ADR-0016

No e2e test asserts that a client presenting a malformed `JoinCredentials` payload receives close code `4010` and sees the correct error copy.

---

### TC4 — Zero-voter unanimous-reveal guard not tested
**Spec:** ADR-0018

If all participants are viewers, auto-reveal must never fire. No test covers this edge case.

---

### TC5 — Viewer ↔ voter toggle affects reveal eligibility — not tested
**Spec:** ADR-0020

Switching a participant from voter to viewer mid-vote should remove them from the unanimous-reveal denominator. No test verifies the role-switch path.

---

### TC6 — Expired-room Jump-back-in flow not tested e2e
**Spec:** `ux.md §5.2`, gap U1

No e2e test covers the flow: relay evicts room → user opens app → banner shown muted → tapping shows "Session no longer available" toast → banner cleared.

---

## Phase 6b (native iOS) readiness

The roadmap names Phase 6b as "native iOS build". The following items are prerequisites or closely related:

- Capacitor iOS target not yet initialised (`npx cap add ios` not run — `ios/` directory absent).
- `AppPreferenceService` relay-URL override exists in the client but has no UI surface; a developer settings screen or build-time injection may be needed for TestFlight builds pointing at staging.
- Deep-link auto-submit (B2) is a prerequisite for universal-link / associated-domains join flow on iOS.
- PWA doc-state reload fix (B1) also prevents data loss after iOS WKWebView process kills.
