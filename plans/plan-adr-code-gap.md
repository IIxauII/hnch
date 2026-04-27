# Plan: ADR ↔ code gap closure (T21–T31)

**Estimate:** ~10 story points (13 tasks across 6 stories) — revised from ~9 SP after plan-critic findings.

## Revision history

- **v2 (this revision):** plan-critic returned 35 findings; BLOCKER + SHOULD-FIX folded in. Structural changes:
  - Story 4 made strictly sequential to avoid `packages/cli/src/index.ts` import-merge race (F17).
  - T8 (chmod) split into explicit two-step write+chmod with `mode: 0o600` option AND post-hoc `chmodSync` for upgrade-from-existing-permissive case (F8). Tier upgraded haiku→sonnet (F25).
  - T6 (boot log) tier downgraded sonnet→haiku per F24 (mechanical).
  - T9 (T22b) extracts shared `onSessionExpired` helper (F33).
  - T10 (T25 observer) initial-state guard fixed; teardown via `setImmediate` (F11, F12).
  - New T13 added: regression-grep for `4404` across repo (F1).
  - T7 spec enumerates test cases inline (F27).
  - T31 (T6) gets unit test for log shape (F23) and JSDoc on exported consts (F34).
  - T5 updates existing `server.test-routes.test.ts:51-54` assertion (F19).
  - All affected ACs tightened.

## Context

A recent ADR audit made the proposed ADRs prescriptive ("MUST do X") and tracked code-side gaps as Action Items (T21–T31). ADRs 0022 (last-session cache), 0023 (session-end broadcast), 0024 (participant cap), 0027 (test-only relay surfaces) now state contracts the code does not yet meet. This plan closes those gaps so ADR contracts and shipped code agree.

No new ADRs. No structural redesign. Each task is a small surgical alignment of code to an already-prescriptive ADR clause.

## User journey

End users see no flow changes. The audit-driven changes are:

1. CLI user runs `hnch resume` after `unknown-room` → cache clears, "session expired" surfaced (parity with mobile and ADR-0022 §4).
2. CLI user types code with whitespace or dashes (`  k7p-9mr `) → resolves correctly via shared `normalizeRoomCode`.
3. CLI user's `~/.config/hnch/last-session.json` is created with mode `0600` and parent dir `0700` (ADR-0022 §3).
4. CLI user in a host-ended session is told "session ended by ${host}", cache cleared, exits cleanly (ADR-0023 §2).
5. CLI user *rejoining* a session that has already been ended (snapshot still in TTL, `meta.sessionEndedAt` already present) is greeted by the same observer firing on the initial sync — same exit, same cache clear (F11).
6. Relay operator sees a single structured boot log line stating effective `ROOM_CAP` and `TEST_ROUTES_ENABLED` — WARN level when in non-production state (ADR-0027 §6).
7. Test/probe of `DELETE /test/rooms/<bad-uuid>` returns `404 not-found` byte-identical to gate-off (no longer leaks gate via `400`).
8. ADR-0020 mis-citations corrected to ADR-0024 in code comments — no behavior change, but auditors stop being misled.

Edge / error states explicitly handled:
- CLI close code `4001` triggers `clearLastSession()` *before* user-visible message and *before* exit (F10 ordering).
- CLI normalize: trim → strip dashes → uppercase. Empty-after-normalize is rejected with `'invalid room code'` before `resolveRoom` is called (F32).
- DELETE test route bad-UUID: byte-identical to gate-off `404 not-found` — same status, same body, same headers — both branches go through the same `sendJson()` path (F14).
- Mode `0600` on Windows: `fs.chmod` is effectively a no-op; acceptable per ADR-0022 spec, which is POSIX-scoped (F28).
- TOCTOU on file mode (F8): `writeFileSync(path, data, { mode: 0o600 })` *plus* explicit `chmodSync(path, 0o600)` after — the second call is the upgrade path for an existing file written under a previous version with default mode `0644`. POSIX `open(2)` honors `mode` only for *new* files; overwriting an existing file leaves its mode untouched without an explicit chmod.
- Cache-clear failures (F7, F13): `lastSession.clear()` is `await`ed and wrapped in try/catch — Preferences plugin error logs WARN but does not block session-end teardown.

## Decisions

All low-risk, ADR-prescribed. No genuine tradeoffs surfaced for user.

**D1: `normalizeRoomCode` semantics — add trim?**
A) Add `.trim()` before strip-dash + uppercase ← recommended
B) Leave trim to caller (current state — `parseInviteContent` does it itself)

A wins: ADR-0008 §Decision treats trim as canonical normalization. CLI being a new consumer surfaces the gap. Co-located trim is one place to think about whitespace; callers don't need to remember. `parseInviteContent` already trims first then calls — adding trim inside `normalizeRoomCode` is idempotent on already-trimmed input.

**D2: T22 — handle `unknown-room` at `index.ts` callsite or `sync.ts` callback layer?**
A) Add to `index.ts` `onRejection` handler (matches ADR-0022:145 wording, parallel to existing `wrong-password`/`room-full` handling) ← recommended
B) Move all rejection→cache-clear logic into `sync.ts`

A wins: ADR-0022 explicitly cites `packages/cli/src/index.ts:236`. The `onRejection` callback already exists and handles two reasons; adding the third matches the established pattern. B would be a refactor disguised as a fix.

**D3: T30 — return `404 not-found` for malformed UUID, or `404 bad-uuid`?**
A) Return `404` with body `{ error: 'not-found' }` byte-identical to gate-off and unknown-uuid ← recommended
B) Return `404` with body `{ error: 'bad-uuid' }`

A wins: ADR-0027 §5 explicit — "byte-identical to the gate-off response... no tell that the gate exists." A: same status + same body shape closes the oracle. The bad-UUID branch becomes `sendJson(res, 404, { error: 'not-found' })`.

**D3.1 (F5): Asymmetry with the 400-on-malformed used elsewhere is intentional.** The WS-upgrade handler still returns `400 malformed-credentials` on malformed input because it has no secrecy contract — clients are expected to learn from validation errors. The test-route gate, by contrast, has an explicit ADR-0027 §5 "no tell that the gate exists" contract: any divergence from the 404 fall-through *is* the leak. Implementers must not generalize the 404-on-malformed pattern beyond `DELETE /test/rooms/:uuid`.

**D4: T31 — boot log shape and level**
A) Single structured log line at INFO normally, WARN on non-prod state, replacing the existing "hnch relay listening on" line ← recommended
B) Two log lines: existing + new structured line

A wins (F15): one line per boot keeps log volume honest and avoids interleaving with WARN. The single line carries the bound port, `roomCap`, and `testRoutes`. Existing `console.log('hnch relay listening on :${port}')` is folded into it.

## Spec

### Behavioral requirements

**B1 (T22a, F8/F9/F25):** CLI `last-session.json` write applies file mode `0600` and parent directory mode `0700` on POSIX:

  - On directory create: `mkdirSync(dir, { recursive: true, mode: 0o700 })` AND `chmodSync(dir, 0o700)` after, to upgrade an existing directory created by a prior version under default umask.
  - On file write: `writeFileSync(path, data, { mode: 0o600 })` AND `chmodSync(path, 0o600)` after, to handle the overwrite-existing-0644 case (POSIX `open(2)` honors `mode` only for new files).
  - Both `chmodSync` calls wrapped: on Windows (`process.platform === 'win32'`), skip the assertion path in tests but call the no-op `chmodSync` anyway — Node's stub handles it.

**B2 (T22b, F10/F33):** When CLI's WS layer surfaces `unknown-room` rejection (close code `4001`), the CLI's `onRejection` callback at `packages/cli/src/index.ts:~136` and `~241` calls a shared helper `onSessionExpired(reason: 'http-404' | 'ws-4001')`:

  ```ts
  // packages/cli/src/session-expired.ts (new)
  export async function onSessionExpired(
    reason: 'http-404' | 'ws-4001',
    deps: { clearLastSession: () => Promise<void> | void; logger: Logger; exit: (code: number) => never }
  ): Promise<never>
  ```

  Order of operations (F10): `await deps.clearLastSession()` → `deps.logger.error('Session expired (...)')` → `deps.exit(1)`. Cache-clear runs first so even if exit is interrupted, the cache is already gone. Wording is distinct from `'wrong password'` and `'room is full'`. The existing `handleResume` 404-on-resolve path (`packages/cli/src/index.ts:~196`) is refactored to use the same helper — F33 dedupe.

**B3 (T23, F1):** Repo-wide: every `4404` token in code or comments that should be `4001` is replaced. Confirmed sites: `packages/client/src/app/core/last-session.service.ts:22`. New constraint (F1): T2 implementer runs `grep -rn '4404' packages/ adr/ *.md` and fixes every hit that refers to the unknown-room close code. Hits referring to literally HTTP 4404 status (none expected) are left alone.

**B4 (T24, F7/F13/F22):** `SessionEndService.handleSessionEnd` (`packages/client/src/app/core/session-end.service.ts:45–71`) calls `await this.lastSession.clear()` between `this.docService.endSession()` and `this.toastService.info(message)`. Wrapped in try/catch — on error, log WARN and continue (a Preferences-plugin failure must not strand the user). Test path: unit (`session-end.service.test.ts` with mocked `LastSessionService`), not E2E.

**B5 (T25, F11/F12/F20):** CLI gains `observeSessionEnd` (new module `packages/cli/src/session-end-observer.ts`) plus a unit test `packages/cli/src/session-end-observer.test.ts`:

  - Initial-state guard: `lastHandledTimestamp` initialized to `null` (NOT `0`, NOT `Date.now()`). First observe fires on any non-`null`/`undefined` `meta.sessionEndedAt`, so a snapshot-borne value (rejoin-into-ended-session within TTL) triggers the handler. Mirror mobile `SessionEndService` exactly.
  - Idempotency: subsequent observes with the same value are no-ops; a different value re-fires. Last-write-wins on Y.Map per ADR-0023 §3.
  - Teardown scheduling (F12): the `observe` callback MUST NOT call `process.exit`, `provider.disconnect`, or anything that mutates the Y.Doc/observer set inline. Instead schedule via `setImmediate(() => { ... })` so teardown runs after the current observe iteration completes. Yjs explicitly forbids mutation/teardown inside an `observe` callback.
  - Wired in `packages/cli/src/index.ts` (`create` and `join` and `resume` flows) right after the doc is bound. On fire: print "session ended by ${hostName}" (or "Session ended." if local) → `await clearLastSession()` → `provider.disconnect()` → `process.exit(0)`.

  Unit test cases (F20):
    - Initial state with `sessionEndedAt` already set fires `onEnded` once.
    - Duplicate write of same value does not re-fire.
    - New (later) value re-fires.
    - `setImmediate` scheduling verified by asserting `onEnded` is called *after* the synchronous `transact` completes.

**B6 (T26, F2):** `packages/shared/src/auth.ts:56–57` JSDoc on `JoinRejectionReason` for `room-full` cites `ADR-0024` (not `ADR-0020`).

  Explicit non-target (F2): `packages/cli/src/session.ts:228` (and any other site citing ADR-0020 in *role* / *viewer-voter* context per ADR-0020) is the role ADR — correct citation; do NOT change. Implementer must filter grep hits: only ADR-0020 cites in *cap* / *room-full* / `MAX_ROOM_PARTICIPANTS` context flip to ADR-0024.

**B7 (T27):** `packages/relay/src/server.ts:294` cap-enforcement comment cites `ADR-0024` (not `ADR-0020`). The `ADR-0016` cite (close-code table) stays.

**B8 (T28, F32):** CLI `argv.code.toUpperCase()` callsites (`packages/cli/src/index.ts:114, 130`) replaced with `normalizeRoomCode(argv.code)` imported from `@hnch/shared`. Empty-after-normalize is rejected with `'invalid room code'` (one-line `if (normalized === '') { logger.error('invalid room code'); process.exit(1) }`) before `resolveRoom` is called.

**B9 (T29, F27/F31):** `packages/shared/src/room-code.ts:54` `normalizeRoomCode` body becomes:

  ```ts
  return input.trim().replace(/-/g, '').toUpperCase()
  ```

  Test cases enumerated inline in `packages/shared/src/room-code.test.ts`:
    - `'k7p9mr'` → `'K7P9MR'` (already-uppercase baseline preserved).
    - `'k7p-9mr'` → `'K7P9MR'` (existing dash strip preserved).
    - `'  k7p9mr  '` → `'K7P9MR'` (trim only).
    - `'  k7p-9mr  '` → `'K7P9MR'` (trim + dash strip).
    - `'   '` → `''` (all-whitespace becomes empty — caller's job to validate).
    - `''` → `''` (empty stays empty).
    - `'k7p 9mr'` → `'K7P 9MR'` (embedded space NOT stripped — only outer trim and dashes).
  Regression check (F31): after change, run `pnpm --filter @hnch/shared test`. Any newly-failing assertion that expected the un-trimmed result must be inspected; only update if the previous expectation was a wrong-before-not-right-after artifact (e.g., a test that pinned the *bug* of pass-through whitespace).

**B10 (T30, F4/F14/F19):** `packages/relay/src/server.ts:357–375` `handleTestDeleteRoom` malformed-UUID branch returns `sendJson(res, 404, { error: 'not-found' })` (was `400 { error: 'bad-uuid' }`). Successful eviction (200) and unknown-uuid (404) unchanged. Existing test `packages/relay/src/server.test-routes.test.ts:51–54` *currently pins the bug* asserting `{ error: 'bad-uuid' }`; this assertion is updated in the same task to `{ error: 'not-found' }` AND a new comparison test asserts the gate-on bad-uuid response equals the gate-off `DELETE /test/rooms/anything` response byte-for-byte (status, body, content-type header). Both branches go through `sendJson()` so equality holds trivially.

**B11 (T31, F15/F23/F24/F34):** `packages/relay/src/index.ts:38–41` startup callback emits ONE log line (the existing "hnch relay listening on" line is folded in, not preserved alongside):

  ```ts
  const level = (ROOM_CAP < MAX_ROOM_PARTICIPANTS || TEST_ROUTES_ENABLED) ? 'warn' : 'info'
  const logFn = level === 'warn' ? console.warn : console.log
  logFn(`[${level}] hnch relay listening on :${boundPort} (roomCap=${ROOM_CAP}, testRoutes=${TEST_ROUTES_ENABLED})`)
  ```

  `ROOM_CAP` and `TEST_ROUTES_ENABLED` exported from `server.ts` with JSDoc:

  ```ts
  /** Frozen at module-load. Do not re-read for runtime branching — boot-time semantics by ADR-0027 §2. */
  export const ROOM_CAP: number
  /** Frozen at module-load. Do not re-read for runtime branching — boot-time semantics by ADR-0027 §2. */
  export const TEST_ROUTES_ENABLED: boolean
  ```

  Unit test (F23) — `packages/relay/src/server.test.ts` (or a new `boot-log.test.ts`): exercise three configurations by spawning the boot-log function with stubbed deps and asserting on captured stdout/stderr:
    - default (`ROOM_CAP=20`, `TEST_ROUTES_ENABLED=false`) → INFO line.
    - `ROOM_CAP=3` → WARN line.
    - `TEST_ROUTES_ENABLED=true` → WARN line.
    - `ROOM_CAP=3 && TEST_ROUTES_ENABLED=true` → WARN line.
  To make this testable, T6 extracts the log emit into a `logBootBanner({ port, roomCap, testRoutesEnabled, logger })` pure function that `index.ts` calls.

**B12 (T21):** `cli.md:79` updates the example URL from `WS /ws/:uuid?participantId=...&pw=...` to `WS /ws/:uuid?did=...&pw=...` to match `JoinCredentials.deviceId`/ADR-0016.

### Interfaces

**`@hnch/shared` exports — unchanged signature, behavior tightened:**

```ts
// packages/shared/src/room-code.ts
export function normalizeRoomCode(input: string): string
// trim → strip dashes → uppercase
```

**CLI new helper (T22b / F33):**

```ts
// packages/cli/src/session-expired.ts (new)
export async function onSessionExpired(
  reason: 'http-404' | 'ws-4001',
  deps: {
    clearLastSession: () => Promise<void> | void
    logger: { error: (msg: string) => void }
    exit: (code: number) => never
  }
): Promise<never>
```

**CLI new observer (T25):**

```ts
// packages/cli/src/session-end-observer.ts (new)
import type { Doc } from 'yjs'

export interface SessionEndObserverOptions {
  doc: Doc
  localParticipantId: string
  onEnded: (info: { isLocal: boolean; hostName: string; timestamp: number }) => Promise<void> | void
}

export function observeSessionEnd(opts: SessionEndObserverOptions): () => void
// returns dispose; idempotent; teardown via setImmediate
```

**Relay boot consts (T31) — minimal export from `server.ts`:**

```ts
export const ROOM_CAP: number
export const TEST_ROUTES_ENABLED: boolean

export function logBootBanner(deps: {
  port: number
  roomCap: number
  testRoutesEnabled: boolean
  logger: { log: (msg: string) => void; warn: (msg: string) => void }
}): void
```

### Data flow

**T22b / T25 / T24 — cache-clear paths after this change:**

```
session ends (host writes meta.sessionEndedAt)
  ├── mobile: SessionEndService observes → endSession() → await lastSession.clear() (try/catch) → toast → navigate Home
  └── CLI: observeSessionEnd → setImmediate( print → await clearLastSession() → provider.disconnect() → exit 0 )

WS layer rejects with close code 4001:
  ├── mobile: existing path (already correct).
  └── CLI: onRejection → onSessionExpired('ws-4001') → await clearLastSession() → logger.error(...) → exit 1

HTTP resolve returns 404 unknown-room:
  └── CLI: handleResume 404 path → onSessionExpired('http-404') → same teardown
```

**T30 — DELETE /test/rooms/:uuid response shape after fix:**

```
gate off (TEST_ROUTES_ENABLED !== '1') → 404 { error: 'not-found' }   (top-level fall-through)
gate on, malformed UUID                  → 404 { error: 'not-found' }   (was 400 'bad-uuid' — fixed)
gate on, unknown UUID                    → 404 { error: 'not-found' }
gate on, found UUID                      → 200 { evicted: '<uuid>' }
```

### Edge cases

- **Trim + dash strip + uppercase ordering (B9):** trim first; embedded spaces are preserved (only outer whitespace is removed). The user-typed code with embedded space (`'k7p 9mr'`) deliberately stays distinguishable as malformed input rather than silently accepted.
- **chmod 0600 on Windows (B1, F28):** `fs.chmodSync` is a no-op on Windows. ADR-0022 §3 is POSIX-scoped; ACPI bits are not enforced on Windows ACLs. Tests skip the mode assertion when `process.platform === 'win32'`.
- **Idempotent `clearLastSession` (B2/B5):** `unlinkSync` with `ENOENT` swallowed; `Preferences.remove` no-ops on missing keys. Both consumers must tolerate "already absent."
- **Two observers see same `sessionEndedAt` (B5):** guarded by last-handled timestamp (`null` initial → first non-null fires; same value re-arrival no-ops; later value re-fires).
- **`HNCH_ROOM_CAP` parsing edge cases (B11):** WARN trigger key is `ROOM_CAP < MAX_ROOM_PARTICIPANTS` after the existing parse-and-clamp logic in `server.ts:77–86`; we do not re-validate env-var here.
- **`DELETE /test/rooms/:uuid` byte-identity (B10, F14):** both branches go through `sendJson()` so status, body, and content-type header are necessarily equal; AC drops the wiggle-word "as-close-as feasible."
- **Yjs observe-callback discipline (F12):** all teardown side-effects scheduled via `setImmediate`. Inline `provider.disconnect()` or `process.exit()` corrupts iteration over Y.Map's observer set.

## Acceptance criteria

- [ ] **AC-1 (T22a, F8/F9):** `~/.config/hnch/last-session.json` created by `hnch create`/`join` has POSIX mode `0600` on macOS/Linux. Parent dir `~/.config/hnch/` has mode `0700`. Test asserts `(stat.mode & 0o777) === 0o600` for file and `0o700` for dir. Test also overwrites a file pre-created at mode `0o644` and re-asserts `0o600` after the second write.
- [ ] **AC-2 (T22b, F10/F33):** When the relay closes the WS with `4001`, CLI's `onRejection` handler invokes `onSessionExpired('ws-4001', ...)`. Cache-clear is awaited *before* the `'session expired'` log, which is *before* `process.exit(1)`. Wording is distinct from `'wrong password'` and `'room is full'`. The same helper is reused by `handleResume`'s 404 branch (one helper, two callers).
- [ ] **AC-3 (T23, F1):** `grep -rn '4404' packages/ adr/ *.md` returns zero matches in close-code-comment context after the fix. `last-session.service.ts:22` reads `close(4001)`.
- [ ] **AC-4 (T24, F7/F13/F22):** `SessionEndService.handleSessionEnd` `await`s `lastSession.clear()` between `endSession()` and the toast. A unit test in `session-end.service.test.ts` mocks `LastSessionService`, drives a remote-observed end, and asserts `clear` was called exactly once. A second unit test makes `clear` reject; assertion: WARN logged, navigation still completes.
- [ ] **AC-5 (T25, F11/F12/F20):** CLI joined to a session whose host writes `meta.sessionEndedAt` exits within ~1 s, prints "session ended by ${host}", deletes `~/.config/hnch/last-session.json`. `hnch resume` afterward reports "no recent session". CLI joining a session whose snapshot already carries `sessionEndedAt` exits on initial sync without manual host trigger. Unit tests pass for the four `observeSessionEnd` cases (initial-set fires, duplicate no-op, new-value re-fires, setImmediate scheduling).
- [ ] **AC-6 (T26, F2):** `packages/shared/src/auth.ts` `room-full` JSDoc cites `ADR-0024`. Implementer-confirmed non-changes: ADR-0020 cites in role/viewer-voter context (e.g., `packages/cli/src/session.ts:228`) preserved.
- [ ] **AC-7 (T27):** `packages/relay/src/server.ts:294` block-comment cites `ADR-0024`. ADR-0016 close-code citation preserved.
- [ ] **AC-8 (T28, F32):** `grep -n "argv.code.toUpperCase" packages/cli/src/index.ts` returns 0 matches; `grep -n "normalizeRoomCode" packages/cli/src/index.ts` returns ≥2 matches. CLI accepts `'  k7p-9mr  '` and resolves identically to `K7P9MR`. CLI given `'   '` errors with `'invalid room code'` and exits non-zero before any HTTP call.
- [ ] **AC-9 (T29, F27/F31):** All seven enumerated test cases pass. `pnpm --filter @hnch/shared test` returns green; any pre-existing test that expected the buggy un-trimmed pass-through is updated only after implementer confirms it was wrong-before-not-right-after.
- [ ] **AC-10 (T30, F4/F14/F19):** `DELETE /test/rooms/not-a-uuid` with `HNCH_ENABLE_TEST_ROUTES=1` returns `404` with body `{ "error": "not-found" }` byte-identical to gate-off `DELETE /test/rooms/<anything>` (status, body bytes, content-type header). Existing assertion at `server.test-routes.test.ts:51–54` updated; new comparison test added.
- [ ] **AC-11 (T31, F15/F23):** Relay boot emits exactly one log line carrying `roomCap` and `testRoutes`. The pre-existing "hnch relay listening on :${port}" line is folded in, not preserved alongside. `HNCH_ROOM_CAP=3` boot logs at WARN. `HNCH_ENABLE_TEST_ROUTES=1` boot logs at WARN. Default boot logs at INFO. Unit test asserts level + content for all four configurations.
- [ ] **AC-12 (T21):** `cli.md` line ~79 reads `?did=...&pw=...` (no `participantId`).
- [ ] **AC-13 (F34):** Exported `ROOM_CAP` and `TEST_ROUTES_ENABLED` carry JSDoc declaring them frozen at module-load.

## Stories

Stories are ordered for parallelism. Stories 1, 2, 3, 5 unblocked from start and run truly in parallel (no shared files). **Story 4 made strictly sequential (F17): one cli-sonnet agent works through T8 → T9 → T10 → T11 in order to avoid the `packages/cli/src/index.ts` import-merge race.** Story 6 is sequential verification.

### Story 1: Doc + comment fixes (typo-class)

Pure text edits across packages. Cohesive context: low-risk, no behavior change, can ship while implementer agents work in parallel on Stories 2/3/4/5.

- [ ] **T1: Fix cli.md handshake URL example** [haiku]
  - Story: 1
  - Package: docs (root)
  - File(s): `cli.md`
  - What: Replace `participantId=...` with `did=...` in the handshake example near line 79 to match `JoinCredentials.deviceId` / ADR-0016.
  - AC: AC-12
  - Blocked by: —
  - (Maps to T21)

- [ ] **T2: Fix every "4404" close-code comment in repo** [haiku]
  - Story: 1
  - Package: client (+ scan elsewhere)
  - File(s): `packages/client/src/app/core/last-session.service.ts:22` confirmed; implementer runs `grep -rn '4404' packages/ adr/ *.md` and fixes each hit that refers to the unknown-room close code.
  - What: Confirmed site is line 22 — change `close(4404)` to `close(4001)` in the JSDoc. Run the grep. Fix every other code/comment hit referring to the close code (literal HTTP 4404 status, if any, left alone — none expected).
  - AC: AC-3
  - Blocked by: —
  - (Maps to T23 + F1)

- [ ] **T3: Fix ADR-0020 → ADR-0024 citation in shared/auth.ts** [haiku]
  - Story: 1
  - Package: shared
  - File(s): `packages/shared/src/auth.ts`
  - What: At lines ~56–57 (JSDoc on `JoinRejectionReason` `room-full`), change `ADR-0020` → `ADR-0024`. Audit the file for other `ADR-0020` cites in cap/room-full/MAX_ROOM_PARTICIPANTS context and correct. **Do NOT touch ADR-0020 cites in viewer/voter or role context** (F2) — those are the role ADR and are correct as-is. Confirmed non-target: `packages/cli/src/session.ts:228` (role context).
  - AC: AC-6
  - Blocked by: —
  - (Maps to T26)

- [ ] **T4: Fix ADR-0020 → ADR-0024 citation in relay/server.ts** [haiku]
  - Story: 1
  - Package: relay
  - File(s): `packages/relay/src/server.ts`
  - What: At line 294 cap-enforcement block-comment, change `ADR-0020` → `ADR-0024`. Preserve the `ADR-0016` close-code citation in the same comment.
  - AC: AC-7
  - Blocked by: —
  - (Maps to T27)

### Story 2: Relay surface fixes (T30, T31)

Two changes split across `server.ts` and `index.ts`. T30 = security (oracle leak). T31 = mechanical logging + JSDoc.

- [ ] **T5: Make malformed-UUID indistinguishable from gate-off in DELETE /test/rooms** [sonnet]
  - Story: 2
  - Package: relay
  - File(s): `packages/relay/src/server.ts` (`handleTestDeleteRoom`, lines ~357–375), `packages/relay/src/server.test-routes.test.ts` (lines 51–54)
  - What: Replace `sendJson(res, 400, { error: 'bad-uuid' })` with `sendJson(res, 404, { error: 'not-found' })` so the malformed-UUID path is byte-identical to the gate-off fall-through. **Update the existing test at `server.test-routes.test.ts:51–54`** (currently pins the bug `{error:'bad-uuid'}`) to `{error:'not-found'}` (F19). Add a new comparison test that hits the gate-on bad-uuid path AND the gate-off (HNCH_ENABLE_TEST_ROUTES unset) path with the same URL and asserts status, body bytes, and `content-type` header are equal.
  - AC: AC-10
  - Blocked by: —
  - (Maps to T30)

- [ ] **T6: Log effective ROOM_CAP and TEST_ROUTES_ENABLED at relay boot** [haiku]
  - Story: 2
  - Package: relay
  - File(s): `packages/relay/src/server.ts` (export `ROOM_CAP`, `TEST_ROUTES_ENABLED` with JSDoc per F34; export `logBootBanner` pure function), `packages/relay/src/index.ts` (the `server.listen` callback — fold existing `console.log` into the new structured single line per F15), new unit test `packages/relay/src/boot-log.test.ts` (F23).
  - What: Replace `console.log('hnch relay listening on :${boundPort}')` with one structured line per B11 — INFO normally, WARN when `ROOM_CAP < MAX_ROOM_PARTICIPANTS` OR `TEST_ROUTES_ENABLED`. Extract emit into `logBootBanner(...)` so the unit test can drive four configurations and assert level + content. Add JSDoc on the two exported consts.
  - AC: AC-11, AC-13
  - Blocked by: —
  - (Maps to T31, downgraded haiku per F24)

### Story 3: Shared room-code normalization (T29)

Single tight change. Runs in parallel; no longer gates Story 4 because Story 4 is now sequential and T11 is the last task in S4 — by the time the cli-sonnet reaches T11, S3 will have landed.

- [ ] **T7: Add `.trim()` to normalizeRoomCode** [haiku]
  - Story: 3
  - Package: shared
  - File(s): `packages/shared/src/room-code.ts:54`, `packages/shared/src/room-code.test.ts`
  - What: Update body to `return input.trim().replace(/-/g, '').toUpperCase()`. Add the seven unit-test cases enumerated in B9. Run `pnpm --filter @hnch/shared test`; if any pre-existing assertion fails, inspect — only update if the prior expectation pinned the bug (F31).
  - AC: AC-9
  - Blocked by: —
  - (Maps to T29)

### Story 4: CLI gap closure (T22, T25, T28) — STRICTLY SEQUENTIAL

All four CLI tasks edit `packages/cli/src/index.ts` in non-overlapping but proximate regions; running them in parallel risks an import-merge race (F17). Single `cli-sonnet` agent works the story top-to-bottom: T8 → T9 → T10 → T11. T11 has the additional gate that T7 (Story 3) must be reviewer-clean before T11 starts (F18).

- [ ] **T8: Apply mode 0600 to last-session.json + 0700 on parent dir** [sonnet]
  - Story: 4
  - Package: cli
  - File(s): `packages/cli/src/last-session.ts` (write/mkdir sites), `packages/cli/src/last-session.test.ts`
  - What: Apply B1 in full — `mkdirSync(dir, { recursive: true, mode: 0o700 })` + `chmodSync(dir, 0o700)` AND `writeFileSync(path, data, { mode: 0o600 })` + `chmodSync(path, 0o600)`. Both `chmodSync` calls cover the upgrade-from-existing-permissive-mode case. Tests: file mode, dir mode, overwrite-existing-0644 case. Skip mode-bit assertions on Windows but call `chmodSync` regardless. **Tier upgraded haiku→sonnet (F25)** because the TOCTOU + overwrite subtlety is exactly the kind of thing haiku-implementer misses.
  - AC: AC-1
  - Blocked by: —
  - (Maps to T22a)

- [ ] **T9: Handle WS close 4001 in CLI onRejection (extract `onSessionExpired` helper)** [sonnet]
  - Story: 4
  - Package: cli
  - File(s): `packages/cli/src/session-expired.ts` (new), `packages/cli/src/index.ts` (the `onRejection` callbacks at lines ~132–144 and ~236–245; AND the `handleResume` 404-on-resolve path around line ~196), unit test for the helper.
  - What: Extract `onSessionExpired(reason, deps)` per B2. Wire both `onRejection` callsites to call it on `'unknown-room'`. Refactor the existing `handleResume` 404-on-resolve branch to call the same helper (F33 dedupe). Order of operations: `await clearLastSession()` → `logger.error('session expired (...)')` → `exit(1)`. Wording distinct from `'wrong password'` and `'room is full'`. Add a unit test driving the helper directly with mocked deps for both `'http-404'` and `'ws-4001'` (F21).
  - AC: AC-2
  - Blocked by: T8 (sequential within S4)
  - (Maps to T22b)

- [ ] **T10: Add CLI sessionEndedAt observer** [sonnet]
  - Story: 4
  - Package: cli
  - File(s): `packages/cli/src/session-end-observer.ts` (new), `packages/cli/src/session-end-observer.test.ts` (new), `packages/cli/src/index.ts` (wire in `create`, `join`, `resume` flows after doc binding)
  - What: Implement `observeSessionEnd` per B5. Initial-state guard `null` (F11). Teardown via `setImmediate` (F12). Wire in three CLI flows. Unit test the four cases enumerated in B5 (F20).
  - AC: AC-5
  - Blocked by: T9 (sequential within S4)
  - (Maps to T25)

- [ ] **T11: Switch CLI to use normalizeRoomCode + reject empty** [haiku]
  - Story: 4
  - Package: cli
  - File(s): `packages/cli/src/index.ts:114, 130`
  - What: Add `import { normalizeRoomCode } from '@hnch/shared'`. Replace both `argv.code.toUpperCase()` calls. After normalize: `if (normalized === '') { logger.error('invalid room code'); process.exit(1) }` before `resolveRoom` (F32). Implementer must rebase on the same `index.ts` working state left by T10 — F26 import-merge collision applies.
  - AC: AC-8
  - Blocked by: T7 reviewer-clean (F18) AND T10 (sequential within S4)
  - (Maps to T28)

### Story 5: Mobile cache-clear in remote-observer path (T24)

Single mobile client edit. Independent of Stories 1-4 — runs in parallel on `client-sonnet`.

- [ ] **T12: Wire LastSessionService.clear() into SessionEndService** [sonnet]
  - Story: 5
  - Package: client
  - File(s): `packages/client/src/app/core/session-end.service.ts:45–71`, `packages/client/src/app/core/session-end.service.test.ts` (or new file)
  - What: Inject `LastSessionService`. Between `this.docService.endSession()` and `this.toastService.info(message)`, call `await this.lastSession.clear()` wrapped in try/catch (F7). On error: log WARN, continue. Unit test path (F22): mock `LastSessionService`, drive a remote-observed end, assert `clear` called once; second test makes `clear` reject and asserts WARN + navigation still completes. Verify the lobby-leave path (`lobby.page.ts:736–743`) still works (it already clears separately; double-clear is fine — `clear` is idempotent).
  - AC: AC-4
  - Blocked by: —
  - (Maps to T24)

### Story 6: Build + verify

- [ ] **T13: Run full verification** [haiku — test-runner-haiku]
  - Story: 6
  - Package: all
  - File(s): —
  - What:
    - `pnpm -r build` (all packages)
    - `pnpm -r test` (unit suites — shared, relay, client, cli)
    - `pnpm --filter @hnch/e2e test` (Playwright suite — must exercise `room-full.spec.ts` and `expired-jump-back-in.spec.ts` to verify T30/T31 didn't regress test-route behavior)
    - Manual smoke: `hnch create` → confirm `~/.config/hnch/last-session.json` exists with mode 0600 (`stat -f "%Lp"` on macOS or `stat -c "%a"` on Linux). Run a second instance, `hnch join <code>`, host runs end-session, verify CLI exits within ~1 s with cache cleared. Boot relay with `HNCH_ROOM_CAP=3` and confirm WARN log.
  - AC: all
  - Blocked by: T1–T12

## Plan-critic findings — point-by-point response

### BLOCKER

- **F8 — accept.** B1 / T8 specify `writeFileSync(..., { mode: 0o600 })` AND explicit `chmodSync` after for the overwrite-existing-permissive case; same dual approach on the parent dir.
- **F11 — accept.** B5 / T10 set initial-state guard to `null` (NOT 0/Date.now); first non-null observe fires, covering snapshot-borne-already-ended case. Unit test enumerated.
- **F12 — accept.** B5 / T10 require teardown via `setImmediate(...)`; `process.exit`/`disconnect`/etc inside `observe` callback explicitly forbidden in the spec.
- **F17 — accept.** Story 4 is now strictly sequential single-agent; T8→T9→T10→T11 within one cli-sonnet. Avoids `packages/cli/src/index.ts` import-merge race entirely.
- **F19 — accept.** T5 explicitly updates `server.test-routes.test.ts:51–54` in-place AND adds the new gate-off comparison test. Not parallel — one assertion replaced, one added.
- **F25 — accept.** T8 tier upgraded haiku→sonnet. TOCTOU + overwrite + dir-mode subtlety beyond haiku reach.
- **F31 — accept.** B9 / T7 spec includes "run `pnpm --filter @hnch/shared test`; any newly-failing assertion inspected; only update if it was wrong-before-not-right-after."

### SHOULD-FIX

- **F1 — accept.** B3 / T2 expanded to `grep -rn '4404'` repo-wide; every close-code-context hit fixed.
- **F2 — accept.** T3 spec calls out the explicit non-target: `packages/cli/src/session.ts:228` is the role-ADR cite (correct), do not touch.
- **F4 — accept.** T5 / B10 explicit: existing assertion updated, then comparison test added.
- **F5 — accept.** D3.1 added: 400-on-malformed elsewhere is intentional asymmetry; only the test-route gate has a secrecy contract; do not generalize.
- **F7 — accept.** B4 / T12 wraps `await this.lastSession.clear()` in try/catch; WARN on error and continue. Order: clear → toast → navigate.
- **F9 — accept.** B1 / T8 add directory mode `0700` with both `mkdirSync({ mode })` AND post-hoc `chmodSync(dir, 0o700)`.
- **F10 — accept.** B2 / T9 ordering: `await clearLastSession()` *before* user-visible message *before* `exit`. Matches T25 ordering.
- **F13 — accept.** B4 / AC-4 require `await this.lastSession.clear()` (Promise awaited).
- **F14 — accept.** AC-10 dropped wiggle-word; asserts status, body bytes, AND content-type header equality. Both branches go through `sendJson()` so trivially holds.
- **F15 — accept.** D4 / B11 / T6 fold existing `console.log` into the new structured line — one log line per boot.
- **F18 — accept.** T11 `Blocked by` updated to T7 reviewer-clean (not just merged).
- **F20 — accept.** B5 / T10 enumerate four unit-test cases for `observeSessionEnd`.
- **F21 — accept.** T9 spec adds unit test for the extracted `onSessionExpired` helper driven directly with mocked deps.
- **F22 — accept.** T12 picks unit-test path explicitly (`session-end.service.test.ts` + LastSessionService mock); E2E not required.
- **F23 — accept.** T6 extracts `logBootBanner(...)` pure function; unit test exercises the four boot-config combinations.
- **F24 — accept.** T6 tier downgraded sonnet→haiku.
- **F26 — accept.** T11 spec restates the import-merge collision rule and the sequential-within-S4 ordering.
- **F27 — accept.** B9 / T7 enumerate seven test cases inline (whitespace-only, leading/trailing, mixed-case+space, dash+space, embedded-space-preserved, baseline, empty).
- **F28 — accept.** B1 / Edge cases acknowledge Windows chmod no-op explicitly + per-spec acceptable.
- **F32 — accept.** B8 / T11 add empty-after-normalize rejection (`'invalid room code'`) before `resolveRoom`.
- **F33 — accept.** B2 / T9 extract `onSessionExpired` helper; both `onRejection` callbacks AND `handleResume` 404 path use it. One helper, two/three callers.
- **F34 — accept.** B11 / T6 add JSDoc on exported `ROOM_CAP` / `TEST_ROUTES_ENABLED` declaring them frozen at module-load.

### NIT

- **F3 — defer.** schema.md cross-check on `meta.sessionEndedAt` is an ADR-0023 §Action Items item, not a code-fix in this plan's T21–T31 scope. Flagged for follow-up.
- **F6 — accept (acknowledge).** ROOM_CAP-only spec stricter than ADR is acknowledged in the user-journey + edge-case notes. The strictness is not new — the boot log just makes the existing constraint visible.
- **F29 — defer.** Cross-platform configDir handling (XDG_CONFIG_HOME, `%APPDATA%`, etc.) is an ADR-0021 / ADR-0022 concern. CLI is macOS/Linux primary scope per the team-lead brief; defer per-platform-path work.
- **F30 — defer.** EBUSY on Windows during `chmodSync`/`unlinkSync` — Windows is not the CLI's primary scope. Documented as known-limitation; no implementation work in this plan.
- **F35 — accept (typo confirmed).** Typo in ADR text noted; out of scope for code-side gap closure (ADR-text changes are immutable per `adr/README.md` once accepted).

## Team Recommendation

### Agent roster (revised)

| Agent | subagent_type | Stories | Spawn | Despawn |
|---|---|---|---|---|
| docs-haiku | haiku-implementer (general/docs) | S1 | S1 start | after S1 review clean |
| relay-sonnet | relay-sonnet | S2 (T5) | S2 start | after T5 review clean |
| relay-haiku | relay-haiku | S2 (T6) | S2 start | after T6 review clean |
| shared-haiku | shared-haiku | S3 | S3 start | after S3 review clean |
| cli-sonnet | cli-sonnet | S4 (T8, T9, T10) | S4 start | after T11 review clean |
| cli-sonnet (cont.) | cli-sonnet (same agent or fresh on context rot) | S4 (T11) | after T7 reviewer-clean | after S4 done |
| client-sonnet | client-sonnet | S5 | S5 start | after S5 review clean |
| reviewer | reviewer | S1, S3, S5 | S1 start | end |
| security-reviewer | security-reviewer | S2, S4 | spawn on first S2 / S4 review-ready | end |
| test-runner-haiku | test-runner-haiku | S6 | S6 start | end |

### Reviewer strategy

**Two reviewers, parallel, by security weight:**

- **`reviewer`** — Story 1 (typo-class doc/comment fixes), Story 3 (single shared function + tests), Story 5 (single mobile wiring with try/catch). Light-touch context.
- **`security-reviewer`** — Story 2 (T30 oracle-leak fix; T31 admission-binary boot log on a security-relevant exported const) and Story 4 (T22 cache lifecycle on auth boundary; T25 session-end teardown that mirrors mobile semantics; T28 input-normalization for credential-resolution path). All touch ADR-0009 / ADR-0017 / ADR-0022 / ADR-0024 / ADR-0027 contracts.

The CLI session-end observer (T10) and mobile cache-clear (T12) are mirror-image — security-reviewer covers T10 in S4; reviewer covers T12 in S5. After both land, security-reviewer spends a brief pass comparing them side-by-side to confirm semantic parity (ADR-0021 contract).

### Concurrency timeline (revised — Story 4 sequential)

Max 5 agents simultaneously. Stories 1, 2, 3, 4, 5 unblocked from start. Story 4 is strictly serialized inside one cli-sonnet (F17).

```
Phase A (parallel — Wave 1, 5 agents):
  docs-haiku        (S1: T1, T2, T3, T4 — four small text edits)
  relay-sonnet      (S2: T5 — security)
  shared-haiku      (S3: T7)
  cli-sonnet        (S4: T8 → T9 → T10 sequential; T11 deferred until T7 reviewer-clean)
  reviewer          (covers S1, S3, S5 incrementally as stories arrive)

  When S2/T5 or S4/T8 first reaches review-ready → spawn security-reviewer (replaces a finished haiku slot if budget hits 5).
  client-sonnet (S5: T12) starts when one of {docs-haiku, shared-haiku} despawns OR slot otherwise opens.

Phase B (after T7 reviewer-clean):
  cli-sonnet picks up T11 (now unblocked).
  relay-haiku spawned for T6 (was deferred while relay-sonnet held the relay slot).

Phase C (all S1–S5 review clean):
  Despawn implementers as their stories close.
  Spawn test-runner-haiku for S6 / T13.
  Reviewer + security-reviewer remain on standby until S6 passes (catch any test-driven follow-ups).

Phase D (S6 green):
  Despawn all.
```

Despawn rules tightened:
- shared-haiku despawns once T7 reviewed clean.
- docs-haiku despawns once T1–T4 reviewed clean.
- relay-sonnet despawns once T5 reviewed clean. relay-haiku spawns/despawns around T6 in Phase B.
- cli-sonnet despawns once T11 reviewed clean (T8–T10 land first inside the same agent context — agent stays hot through the whole story).
- client-sonnet despawns once T12 reviewed clean.
- Reviewers stay through S6.

## Key files reference

Implementers should read these before touching code:

- `CLAUDE.md` — project overview, commit conventions (no Co-Authored-By).
- `cli.md` — CLI conventions, command surface, parity contract.
- `adr/0008-room-code-format.md` — normalize semantics (uppercase, no dash; T7/T11 implementers).
- `adr/0016-client-relay-connection-handshake.md` — close-code table; 4001 = unknown-room.
- `adr/0021-cli-package.md` — CLI parity contract; relevant to T10 mirror-image semantics.
- `adr/0022-last-session-cache.md` — cache TTL, file-mode 0600 (CLI), unknown-room → clear (CLI).
- `adr/0023-session-end-broadcast.md` — host writes `meta.sessionEndedAt`, observers clear cache.
- `adr/0024-participant-cap.md` — cap-enforcement comment cites this ADR; defense-in-depth boot log.
- `adr/0027-test-only-relay-surfaces.md` — DELETE /test/rooms behavior; gate-off byte-identity; boot log requirement; D3.1 asymmetry rationale.
- `roadmap.md` §10 — logging convention (plain `console.log`/`console.warn` + structured prefix; no log framework in v1).

Code touchpoints (file + approximate line):

- `cli.md:79` (T1 / T21)
- `packages/client/src/app/core/last-session.service.ts:22` (T2 / T23) + repo-wide grep
- `packages/shared/src/auth.ts:56–57` (T3 / T26) — beware role-context cites (do-not-touch list)
- `packages/relay/src/server.ts:294` (T4 / T27)
- `packages/relay/src/server.ts:357–375` `handleTestDeleteRoom` (T5 / T30)
- `packages/relay/src/server.test-routes.test.ts:51–54` existing assertion (T5 / F19)
- `packages/relay/src/server.ts:70, 77–86` constants; `packages/relay/src/index.ts:38–41` listen callback (T6 / T31)
- `packages/relay/src/boot-log.test.ts` new (T6 / F23)
- `packages/shared/src/room-code.ts:54` `normalizeRoomCode`; `packages/shared/src/room-code.test.ts` (T7 / T29)
- `packages/cli/src/last-session.ts` write/mkdir sites; `packages/cli/src/last-session.test.ts` (T8 / T22a)
- `packages/cli/src/session-expired.ts` new (T9 / F33)
- `packages/cli/src/index.ts:132–144, 196 area, 236–245` onRejection + handleResume callbacks (T9 / T22b)
- `packages/cli/src/session-end-observer.ts` new; `packages/cli/src/session-end-observer.test.ts` new; wired in `packages/cli/src/index.ts` (T10 / T25)
- `packages/cli/src/index.ts:114, 130` (T11 / T28)
- `packages/client/src/app/core/session-end.service.ts:45–71`; test file (T12 / T24)
