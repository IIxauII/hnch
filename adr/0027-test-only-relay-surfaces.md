# ADR-0027: Test-only relay surfaces — `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP`

**Status:** Accepted
**Date:** 2026-04-26
**Deciders:** Xau

## Context

The relay binary at `packages/relay/src/server.ts` is the only piece of hnch infrastructure exposed to the public internet. Per [ADR-0009](0009-access-control-relay-tokens.md) it is the sole enforcement point for admission (room existence, password proof, single-use invite tokens) and per [ADR-0024](0024-participant-cap.md) it is also the enforcement point for the participant cap. Anything that can change admission behavior in that binary is security-relevant.

Two such surfaces have grown into the production codebase to support the Playwright e2e suite:

1. **`HNCH_ENABLE_TEST_ROUTES`** (`packages/relay/src/server.ts:70`) — when set to `'1'`, registers an additional HTTP route `DELETE /test/rooms/:uuid` that evicts a room from the relay's in-memory store. Used by [`packages/e2e/tests/expired-jump-back-in.spec.ts`](../packages/e2e/tests/expired-jump-back-in.spec.ts) to simulate the snapshot-TTL expiry path without waiting 24 hours.
2. **`HNCH_ROOM_CAP`** (`packages/relay/src/server.ts:78`) — when set to a positive integer, lowers the participant cap below the production default of 20 ([ADR-0024](0024-participant-cap.md)). Used by [`packages/e2e/tests/room-full.spec.ts`](../packages/e2e/tests/room-full.spec.ts) (set to `'3'` in `packages/e2e/playwright.config.ts:29`) so the room-full path can be exercised with three browser contexts instead of twenty-one.

Both env vars are read **once at module load** (`TEST_ROUTES_ENABLED` and `ROOM_CAP` are `const`s evaluated at import time), not per request. There is no runtime toggle, no admin endpoint to flip them, and no in-protocol way for a client to discover whether they are enabled. A correct production deploy never sets either: the test-route HTTP path returns `404 not-found` like any other unknown URL, and the cap stays at `MAX_ROOM_PARTICIPANTS = 20`.

Without an ADR, the next contributor adding a "I'll just add another env var to bypass auth for my local dev loop" surface has no recorded standard for what's acceptable, where the boundary between test-fixture and production-binary lives, and how to tell the deploy pipeline they exist. ADR-0024 already gestured at the eventual existence of this ADR ("the forthcoming ADR-0025 (test-only relay surfaces)" — note: the actual number is ADR-0027 once landed; ADR-0024's forward-reference is a typo-class fix tracked separately). This ADR pins the rules.

A reasonable contributor could have argued that test-only behavior should not live in the production binary at all (separate test-relay binary, dependency-injected admission policy, build-time conditional compilation). Each of those alternatives has different trade-offs around CI complexity and the risk-of-divergence between what tests exercise and what production runs. Recording the chosen posture and its constraints is the point of this ADR.

## Decision

1. **Env-var-gated test surfaces in the production binary are permitted, with constraints.** The relay binary itself reads `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` at boot. Tests exercise the same code path that production runs — there is one relay binary, not a "test relay" and a "prod relay" — and the gate is the env var.

2. **Default-off, fail-safe.** Both env vars MUST default to a production-safe behavior:
   - `HNCH_ENABLE_TEST_ROUTES` unset OR any value other than the exact string `'1'` → the test routes are not registered, and `DELETE /test/rooms/:uuid` returns `404 not-found` from the same fall-through as any unknown URL.
   - `HNCH_ROOM_CAP` unset, empty, non-numeric, zero, or negative → the cap stays at `MAX_ROOM_PARTICIPANTS = 20`. Even when set, the value is clamped to `Math.min(parsed, MAX_ROOM_PARTICIPANTS)` so the env var can only **lower** the cap, never raise it.
   - Read-once-at-boot semantics. Neither value is re-read per request. A misconfigured deploy is detected at startup (or at first hit), not silently flipped at runtime by an attacker who somehow flips env state.

3. **Naming convention: `HNCH_*` prefix for relay env vars; test-only ones SHOULD use a recognizable token in the name.** The two test-affecting vars today don't use a `_TEST_` infix consistently (`HNCH_ENABLE_TEST_ROUTES` does; `HNCH_ROOM_CAP` does not, because lowering the cap also has a legitimate "tiny private deployment" reading even if we don't currently support that). Future test-only env vars SHOULD include `_TEST_` in the name. Deviations require a written rationale in the ADR that introduces them. This is a forward-only rule — `HNCH_ROOM_CAP` is grandfathered.

4. **Minimum capability principle.** A test-only env var MAY:
   - Lower a hardcoded limit (cap, timeout) toward a value already valid for production.
   - Register additional HTTP routes that perform actions a production deploy would also support semantically, but accelerate the timeline (e.g., expire a room now instead of in 24 hours).
   It MUST NOT:
   - Bypass authentication, password checking, or token validation. Test code that needs to exercise the wrong-password path MUST go through the actual handshake with a wrong password — never through a "skip-auth-for-tests" toggle.
   - Disclose room contents, codes, or password hashes to test fixtures except via the same WebSocket protocol production clients use.
   - Persist state changes anywhere outside the relay's in-memory store ([ADR-0012](0012-snapshot-policy.md) holds: no disk persistence, ever).
   - Open a network listener, port, or upstream connection that the production binary does not.

5. **The `DELETE /test/rooms/:uuid` route's exact contract:**
   - URL: `DELETE /test/rooms/:uuid` — UUID in path, no body, no auth header.
   - Response: `200 { evicted: <uuid> }` on successful eviction; `404 not-found` if the UUID is unknown OR if `HNCH_ENABLE_TEST_ROUTES !== '1'` (intended to be indistinguishable from a real unknown route — there is no tell that the gate exists). (Current code returns `400 bad-uuid` on a malformed UUID when the gate is on — this leaks the gate's existence and is tracked as a code-fix Action Item below to restore byte-identical `404 not-found`.)
   - Effect: removes the room record from `RoomStore`, identical to natural snapshot-TTL expiry per [ADR-0012](0012-snapshot-policy.md). Live WebSocket connections to that room close as a side-effect of the doc destruction (likely with default close codes `1006`/`1011` rather than the structured `4001 / unknown-room`). Clients that attempt to reconnect after the delete receive `4001 / unknown-room` from the resolve step. The reconnect flow ends up at the same place either way: [ADR-0022](0022-last-session-cache.md) cache eviction triggered, "session expired" UX surfaced.
   - This is the only test-only route. Adding more requires a new ADR (or a superseding one) — the surface area is part of the public security posture.

6. **Production deploy hygiene is the deployer's responsibility.** The relay does **not** refuse to start when test env vars are set — there is no positive "I am production" assertion to bind against, and refusing to start on env-var presence creates a foot-gun for legitimate dev environments. Instead:
   - The deploy pipeline (CI, ops checklist) is responsible for verifying that production envs do NOT set `HNCH_ENABLE_TEST_ROUTES` or `HNCH_ROOM_CAP`. ADR-0024 already lists this as an action item under the cap.
   - `/health` ([ADR-0016](0016-client-relay-connection-handshake.md) handshake context) does NOT report whether test routes are enabled. Disclosing the gate state via `/health` would be a reconnaissance aid; the gate is meant to be invisible from outside.
   - At boot, the relay MUST log the effective `ROOM_CAP` value. When `ROOM_CAP < MAX_ROOM_PARTICIPANTS` OR `TEST_ROUTES_ENABLED` is true, the log line MUST be at WARN level so a production-deploy leak (either env var accidentally set) is visible in standard log aggregation. This is defense-in-depth — the deploy-pipeline check is the primary control; the WARN is the second layer that makes a slipped check observable instead of silent.

7. **Cross-link contract with related ADRs.**
   - [ADR-0001](0001-networking-crdt-over-relay.md) defines the relay's role as a content-blind sync conduit and admission point. The test-only surfaces here MUST NOT extend the relay beyond that role — they accelerate or shrink behaviors already in scope; they do not give the relay new responsibilities (no message inspection, no content modification, no off-protocol channels).
   - [ADR-0009](0009-access-control-relay-tokens.md) is the admission-control authority. This ADR is a constraint on it: nothing in this file is permitted to weaken what ADR-0009 enforces.
   - [ADR-0024](0024-participant-cap.md) defines the cap value (20). `HNCH_ROOM_CAP` is the test-only knob that lowers (never raises) it.
   - [ADR-0012](0012-snapshot-policy.md) defines the natural eviction policy. `DELETE /test/rooms/:uuid` is the test-only accelerator of that policy, not a different policy.

## Options Considered

### Option A: env-var-gated test surfaces in the same binary (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Test/prod divergence risk | Low — tests and prod run the same binary |
| Security surface | Small but non-zero (env var on prod = bug) |
| CI complexity | Low — one binary, one container, one image |
| Team familiarity | High — standard pattern |

**Pros:** the e2e tests exercise the actual production code path; there is no "test relay" build artifact whose admission logic could drift from the real one. The env vars are easy to grep for and audit. Default-off semantics mean a forgotten env var on a dev box doesn't ship anywhere.
**Cons:** the production binary contains code paths that should never run in production. Mitigated by (a) read-once-at-boot, so there is no runtime way to flip the gate, and (b) the deploy-pipeline check that env vars are unset.

### Option B: separate test-relay binary

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium-high — two build targets, two Dockerfiles, two CI lanes |
| Test/prod divergence risk | Real — admission logic could drift and tests would not catch it |
| Security surface | Smaller in production binary |
| CI complexity | Higher |
| Team familiarity | Moderate |

**Pros:** the production binary does not contain any test-only code. There is no env-var gate to misconfigure.
**Cons:** the relay's admission-and-cap logic is the security-critical core of ADR-0009 and ADR-0024. Splitting it across two binaries means the e2e suite no longer tests the binary that production runs. The CI overhead and divergence risk outweigh the gain at the current relay size (one file, ~500 lines).

### Option C: build-time conditional compilation (`#ifdef TEST_BUILD`)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — TS doesn't natively support this; needs a build-step substitution |
| Test/prod divergence risk | Same as Option B |
| Security surface | Smallest in production binary |
| CI complexity | Higher |
| Team familiarity | Lower in a TS/Node codebase |

**Pros:** the test-only code is genuinely absent from the shipped artifact, not merely inert.
**Cons:** TypeScript has no `#ifdef`. Implementing this would mean a custom build pipeline (esbuild substitution, two `tsconfig.json`s, or similar). Same divergence risk as B. The complexity is not justified for two env vars.

### Option D: in-process feature flag service / admin endpoint

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Test/prod divergence risk | Low |
| Security surface | **Largest** — runtime-flippable admission behavior |
| CI complexity | Medium |
| Team familiarity | Standard for large products, overkill here |

**Pros:** runtime control without redeploy.
**Cons:** the runtime-flippable surface is the worst possible security posture for an admission-authority binary. An attacker who reaches the admin endpoint flips off the cap or auth at will. Boot-time read-once is strictly safer.

## Trade-off Analysis

Option A wins on the principle that the e2e suite must exercise the real binary. Splitting binaries (B) or compile-time-stripping (C) buys a marginal "no test code in production" win at the cost of test/prod divergence in the security-critical core. Option D's runtime-flippable posture is the wrong direction entirely for an admission authority.

The "small but non-zero" production-binary surface in A is the cost we accept. The mitigations are: read-once-at-boot (no runtime flipping), default-off (unset = production-safe), clamp-only-down (cap can only get smaller, never larger), `404`-fall-through (the gate is invisible to outside probing), and a deploy-pipeline check (responsibility lives where it belongs).

The forward-only "use `_TEST_` in the name" rule is a small concession to readability. We are grandfathering `HNCH_ROOM_CAP` because renaming it now would force a coordinated change across the binary, the e2e config, and the test files for no security gain — the rule's purpose is to make *future* contributors' env vars self-documenting.

## Consequences

**Easier:**
- The e2e suite tests the real binary, not a fork. ADR-0009 and ADR-0024 enforcement is exercised in CI.
- Adding a new test-only env var has a clear pattern: gate it with `_TEST_` in the name, default-off, document its exact contract in this ADR or a successor, list it in the deploy-pipeline-must-be-unset check.
- Auditing the test-only surface is `grep -r 'process.env\[.*HNCH_' packages/relay/src/`.

**Harder:**
- Adding a new test-only env var requires either an addition to this ADR (typo-class, if it stays inside the rules) or a new ADR (substantive, if it stretches the rules — e.g., the first var that touches authentication semantics).
- Deploy-time vigilance is non-negotiable. A staging box that accidentally inherits `HNCH_ROOM_CAP=3` from a CI runner caps real users at three per room. The guardrails are "deploy pipeline must check"; there is no in-binary refusal.
- The "is the test-only path correct?" question becomes a code-review concern at the PR level — the env-var gate is a runtime check, not a type-system one.

**Revisit triggers:**
- A new test env var that genuinely needs to weaken admission (e.g., a fuzzer that wants to skip rate-limiting). Do not add it under this ADR; write a successor with an explicit threat model.
- The relay growing beyond a single binary (e.g., a separate snapshot service). Reconsider Option B at that point — the divergence risk shrinks when the security-critical core is its own service.
- A real "tiny private deployment" use-case for `HNCH_ROOM_CAP` (i.e., legitimate non-test reason to lower the cap in production). Revisit whether the var deserves a non-test reading; document the tradeoff explicitly.
- A reconnaissance-class attack pattern that fingerprints whether `/test/rooms/:uuid` returns 404 from the gate vs. from genuine absence. The current `404`-from-both is the mitigation; if it ever leaks (e.g., timing differences become observable), revisit.

## Action Items

- [ ] Once accepted, update [`adr/README.md`](README.md) index with this entry as ADR-0027.
- [ ] Update CLAUDE.md "Current decisions at a glance" with a one-liner referencing the test-only relay env-var posture.
- [ ] Cross-link from [ADR-0001](0001-networking-crdt-over-relay.md) (typo-class addition) noting that the test-only env-var-gated surfaces on the relay are constrained by this ADR not to extend the relay's role beyond ADR-0001's content-blind admission posture.
- [ ] Cross-link from [ADR-0009](0009-access-control-relay-tokens.md) (typo-class addition) noting that test-only env-var-gated surfaces exist on the relay and MUST NOT weaken what ADR-0009 enforces.
- [ ] Cross-link from [ADR-0024](0024-participant-cap.md) (typo-class addition) replacing the forward-reference to "ADR-0025 (test-only relay surfaces)" with the correct ADR-0027 number.
- [ ] Cross-link from [ADR-0012](0012-snapshot-policy.md) (typo-class addition) noting that `DELETE /test/rooms/:uuid` is a test-only accelerator of the natural eviction policy when `HNCH_ENABLE_TEST_ROUTES=1`.
- [ ] Typo-class fix to [ADR-0025](0025-reconnect-backoff.md): its reader-disruption note (which previously could not name this ADR by number) can now point to the correct ADR-0027 number once this ADR lands.
- [ ] Confirm the deploy / ops checklist (CI or deploy script) verifies that neither `HNCH_ENABLE_TEST_ROUTES` nor `HNCH_ROOM_CAP` is set in production environments. If no such check exists, file it as an ops follow-up.
- [ ] Confirm the relay's startup log surfaces the effective `ROOM_CAP` and `TEST_ROUTES_ENABLED` state, with WARN level when either is in non-production configuration. If absent, file as a relay impl follow-up.
- [ ] Verify the `404 not-found` from `DELETE /test/rooms/:uuid` is byte-identical (status, body, headers) regardless of whether the gate is off or the UUID is unknown — document the equivalence in `packages/relay/src/server.test.ts` if not already.
- [ ] Code fix: malformed UUID on `DELETE /test/rooms/:uuid` should return `404 not-found`, not `400 bad-uuid`, to match the gate-off response. Currently leaks the gate's existence (`400` is observable when `HNCH_ENABLE_TEST_ROUTES=1`; `404` when off). Tracked under impl task T30.
- [ ] Consider iterating live sockets in `RoomStore.deleteRoom` and emitting `ws.close(4001, 'unknown-room')` for protocol cleanliness. Currently the relay relies on the doc-destroy cascade, which triggers default close codes (`1006`/`1011`) rather than the structured `4001`. The reconnect path lands on the same UX either way ([ADR-0022](0022-last-session-cache.md) cache eviction + "session expired"), so this is out of scope for v1 unless the CLI or mobile client observe issues with default close codes.
