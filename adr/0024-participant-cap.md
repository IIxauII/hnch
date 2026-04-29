# ADR-0024: Participant cap — 20-peer hard limit, relay-enforced

**Status:** Accepted
**Date:** 2026-04-26
**Deciders:** Xau

## Context

[ADR-0001](0001-networking-crdt-over-relay.md) committed us to CRDT sync over a content-blind relay and noted in passing that the architecture is "fine at ≤20 peers" — a sizing assumption, not a contract. As the implementation matured, that assumption hardened into an enforced limit:

- `packages/shared/src/auth.ts:105` exports `MAX_ROOM_PARTICIPANTS = 20`.
- The relay (`packages/relay/src/server.ts:294-300`) checks the room's connection count at WebSocket upgrade time and closes the socket with code `4006 / room-full` if accepting it would push the room past the cap.
- `packages/shared/src/auth.ts:88` maps `room-full` to close code `4006` in the `JoinRejectionReason` table.
- The Playwright e2e suite exercises the cap with `HNCH_ROOM_CAP=3` (`packages/e2e/playwright.config.ts:29`).

[ADR-0016](0016-client-relay-connection-handshake.md)'s close-code table reserved `4006` with the note "reserved; unused in v1". That note is now stale: the code is canonically active. Per [`adr/README.md`](README.md)'s immutability convention ("substantive change requires a new ADR"), the right way to resolve the staleness is **not** to inline-edit ADR-0016 but to write the ADR that activates the code and let ADR-0016 cross-link to it.

This ADR also pins three structural choices a reasonable contributor could have made differently: where the cap is enforced (relay vs client soft-cap vs both), what number is chosen, and what the user sees on rejection.

## Decision

1. **Hard cap: 20 participants per room — voters and viewers combined.** `MAX_ROOM_PARTICIPANTS = 20` in [`packages/shared/src/auth.ts`](../packages/shared/src/auth.ts) is the single canonical value. The cap counts every connected participant regardless of [ADR-0020](0020-participant-viewer-voter-role.md) role: a viewer occupies a slot identically to a voter because the underlying cost being capped is the per-connection awareness churn and sync overhead, not the per-vote denominator. The number 20 derives directly from [ADR-0001](0001-networking-crdt-over-relay.md)'s sizing assumption — it is not a fresh choice in this ADR; it is the formalization of an existing one. Rationale: Yjs awareness payloads and the relay's broadcast cost grow with peer count, and 20 is comfortable headroom for typical agile teams (5–12) plus observers, with margin before sync degradation. All-hands-style 30+ sessions are explicitly out of scope for v1.

2. **Enforcement: relay-only, at WS upgrade, immediate.** The cap is enforced at the WebSocket upgrade in the relay (`packages/relay/src/server.ts`). On exceeding the cap, the relay completes the upgrade and immediately closes the socket with WS code `4006 / room-full` so the client receives a structured rejection through the [ADR-0016](0016-client-relay-connection-handshake.md) close-code path rather than a raw HTTP 403. There is **no client-side soft cap** — the relay is the single source of truth, and adding a parallel client check would create a drift hazard. The check is per-attempt, not queued: if the room already holds 20 connections, the 21st attempt closes immediately with 4006; existing peers are unaffected; when any peer disconnects the slot frees on the relay's connection-count decrement and the next attempt accepts. There is no waitlist and no "you're next" UX — this is admission, not a queue. Admission flow chains with the [ADR-0009](0009-access-control-relay-tokens.md) credential check (the cap fires only after credentials pass) so a wrong-password attempt is told it's wrong-password, not room-full, even when the room is also full.

3. **Canonically activates close code 4006.** [ADR-0016](0016-client-relay-connection-handshake.md)'s close-code table marks `4006 / room-full` as "reserved; unused in v1". This ADR makes 4006 active. ADR-0016 itself is **not** edited (immutability); a one-line cross-link from ADR-0016's close-code table to this ADR resolves the staleness within typo-class scope. Future readers landing on ADR-0016 will follow the cross-link to find the canonical activation here.

4. **Test-only configurability.** The cap can be lowered (never raised) via the `HNCH_ROOM_CAP` environment variable, which the relay clamps to `[1, MAX_ROOM_PARTICIPANTS]`. This exists exclusively to let the e2e suite verify the rejection path with three connections instead of twenty. It is **not** a production knob; deployment configuration **MUST** leave `HNCH_ROOM_CAP` unset in production. The broader posture on env-var-controlled admission behavior (this variable plus `HNCH_ENABLE_TEST_ROUTES`) is governed by [ADR-0027](0027-test-only-relay-surfaces.md) (test-only relay surfaces); this ADR only records the cap-related half of that surface.

5. **UX on rejection.** A rejected client surfaces "Room is full" wording rather than the raw close-code label, and that wording must be **distinguishable** from `4001 / unknown-room` ("session expired" / "no such room") and `4002 / wrong-password` ("incorrect password") — three different recovery paths the user takes (try later, try a different code, retype the password) require three different messages. The mobile client renders this via the existing `JoinRejectionReason` mapping; the CLI prints a single-line message and exits non-zero (`packages/cli/src/index.ts:133` and `:241`). Both clients map the rejection through `@hnch/shared`'s table so wording change is one place, not two.

## Options Considered

### Option A: Relay-only enforcement at WS upgrade, close code 4006 (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — one check at upgrade |
| Source of truth | Single (relay) |
| Spoofability | None — client-side bypass impossible |
| Failure mode | Structured close code via [ADR-0016](0016-client-relay-connection-handshake.md) |
| Team familiarity | Standard |

**Pros:** the relay is the only component that knows the live connection count for a room, so it is the only correct place to enforce the cap. The decision is enforced regardless of which client is connecting (mobile, CLI, future). The check at upgrade time means the rejected peer never enters the room's connection-count denominator. The structured close code keeps client UX one-table-lookup wide.
**Cons:** the rejected peer pays one round-trip (resolve + connect-and-fail) instead of being told up-front. Acceptable — that's the same shape as every other [ADR-0016](0016-client-relay-connection-handshake.md) rejection. The relay must keep accurate connection counts even across abnormal disconnects; this is plumbing it already has.

### Option B: Client-side soft cap as a hint, relay-side hard cap as the enforcer

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Source of truth | Two (relay authoritative, client courtesy) |
| Spoofability | Client check is bypassable; relay backstops |
| Failure mode | Faster client UX, same backstop |
| Team familiarity | Standard |

**Pros:** the client could refuse to even attempt a join when it knows the room is at cap, saving the round-trip and giving instant feedback.
**Cons:** the client never reliably *knows* the live count — awareness is eventually consistent and reflects what the relay last forwarded, which is not what the relay knows *right now*. A client soft-cap based on stale counts would either reject valid joins (bad) or fail to reject some over-cap joins (no benefit over Option A). Two enforcement points also create a drift hazard if the constants ever diverge between relay and client. The "round-trip saved" is paid once per overflow attempt — rare in practice — and not worth the complexity.

### Option C: No cap; let it scale until it breaks

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest |
| Source of truth | None |
| Spoofability | N/A |
| Failure mode | Unbounded — performance degradation, awareness flood |
| Team familiarity | Standard |

**Pros:** the simplest possible implementation; caps are a future concern.
**Cons:** [ADR-0001](0001-networking-crdt-over-relay.md) explicitly sizes the architecture for ≤20 peers. Beyond that, awareness payloads grow, the relay's broadcast cost grows, and the doc's update frequency can saturate slow clients. The failure mode is gradual and unpleasant — partial sync, missed votes, slow reveals — not a clean rejection. A targeted DoS (open 200 sockets to the same room) becomes trivial. We accept the trade-off of ADR-0001's sizing only by enforcing it.

### Option D: Higher cap (e.g., 50 or 100)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Same as A |
| Source of truth | Same as A |
| Spoofability | Same as A |
| Failure mode | Same shape, larger blast radius |
| Team familiarity | Standard |

**Pros:** larger teams or "all-hands estimation" sessions would not hit the cap.
**Cons:** the underlying sizing assumption in [ADR-0001](0001-networking-crdt-over-relay.md) is "small product/engineering team meeting." Pointing-poker is a turn-taking activity; ≥20 peers reading and voting in real time is already past the social ceiling for a useful estimation session. Choosing a number higher than the architecture is sized for would either force re-validating the relay's broadcast cost or sit as latent debt. We can raise the cap in a future ADR if real demand appears; raising is easier than lowering (no existing-room invalidation).

## Trade-off Analysis

Option A is the obvious answer once you accept that the relay is the only component with authoritative knowledge of the connection count. Options B and C each fail in characteristic ways: B by adding a stale, drift-prone second enforcement point that doesn't actually help the user; C by deferring a problem that ADR-0001 already named.

Choosing 20 over Option D's higher number is deliberate conservatism. The cap can always be raised; rooms already accepted at the lower limit aren't invalidated by raising it later. Rooms accepted at a higher limit, by contrast, would be unhappy to discover the cap was tightened mid-session if we ever discovered the relay struggled at scale. Picking the smaller number that matches the architecture's sizing assumption preserves the option to grow.

The "test-only `HNCH_ROOM_CAP`" lever is recorded here rather than left implicit because production code reading an env var that controls admission behavior is structurally close to the security-adjacent concern flagged in the audit's M7 item. The clamp to `[1, MAX_ROOM_PARTICIPANTS]` ensures the lever can only *lower* the cap — production cannot accidentally raise it by setting the env var. The deploy-time check that `HNCH_ROOM_CAP` is unset belongs in operational tooling, not the relay itself.

The decision to canonically activate 4006 here rather than inline-editing [ADR-0016](0016-client-relay-connection-handshake.md) is purely an immutability-respecting choice. The signal is identical either way; the path matters because future contributors need to trust that a sealed ADR is sealed. A new ADR with a back-cross-link from the older one is the established pattern in this folder.

## Consequences

**Easier:**
- The cap is enforced by exactly one piece of code (`packages/relay/src/server.ts:297-300`). Future protocol changes that touch admission can audit one location.
- A client that wants to know whether a room is full can attempt to connect and read the close code; the answer is authoritative because the relay's count is authoritative.
- New clients (CLI today, anything future) inherit the cap without writing their own enforcement — they only need to handle the rejection.
- The 4006 close code finally has a canonical home. Anyone tracing a rejection from logs or close-code observation has one place to land.

**Harder:**
- Lowering the cap below an active session is unsafe — peers above the new cap stay connected (the check fires only on upgrade) and would only be "excess" if they reconnected. A future ADR that lowers the cap will need to define the eviction strategy for already-connected peers, or accept the in-flight inconsistency.
- The `HNCH_ROOM_CAP` env var is admission-behavior-controlling code in the production binary. Deployment hygiene matters; a misconfigured staging deploy could lower the cap unintentionally. The deploy-time check is in scope for whoever owns the ops surface, not enforced by the relay.
- "Room is full" is the only signal; we do not currently surface "this room had N participants and you'd be the (N+1)th". If we ever add a queue / waitlist, this ADR will be one of the load-bearing inputs.
- **Occupancy oracle for unprotected rooms.** The `4006` close path requires the WebSocket upgrade to succeed before the cap check fires; the `404 / unknown-room` path closes raw HTTP at the upgrade itself. The two are observably distinct on the wire. So an attacker who knows a room code can detect "room exists AND is full" vs "room exists AND has space" by whether the WS upgrade completes before close. For public unprotected rooms this leaks occupancy state without credentials. Severity is **medium**, not high, because the [ADR-0008](0008-room-code-format.md) 6-character alphanumeric room-code space is already enumerable; this ADR doesn't widen that exposure structurally, only changes the kind of information leaked. Password-protected rooms gate the oracle behind credential success per the [ADR-0009](0009-access-control-relay-tokens.md) ordering, so the leak is unprotected-rooms-only. Future mitigations (rate-limit / jitter on rejections) live in the Revisit triggers below.
- **Connection-count semantics — by raw socket, not unique device.** The cap counts connections, not unique deviceIds. A single `did` opening 20 concurrent sockets fills the room. We considered dedup-by-`did` and rejected it because (a) legitimate multi-tab use is real (a participant with a phone *and* a laptop is normal), and (b) `did` is client-supplied per [ADR-0005](0005-device-identity-capacitor-device-plugin.md) and trivially spoofable, so dedup would inconvenience honest multi-tab users without stopping a determined attacker who can rotate the field. Connection-level rate limiting at the relay or upstream is the correct mitigation if real abuse appears; that is out of scope for this ADR but tracked under the Revisit triggers.

**Revisit triggers:**
- Real demand for >20 peer sessions (e.g., all-hands estimation) → write a successor ADR raising the cap, after re-validating relay broadcast cost and awareness-payload size at the new ceiling.
- Measured DoS attempts using the cap as an oracle (probing many room codes for "full" responses) → consider rate-limiting `4006` rejections at the relay, or jittering them; would not require a new ADR if the wire shape is unchanged.
- Demand for per-room cap configuration (e.g., paid plans with larger rooms) → would need a new ADR; the cap is currently a global constant and per-room tuning would touch the doc schema and the relay's per-room state.
- The `HNCH_ROOM_CAP` env var becoming the only env var of its kind, or becoming numerous → fold the broader admission-env-var posture into [ADR-0027](0027-test-only-relay-surfaces.md) (test-only relay surfaces).

## Action Items

- [ ] Once accepted, update `adr/README.md` index with this entry.
- [ ] Update CLAUDE.md "Current decisions at a glance" with a one-liner referencing the cap and 4006 activation.
- [ ] Cross-link from [ADR-0016](0016-client-relay-connection-handshake.md) (typo-class addition, **tracked as audit T17**) at the close-code table noting that `4006 / room-full` is canonically activated by this ADR and the "reserved; unused in v1" note is superseded.
- [ ] Cross-link from [ADR-0001](0001-networking-crdt-over-relay.md) (typo-class addition) noting that the "≤20 peers" sizing assumption is now an enforced contract per this ADR.
- [ ] Cross-link from [ADR-0009](0009-access-control-relay-tokens.md) (typo-class addition) noting that the cap fires after the ADR-0009 credential check at the relay, so cap rejections are reported as `room-full` rather than masking `wrong-password` for the same room.
- [ ] **Typo-class fix tracked under impl follow-ups (T26 + T27):** two sites mistakenly cite "ADR-0020" as the cap rationale; ADR-0020 is the viewer/voter role. Update both to reference this ADR once accepted:
  - `packages/shared/src/auth.ts:57` (JSDoc on `JoinRejectionReason` for `room-full`) — tracked under T26.
  - `packages/relay/src/server.ts:294` (comment on the cap-enforcement block) — tracked under T27.
- [ ] Verify that the e2e suite exercises the `4006 / room-full` rejection path end-to-end (a `room-full.spec.ts` already exists per the audit; confirm it asserts on the close code through `JOIN_REJECTION_CLOSE_CODES['room-full']` rather than an opaque "rejection" assertion).
- [ ] Confirm the "Room is full" copy in mobile + CLI is distinguishable from the `unknown-room` and `wrong-password` strings — three different rejection reasons must drive three different user actions.
- [ ] Confirm the deploy / ops checklist (CI or deploy script) verifies `HNCH_ROOM_CAP` is unset in production environments. If no such check exists, file it as an ops follow-up — out of scope for this ADR but in scope for [ADR-0027](0027-test-only-relay-surfaces.md).
- [ ] **Defense-in-depth: log effective `ROOM_CAP` at relay startup.** Emit a single structured log line at boot with the resolved cap; if the resolved cap is less than `MAX_ROOM_PARTICIPANTS`, emit at WARN level so operators detect a leaking test-mode env var in production logs. This complements the deploy-time unset check rather than replacing it.
- [ ] Once [ADR-0027](0027-test-only-relay-surfaces.md) (test-only relay surfaces) lands, verify §4 here cross-links to it and the env-var posture is consistent.
