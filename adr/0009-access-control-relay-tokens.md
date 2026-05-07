# ADR-0009: Access control enforced at the relay via opaque tokens

**Status:** Accepted
**Date:** 2026-04-21

> **Status update (post [ADR-0017](0017-password-hashing-drop-invite-only.md)):** Invite-only dropped from v1; password-only enforcement is live. Invite-token sections below describe possible future re-introduction, not current code.

## Context

- `project.md` lists two optional access modes: password-protected and invite-only.
- ADR-0001: relay is content-blind — forwards opaque Yjs updates, does not parse session data.
- Client-side enforcement fails — modified client ignores gate and still receives traffic.

## Decision

Access control **enforced at the relay via opaque join tokens**. Relay holds minimal per-room metadata (password hash if set, set of outstanding single-use invite tokens with expiries), validates at socket-join. Relay stays content-blind — tokens opaque to its semantics. Password rooms: host registers hash on creation (plaintext never leaves client); joiners submit same hash. Invite rooms: host's client mints short-lived single-use tokens, delivered out-of-band; relay accepts valid unexpired unused token, marks redeemed.

## Options

- **A — Fully client-side enforcement:** simplest, relay pure. Cons: trivially bypassed by modified client → not a gate, just UX steering. Rejected.
- **B — Relay-enforced opaque tokens (chosen):** real gates, relay still content-blind, plaintext never reaches server, single-use tokens self-destruct. Cons: small admission-control state per active room; invite flow needs host↔joiner messaging path.
- **C — Hybrid (relay passwords, client invites):** simpler than B. Cons: inconsistent security model; invite-only becomes theatre again.
- **D — Authoritative session server:** classical auth, audit logs. Cons: contradicts ADR-0001; overkill for threat model.

## Trade-offs

- Relay no longer purely stateless — small per-room admission state.
- Relay memory grows linearly with active rooms × outstanding tokens — trivial at target scale.
- Invite flow requires protocol design (request → approve → token issuance → reconnect).

## Consequences

- Easier: real protection for users who opt-in; plaintext passwords never reach relay; leaked invite links self-destruct.
- Harder: "room exists for access purposes" vs "room has clients" become distinct states.
- Revisit when: granular permissions (voter/viewer at admission) needed → extend token with role payload via superseding ADR; vote integrity work → bind tokens to signed identities.

## Action Items

- [ ] Extend relay model: `rooms[uuid] = { code, passwordHash?, invitesOutstanding: Set<token>, snapshot? }`.
- [ ] Design invite flow protocol (request → approve → token delivery).
- [ ] Choose client password-hash scheme (argon2id WASM sensible default).
