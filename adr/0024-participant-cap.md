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

## Trade-offs

- Cap counts raw sockets, not unique `did` — multi-tab use is real + `did` is client-supplied (ADR-0005) so dedup is bypassable hygiene-theater.
- `HNCH_ROOM_CAP` = admission-controlling env var in production binary. Misconfigured staging deploy could lower cap. Deploy hygiene needed (out of scope here, in scope for ADR-0027).
- Lowering cap mid-session leaves above-cap peers connected (check fires on upgrade only).
- **Occupancy oracle for unprotected rooms:** WS upgrade succeeds before `4006` close vs `404 / unknown-room` raw HTTP close are wire-distinguishable. Attacker with code can detect "exists + full" vs "exists + space". Severity medium — ADR-0008 6-char code space already enumerable, just changes leak kind. Password-protected rooms gate via ADR-0009 ordering.

## Consequences

- Easier: enforcement in one place (`packages/relay/src/server.ts:297-300`); new clients inherit cap; 4006 has canonical home.
- Harder: lowering cap mid-session unsafe; ops must verify `HNCH_ROOM_CAP` unset; no queue/waitlist UX; occupancy oracle on unprotected rooms.
- Revisit when: demand for >20 sessions → successor ADR after re-validating broadcast cost; DoS via cap-as-oracle → rate-limit/jitter `4006` (no new ADR if wire unchanged); per-room cap → new ADR (touches schema + per-room state); env-var posture grows → fold into ADR-0027.
