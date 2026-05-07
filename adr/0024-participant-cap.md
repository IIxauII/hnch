# ADR-0024: Participant cap — 20-peer hard limit, relay-enforced

**Status:** Accepted
**Date:** 2026-04-26

## Context

- ADR-0001 sized architecture for "≤20 peers" — assumption, not contract.
- Implementation hardened it: `MAX_ROOM_PARTICIPANTS = 20` in `packages/shared/src/auth.ts:105`; relay (`packages/relay/src/server.ts:294-300`) closes 21st socket with `4006 / room-full`; e2e exercises via `HNCH_ROOM_CAP=3`.
- ADR-0016 close-code table marked `4006` "reserved; unused in v1" — now stale. Per immutability, fix via new ADR + cross-link, not inline edit.
- Three structural choices to pin: enforcement location, number, rejection UX.

## Decision

1. **Hard cap: 20 — voters + viewers combined.** `MAX_ROOM_PARTICIPANTS` is canonical. Cap counts every connection regardless of ADR-0020 role (cost being capped is awareness churn + sync overhead, not vote denominator). 20 = formalization of ADR-0001 sizing. Headroom for 5–12 team + observers; 30+ all-hands explicitly out of v1.
2. **Enforcement: relay-only, at WS upgrade, immediate.** Relay completes upgrade then closes `4006`. No client soft-cap (drift hazard, awareness counts stale). No queue/waitlist. Fires *after* ADR-0009 credential check so wrong-password reports as wrong-password even when full.
3. **Activates close code 4006.** ADR-0016's "reserved; unused" is superseded by this ADR via cross-link, not inline edit (immutability).
4. **Test-only configurability:** `HNCH_ROOM_CAP` env var clamped `[1, MAX_ROOM_PARTICIPANTS]` — can only *lower*. Production deploy MUST leave unset. Broader env-var posture per ADR-0027.
5. **UX on rejection:** "Room is full" wording, distinguishable from `4001 / unknown-room` ("session expired") + `4002 / wrong-password` ("incorrect password") — three reject reasons drive three recovery paths. Mapped via `JoinRejectionReason` in `@hnch/shared`; mobile renders via mapping, CLI prints + exits non-zero.

## Options

- **A — Relay-only at WS upgrade, 4006 (chosen):** Pros: relay only authority on live count; client-runtime-agnostic; structured close code. Cons: rejected peer pays one round-trip (same as every other ADR-0016 rejection).
- **B — Client soft-cap + relay hard-cap:** Pros: instant client feedback. Cons: client never reliably knows live count (awareness lag); two enforcement points = drift hazard; saved round-trip rare.
- **C — No cap:** Pros: simplest. Cons: ADR-0001 sized for ≤20; gradual degradation (partial sync, missed votes); trivial DoS via 200 sockets.
- **D — Higher cap (50/100):** Pros: larger sessions accommodated. Cons: exceeds architecture sizing; raising later is safe + easy, lowering breaks active sessions — pick conservative.

## Trade-offs

- Cap counts raw sockets, not unique `did` — multi-tab use is real + `did` is client-supplied (ADR-0005) so dedup is bypassable hygiene-theater.
- `HNCH_ROOM_CAP` = admission-controlling env var in production binary. Misconfigured staging deploy could lower cap. Deploy hygiene needed (out of scope here, in scope for ADR-0027).
- Lowering cap mid-session leaves above-cap peers connected (check fires on upgrade only).
- **Occupancy oracle for unprotected rooms:** WS upgrade succeeds before `4006` close vs `404 / unknown-room` raw HTTP close are wire-distinguishable. Attacker with code can detect "exists + full" vs "exists + space". Severity medium — ADR-0008 6-char code space already enumerable, just changes leak kind. Password-protected rooms gate via ADR-0009 ordering.

## Consequences

- Easier: enforcement in one place (`packages/relay/src/server.ts:297-300`); new clients inherit cap; 4006 has canonical home.
- Harder: lowering cap mid-session unsafe; ops must verify `HNCH_ROOM_CAP` unset; no queue/waitlist UX; occupancy oracle on unprotected rooms.
- Revisit when: demand for >20 sessions → successor ADR after re-validating broadcast cost; DoS via cap-as-oracle → rate-limit/jitter `4006` (no new ADR if wire unchanged); per-room cap → new ADR (touches schema + per-room state); env-var posture grows → fold into ADR-0027.

## Action Items

- [ ] Update CLAUDE.md "Current decisions at a glance".
- [ ] Cross-link ADR-0016 (4006 activated, **T17**), ADR-0001 (cap is enforced contract), ADR-0009 (cap fires post-credential).
- [ ] **T26/T27 typo fix:** `packages/shared/src/auth.ts:57` (T26) + `packages/relay/src/server.ts:294` (T27) cite "ADR-0020" for cap; update to this ADR.
- [ ] Verify e2e `room-full.spec.ts` asserts via `JOIN_REJECTION_CLOSE_CODES['room-full']`.
- [ ] Confirm "Room is full" copy distinct from `unknown-room` + `wrong-password`; deploy checklist verifies `HNCH_ROOM_CAP` unset in prod (ADR-0027 scope).
- [ ] Defense-in-depth: log effective `ROOM_CAP` at relay startup; WARN if < `MAX_ROOM_PARTICIPANTS`.
