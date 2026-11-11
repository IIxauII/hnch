# ADR-0060: Handoff claims an unset access holder

**Status:** Accepted
**Date:** 2026-11-11

Partially supersedes ADR-0059's "Holder-only" handoff clause. Builds on ADR-0010, ADR-0048, ADR-0059.

## Context

- ADR-0059 makes `POST /rooms/:uuid/host` "Holder-only"; only PATCH can claim an unset holder: "**Claim:** with holder unset, PATCH from caller C that is bound, uncontested, has an open bound socket, and equals doc's `hostParticipantId` (present, string) → holder = C, then PATCH applied. Covers election winner and pre-deploy rooms."
- Holder is unset in common cases: after lapse + ADR-0010/0048 election, after rejoin-lapse, in keyless-created rooms (released CLI), in pre-deploy rooms.
- In all of them doc's legitimate host gets "Only the host can hand off the host role." until they first change password. Client writes `handoffHost` only on `200` (ADR-0059) → no handoff at all.
- Before ADR-0059 any doc host could hand off → regression.
- Owner settled 2026-11-11.

## Decision

Handoff with holder unset claims it on exactly the PATCH claim terms (caller bound, uncontested, open bound socket, equals doc's `hostParticipantId`), then proceeds as a holder's handoff (target bound, uncontested, connected, else `409 { reason: 'bad-target' }`). Claim and move are one write: a handoff refused for `bad-target` leaves holder unset, so a refused handoff changes nothing.

- Refusals unchanged: `401 unauthenticated` / `401 not-host` / `409 bad-target` / `404`.
- Holder set → handoff stays holder-only, as ADR-0059.

## Trade-offs

- Relay now reads doc's `hostParticipantId` at handoff too — slightly wider version of ADR-0059's narrow ADR-0001 departure ("read only at PATCH and at holder rejoin"). Still never trusted alone: forged doc host gains nothing while holder set.
- No new attack: anyone who could claim via PATCH could already claim, then hand off, in two calls.
- Claim + move atomic → one more branch in the handoff synchronous block; test matrix gains unset-holder handoff cases (success, `bad-target` leaves holder unset, contested/unbound/not-doc-host caller).

## Consequences

- Easier: doc host can hand off after any lapse, election, keyless create or pre-deploy room without a password change first; restores pre-ADR-0059 handoff behaviour for legitimate hosts.
- Harder: relay's doc-read surface grows by one call site; handoff and PATCH share claim rule and must stay in lockstep.
- Revisit when: ADR-0059 revisit triggers fire (signed host claims / relay-side election) → claim rule changes for both routes together; ADR-0059 accrues a second partial supersession → consolidate forward.
