# Execution Plan: hnch Gap Closure — Full Sweep

**Total: 5 stories, 17 tasks, ~19 SP**
**Decisions:** D1-A (keep participant in doc), D2-A (reconnect transient only), D3-A (sessionEndedAt in meta), D4-B (unit tests before v1)

---

## Task List with Dependencies

### Story 1: End Session for Everyone [5 SP]

| Task | Title | Tier | Package | Files | Blocked By | SP |
|------|-------|------|---------|-------|------------|-----|
| T1 | Add `sessionEndedAt` to doc schema + projection | sonnet | shared + client | `shared/src/doc.ts`, `shared/src/doc-projection.ts`, `shared/src/doc-projection.test.ts`, `schema.md` | — | 1 |
| T2 | Implement `endSessionForEveryone()` in doc.service + observer | sonnet | client | `client/src/app/core/doc/doc.service.ts` | T1 | 2 |
| T3 | Wire "End session for everyone" UI in action sheets | sonnet | client | `client/src/app/lobby/lobby.page.ts`, `client/src/app/estimating/estimating.page.ts` | T2 | 1 |
| T4 | E2E test: end session for everyone | haiku | e2e | `e2e/tests/end-session.spec.ts` | T3 | 1 |

### Story 2: Auto-Reconnect + Reconnecting Banner [4 SP]

| Task | Title | Tier | Package | Files | Blocked By | SP |
|------|-------|------|---------|-------|------------|-----|
| T5 | Fix auto-reconnect: distinguish transient vs permanent failures | sonnet | client | `client/src/app/core/doc/sync-provider.ts` | — | 2 |
| T6 | Add reconnecting banner/toast UI | sonnet | client | `client/src/app/lobby/lobby.page.ts`, `client/src/app/estimating/estimating.page.ts` | T5 | 1 |
| T7 | E2E test: reconnect after transient disconnect | haiku | e2e | `e2e/tests/auto-reconnect.spec.ts` | T6 | 1 |

### Story 3: Client Unit Tests — Core Services [5 SP]

| Task | Title | Tier | Package | Files | Blocked By | SP |
|------|-------|------|---------|-------|------------|-----|
| T8 | Unit tests for doc.service.ts | sonnet | client | `client/src/app/core/doc/doc.service.test.ts` | T2 | 2 |
| T9 | Unit tests for sync-provider.ts | sonnet | client | `client/src/app/core/doc/sync-provider.test.ts` | T5 | 1 |
| T10 | Unit tests for relay-api.ts | haiku | client | `client/src/app/core/relay/relay-api.test.ts` | — | 1 |
| T11 | Unit tests for last-session.service.ts | haiku | client | `client/src/app/core/last-session.service.test.ts` | — | 1 |

### Story 4: E2E Error Paths [3 SP]

| Task | Title | Tier | Package | Files | Blocked By | SP |
|------|-------|------|---------|-------|------------|-----|
| T12 | E2E test: leave session flow | haiku | e2e | `e2e/tests/leave-session.spec.ts` | — | 0.5 |
| T13 | E2E test: re-vote full cycle | haiku | e2e | `e2e/tests/revote-cycle.spec.ts` | — | 0.5 |
| T14 | E2E test: viewer role + auto-reveal | haiku | e2e | `e2e/tests/viewer-role.spec.ts` | — | 1 |
| T15 | E2E test: room full rejection | haiku | e2e | `e2e/tests/room-full.spec.ts` | — | 1 |

### Story 5: E2E Multi-Client + Remaining [2 SP]

| Task | Title | Tier | Package | Files | Blocked By | SP |
|------|-------|------|---------|-------|------------|-----|
| T16 | E2E test: 3-client round + host election | sonnet | e2e | `e2e/tests/three-client.spec.ts` | — | 1 |
| T17 | E2E test: mid-session password change | haiku | e2e | `e2e/tests/password-change.spec.ts` | — | 1 |

---

## Dependency Graph

```
T1 (schema) ──→ T2 (doc.service) ──→ T3 (UI) ──→ T4 (e2e)
                                  └──→ T8 (unit test doc.service)

T5 (reconnect) ──→ T6 (banner) ──→ T7 (e2e)
               └──→ T9 (unit test sync-provider)

T10, T11, T12, T13, T14, T15, T16, T17 — no blockers, can run anytime
```

---

## Story → Review Groupings

| Review | Tasks | What reviewer checks |
|--------|-------|---------------------|
| Review 1 | T1, T2, T3, T4 | Schema change correct, observer logic, UI wiring, e2e passes |
| Review 2 | T5, T6, T7 | Reconnect logic distinguishes failure types, banner UX, e2e passes |
| Review 3 | T8, T9, T10, T11 | Test quality, mocking strategy, coverage of edge cases |
| Review 4 | T12, T13, T14, T15 | E2e test reliability, assertions correct, no flakiness |
| Review 5 | T16, T17 | Multi-client test setup, assertions correct |

---

## Agent Lifecycle

| Agent | Type | Spawn | Despawn | Tasks |
|-------|------|-------|---------|-------|
| shared-impl | shared-sonnet | Wave 1 | After T1 reviewed | T1 |
| mobile-impl-1 | mobile-sonnet | Wave 1 | Wave 4 | T2 → T3 → T8 |
| mobile-impl-2 | mobile-sonnet | Wave 1 | Wave 4 | T5 → T6 → T9 |
| e2e-impl-1 | mobile-haiku | Wave 1 | Wave 2 | T10 → T11 → T12 → T13 |
| e2e-impl-2 | mobile-haiku | Wave 1 | Wave 3 | T14 → T15 → T16(sonnet) → T17 |
| reviewer | reviewer | Wave 2 | Wave 5 | All 5 review passes |

Max concurrent: 5 (4 impl + 1 reviewer)

---

## Wave Execution Order

### Wave 1: Foundation + Independent
- shared-impl: T1 (schema)
- mobile-impl-2: T5 (reconnect)
- e2e-impl-1: T10 (relay-api tests)
- e2e-impl-2: T14 (viewer role e2e)
- reviewer: idle

### Wave 2: Chain + Independent + First Reviews
- mobile-impl-1: T2 (doc.service, blocked until T1 done)
- mobile-impl-2: T6 (banner, blocked until T5 done)
- e2e-impl-1: T11 → T12 → T13
- e2e-impl-2: T15 → T16
- reviewer: Review Story 3 partial (T10, T11) + Story 4 partial (T12, T13)

### Wave 3: Final Chain + Tests
- mobile-impl-1: T3 (UI) → T8 (doc.service tests)
- mobile-impl-2: T9 (sync-provider tests)
- e2e-impl-2: T17
- reviewer: Review Story 2 (T5, T6) + Story 4 remaining (T14, T15) + Story 5 (T16)

### Wave 4: Final E2E + Reviews
- mobile-impl-1: T4 (end-session e2e)
- mobile-impl-2: T7 (reconnect e2e)
- reviewer: Review Story 1 (T1, T2, T3) + Story 3 remaining (T8, T9) + T17

### Wave 5: Final Review
- reviewer: Review T4, T7

---

## Implementation Notes

**T1 (schema):** Add `sessionEndedAt?: number` to `meta` Y.Map in `doc.ts`. Add to `DocProjection` type. Update `projectDoc()` to read it. Add test case in `doc-projection.test.ts`. Update `schema.md` meta table. Additive optional field — no ADR needed.

**T2 (doc.service):** Add `endSessionForEveryone()` — writes `meta.sessionEndedAt = Date.now()`. Add effect/observer: when `sessionEndedAt` appears and current user is NOT the one who triggered it, navigate to Home + show toast "Session ended by [host name]." Host navigates after calling method.

**T3 (UI):** Add "End session for everyone" to action sheets on Lobby and Estimating. Host-only (destructive role). Wire `ion-alert` confirmation. On confirm → `endSessionForEveryone()` → navigate Home.

**T5 (reconnect):** `shouldConnect = false` + `disconnect()` ONLY for permanent rejection close codes (4001-4006, 4010). Transient failures (network error, no close code, unexpected close) → let y-websocket reconnect. Surface `reconnecting` state.

**T8 (doc.service tests):** Test `createSession()`, `joinSession()`, `endSession()`, `endSessionForEveryone()`, projection signal updates, vote casting, reveal, settings. Mock sync-provider.

**T9 (sync-provider tests):** Test close-code → rejection mapping, `shouldConnect` per failure type, connection state transitions. Mock WebSocket.

---

## Acceptance Criteria

- [ ] AC-1: Host can tap "End session for everyone" → all participants navigate to Home with toast
- [ ] AC-2: `sessionEndedAt` field persists in doc snapshot
- [ ] AC-3: Transient WS disconnects auto-reconnect without user intervention
- [ ] AC-4: Permanent rejections stop reconnect
- [ ] AC-5: Reconnecting banner/toast visible during transient disconnect
- [ ] AC-6: doc.service unit tests covering session lifecycle + endSessionForEveryone
- [ ] AC-7: sync-provider unit tests covering close-code handling + reconnect decisions
- [ ] AC-8: relay-api and last-session.service unit tests
- [ ] AC-9: E2E tests pass for: leave session, re-vote cycle, viewer role, room full, 3-client, password change, end session, auto-reconnect
- [ ] AC-10: `pnpm build` passes across all packages
- [ ] AC-11: All existing tests still pass (no regressions)
