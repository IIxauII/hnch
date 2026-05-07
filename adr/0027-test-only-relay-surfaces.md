# ADR-0027: Test-only relay surfaces — `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP`

**Status:** Accepted
**Date:** 2026-04-26

## Context

- Relay binary is the only hnch infrastructure on the public internet; sole admission-control authority per [ADR-0009](0009-access-control-relay-tokens.md) + [ADR-0024](0024-participant-cap.md).
- Two env-var-gated test surfaces grew in to support Playwright e2e:
  - `HNCH_ENABLE_TEST_ROUTES='1'` registers `DELETE /test/rooms/:uuid` to evict a room (simulate snapshot-TTL expiry without 24 h wait). Used by `expired-jump-back-in.spec.ts`.
  - `HNCH_ROOM_CAP=N` lowers the participant cap below the production default of 20. Used by `room-full.spec.ts` (set to `'3'`).
- Both read once at module load; no runtime flip; no admin endpoint.
- Need recorded standard for what test-only env vars are acceptable so next contributor doesn't bolt on "skip-auth-for-dev".

## Decision

Env-var-gated test surfaces in the production binary are permitted. Default-off, fail-safe: unset/non-`'1'` → routes 404; cap unset/invalid/zero/negative → 20; values clamped — env can only lower cap. Read-once-at-boot. Future test-only vars SHOULD use `_TEST_` infix (`HNCH_ROOM_CAP` grandfathered). Test surfaces MAY accelerate timeline / lower limits; MUST NOT bypass auth, disclose room contents off-protocol, persist outside in-memory store, or open new listeners. `DELETE /test/rooms/:uuid` returns 404 indistinguishable from unknown route whether gate off or UUID unknown. Deploy pipeline responsible for verifying neither var is set in prod; relay logs effective values at WARN when non-prod config detected. `/health` does NOT report gate state.

## Options

- **A — Env-var-gated in same binary (chosen):** Pros: e2e tests exercise real binary; ADR-0009/0024 enforcement covered in CI; one image. Cons: small non-zero prod-binary surface (mitigated by read-once + default-off + clamp-only-down + deploy check).
- **B — Separate test-relay binary:** Pros: zero test code in prod binary. Cons: admission logic could drift between binaries; CI overhead; e2e no longer tests prod artifact.
- **C — Build-time conditional (`#ifdef`):** Pros: test code genuinely absent from artifact. Cons: TS has no `#ifdef`; needs custom build pipeline; same divergence risk as B; complexity unjustified.
- **D — Runtime feature-flag service / admin endpoint:** Pros: no redeploy. Cons: runtime-flippable admission is the worst posture for an admission authority; attacker reaching endpoint flips off auth.

## Trade-offs

- Prod binary contains code paths that should never run in prod — accepted cost.
- Mitigations: read-once-at-boot, default-off, clamp-only-down, 404-fall-through, deploy-pipeline check, WARN-level boot logs.
- Forward-only `_TEST_` naming rule — `HNCH_ROOM_CAP` grandfathered (renaming = coordinated change for no security gain).

## Consequences

- Easier: e2e tests real binary; audit via `grep 'process.env\[.*HNCH_' packages/relay/src/`; new test vars follow clear pattern.
- Harder: deploy-time vigilance non-negotiable (no in-binary refusal); new test var that weakens admission needs successor ADR with threat model.
- Revisit when: var needs to weaken admission (write successor); relay grows beyond single binary (reconsider Option B); legitimate non-test reason to lower cap; gate-fingerprinting attack pattern.

## Action Items

- [ ] Code fix: malformed UUID on `DELETE /test/rooms/:uuid` returns `400 bad-uuid` when gate on; should return `404 not-found` to match gate-off response (currently leaks gate existence).
- [ ] Verify deploy/ops checklist enforces neither var set in prod.
- [ ] Verify relay startup logs effective `ROOM_CAP` / `TEST_ROUTES_ENABLED` at WARN when non-prod.
- [ ] Verify `404 not-found` is byte-identical (status, body, headers) gate-off vs unknown-UUID; document in `server.test.ts`.
- [ ] Consider iterating live sockets in `RoomStore.deleteRoom` to emit `4001 unknown-room` instead of relying on doc-destroy cascade (default `1006`/`1011`). Out of scope for v1 — same UX via [ADR-0022](0022-last-session-cache.md) cache-eviction path.
