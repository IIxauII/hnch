# ADR-0009: Access control enforced at the relay via opaque tokens

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

> **Status update (post [ADR-0017](0017-password-hashing-drop-invite-only.md)):** Invite-only was dropped from v1; password-only enforcement is the live behavior. The invite-token sections below describe a possible future re-introduction trigger but do not reflect current code.

## Context

`project.md` provides for two optional access-control modes on sessions: **password-protected** (anyone with the password joins) and **invite-only** (the host explicitly admits each joiner). ADR-0001 established that the relay is content-blind — it forwards opaque Yjs updates and does not parse session data. That raises a structural question: if the relay cannot read session content, where do password and invite-only gates actually run?

Client-side enforcement is tempting because it keeps the relay simple, but it fails the most basic security test — a modified or malicious client can ignore the gate and still receive all traffic from the room. For gates that are supposed to be real, not cosmetic, enforcement needs to happen somewhere the user cannot override.

## Decision

Access control is **enforced at the relay via opaque join tokens**. The relay gains a small amount of per-active-room metadata — a password hash (if set) and a set of outstanding single-use invite tokens with expiries — and validates these at socket-join time. The relay remains **content-blind**: it still does not parse session data, user identity, or votes. Tokens are opaque to the relay's semantics; it does not know or care whether a given room's token is a password hash or an invite code.

Specifically:

- **Password-protected rooms:** on session creation, the host registers a password hash with the relay (password itself never leaves the client). Joiners compute the same hash from their entered password and submit it as the join token. The relay accepts or rejects at socket-connect time.
- **Invite-only rooms:** the host's client mints short-lived, single-use invite tokens on admission and delivers them out-of-band (typically via the same link-sharing surface, carrying the token in the URL hash or a join-request handshake). The relay accepts a connection that presents a valid unexpired unused token and marks it redeemed.

## Options Considered

### Option A: Fully client-side enforcement

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None |
| Security | Very weak |
| Team familiarity | Standard |

**Pros:** relay stays pure; no server-side access metadata; simplest to build.
**Cons:** a modified client can ignore the gate and passively receive all session traffic; for invite-only, a rejected joiner can still sniff the doc; this is not access control, it's UX steering. Rejected.

### Option B: Relay-enforced via opaque tokens (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Low — small per-room memory footprint on relay |
| Security | Adequate for the product's threat model |
| Team familiarity | Standard |

**Pros:** gates are real — no way to bypass from the client side; relay is still content-blind; passwords are submitted as hashes so the plaintext never reaches the server; invite tokens can be short-lived and single-use so leaked links expire.
**Cons:** introduces access metadata to the relay (password hash, token set per room); the relay is no longer purely stateless — it now holds a small admission-control state per active room; invite-only flow requires a messaging path between host and joiner for token delivery (handled via the relay's existing message forwarding but still a protocol detail to design).

### Option C: Hybrid — relay enforces passwords, client enforces invites

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Low |
| Security | Mixed |
| Team familiarity | Standard |

**Pros:** simpler than full Option B — passwords are static and easy to validate at the relay, while invite admission can remain in-client.
**Cons:** inconsistent security model confuses users; invite-only becomes theatre again (a rejected joiner sniffs traffic); users who choose "more secure" modes deserve actual security.

### Option D: Move all access control into an authoritative session server

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Cost | High — database, auth stack |
| Security | Strong |
| Team familiarity | Standard |

**Pros:** classical auth model, audit logs, role-based access.
**Cons:** conflicts with ADR-0001's architecture; the relay would become a session server, with all the operational and privacy implications rejected there. Overkill for this threat model.

## Trade-off Analysis

Option B is the right call because the purity we committed to in ADR-0001 is about *session content*, not about *admission*. A relay that validates opaque tokens still has no idea what's in the session. The incremental complexity is contained — per-room metadata in RAM, regenerable from the session's existence — and the security improvement over Option A is decisive.

We deliberately reject Option A despite its simplicity: a "gate that can be bypassed by running the source code with one conditional flipped" is not a gate, and shipping one would be a promise we can't keep.

## Consequences

**Easier:**
- Password and invite-only gates are real — users who need them get actual protection, not theatre.
- Plaintext passwords never reach the relay.
- Single-use invite tokens mean leaked links self-destruct on first use.

**Harder:**
- Relay is slightly more stateful — we must handle "room exists for access-control purposes" separately from "room has connected clients."
- Invite-only flow requires a protocol for host → joiner token delivery through the relay's existing socket (join request → host approval → token issuance → joiner reconnects with token).
- Relay memory grows linearly with active rooms × outstanding invite tokens. At the scale we're targeting, trivial.

**Revisit triggers:**
- If we ever want to enforce more granular permissions (e.g., voter-vs-viewer at admission) the token model can be extended with role payloads — we'd write a superseding ADR at that point.
- If we add vote integrity (future consideration in `project.md`), the authentication layer may need to bind tokens to signed vote identities.

## Action Items

- [ ] Extend the relay data model: `rooms[uuid] = { code, passwordHash?, invitesOutstanding: Set<token>, snapshot? }`.
- [ ] Design the invite flow protocol: how a joiner requests admission, how the host approves, how the token reaches the joiner.
- [ ] Choose a password-hashing scheme on the client (argon2id via a WASM library is the sensible default). Not trying to be cryptographically perfect here — the relay never sees plaintext — but we should still avoid weak hashes.
- [ ] Update `project.md` to explicitly describe access control as *relay-enforced* and to note that the relay is "content-blind" rather than "purely stateless" (already done — verify).
