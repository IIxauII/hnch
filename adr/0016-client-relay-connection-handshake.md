# ADR-0016: Client ↔ relay connection handshake

**Status:** Accepted
**Date:** 2026-04-21
**Deciders:** Xau

## Context

[ADR-0001](0001-networking-crdt-over-relay.md) committed us to a content-blind y-websocket relay; [ADR-0008](0008-room-code-format.md) gave rooms a human-typeable 6-character code backed by a relay-internal UUID; [ADR-0009](0009-access-control-relay-tokens.md) said admission is enforced at the relay via opaque tokens (password hash, single-use invite) presented at socket-connect time; [ADR-0012](0012-snapshot-policy.md) keeps a 24-hour in-memory snapshot per room so the "everyone disconnects then someone returns" case works.

These decisions leave two pieces unspecified:

1. **How does the client turn a 6-character code into something it can connect to?** The relay indexes rooms by UUID, but the human types a code. Resolution can happen out-of-band (a cheap HTTP lookup) or in-band (connect to `/ws/:code` and let the relay map server-side).
2. **How do the `JoinCredentials` defined in [`packages/shared/src/auth.ts`](../packages/shared/src/auth.ts) actually ride the wire?** Query parameters on the WebSocket upgrade URL, a `Sec-WebSocket-Protocol` subprotocol header, or a first app-level JSON frame after the upgrade completes are all viable.

Both questions need the same answer before any relay code lands — the relay's request/response surface, the client's sync-provider factory, and the rejection-mapping UI all depend on it. This is the pre-phase gate called out in [`roadmap.md` §5](../roadmap.md#5-phase-3--relay--multi-client-sync) and in [`plans/phase-3-networking.md` §2.1](../plans/phase-3-networking.md#21-pre-phase-gate--adr-0016-client--relay-connection-handshake).

A narrower question — *how* the snapshot reaches a rehydrating client — is settled by the y-websocket protocol itself (sync-step-1/step-2 run automatically against the relay-side `Y.Doc`), and needs no new design here. This ADR just records that we've checked.

## Decision

The handshake is a two-call pattern over two protocols:

**1. Resolve: `GET {relayUrl}/rooms/:code`.** The client normalizes the user-typed code per [ADR-0008](0008-room-code-format.md) (uppercase, no dashes) and requests `GET /rooms/:code`. The relay responds:

- `200` with `{ uuid: string, accessMode: 'open' | 'password' | 'invite' }` — the code is live and the client can proceed.
- `404` with `{ reason: 'unknown-room' }` — the code is unknown, retired, or outside the snapshot TTL.

No credentials are sent at this step. Resolution is intentionally cheap and content-free so the rejection UX ("that's not a room") doesn't require opening a socket.

**2. Connect: `WS {relayUrl}/ws/:uuid?{credentials}`.** The client opens a WebSocket against `/ws/:uuid` with `JoinCredentials` encoded as URL query parameters:

| Query param | Origin | Present when |
|---|---|---|
| `did` | `JoinCredentials.deviceId` | Always |
| `pw`  | `JoinCredentials.passwordHash` | Password-protected rooms (Phase 5) |
| `inv` | `JoinCredentials.inviteToken` | Invite-only rooms (Phase 5) |

The relay validates the shape synchronously in the HTTP upgrade handler:

- **Malformed credentials** (missing `did`, illegal characters, credential present but not permitted for this room's `accessMode`) → reject the upgrade with HTTP `400` and a short JSON body. No socket is opened.
- **Pre-upgrade room invalidation** (the UUID became unknown between resolve and connect — rare, but possible across the snapshot TTL boundary) → reject with HTTP `404`.
- **Accepted** → complete the upgrade and hand the socket to y-websocket's `setupWSConnection`, bound to the room's `Y.Doc`.

Post-upgrade rejections (e.g., the relay decides after accepting that a credential is stale) close the socket with a private-use close code drawn from the reserved 4000–4099 range:

| Close code | `JoinRejectionReason` |
|---|---|
| `4001` | `unknown-room` |
| `4002` | `wrong-password` (Phase 5) |
| `4003` | `invalid-invite` (Phase 5) |
| `4004` | `expired-invite` (Phase 5) |
| `4005` | `invite-already-redeemed` (Phase 5) |
| `4006` | `room-full` (reserved; unused in v1) |
| `4010` | `malformed-credentials` |

> **Status update:** Close code `4006 (room-full)` was reserved-as-unused at the time this ADR was written. It is now actively used per [ADR-0024](0024-participant-cap.md), which pins the participant cap and enforces it via this close code. The row above is preserved verbatim per the immutability convention; ADR-0024 is the authoritative source for `4006` semantics going forward.

The close frame's `reason` string carries the same enum value as a readable label. The client's sync-provider wrapper maps the close code back to a `JoinResponse { ok: false, reason }` and surfaces the Phase-3 subset of reasons to the UI; Phase-5 reasons land in the same table without a wire-protocol revision.

**Snapshot rehydration is not a new handshake step.** The relay holds a `Y.Doc` in memory per active room ([ADR-0012](0012-snapshot-policy.md)). On every accepted connection, y-websocket's built-in sync-step-1 / sync-step-2 messages run against that `Y.Doc` exactly as they do for a normal update exchange. A returning peer's first sync-step-2 reply is, by construction, the snapshot contents. This ADR pins the observation; nothing protocol-level needs to change.

## Options Considered

### Option A: HTTP resolve + WS connect with query-string credentials (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | One extra HTTP round-trip per join |
| Rejection UX | Cheap — pre-upgrade failures don't open a socket |
| Team familiarity | Standard — y-websocket's default client path already supports URL params |

**Pros:** the `unknown-room` case costs nothing to discover — no socket, no close code, no application-level retry logic. The client's join flow reads like prose: resolve, then connect. The relay can reject at upgrade time with stock HTTP machinery and the rejection is observable in any ordinary access log. Query-string credentials land in y-websocket's default client pathway without a custom transport. The pre-resolve gives the client an `accessMode` hint, which Phase 5's Join Room UI needs to decide whether to render the password input.
**Cons:** two round-trips on the happy path (resolve + connect). Query-string credentials appear in any URL log; acceptable because the credentials are opaque hashes/tokens, not plaintext, and the ADR-0012 relay has no persistent log story. A client that skips resolve and connects directly to `/ws/:uuid` will fail gracefully on unknown UUID — not a security issue, but worth a note.

### Option B: Single-call — connect to `WS /ws/:code` and let the relay map

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — relay does code→UUID inside the upgrade handler |
| Cost | One round-trip total |
| Rejection UX | More expensive — "unknown room" still requires opening a socket |
| Team familiarity | Standard |

**Pros:** fewer round-trips; one endpoint instead of two; no leaked distinction between "code doesn't exist" and "credentials wrong" at the transport layer.
**Cons:** the "unknown room" path is the most common failure in practice (typos), and making it cost a socket upgrade is a regression against Option A. The UI has no way to know the room's `accessMode` without connecting — so to render the right form we'd need to either always ask for credentials up front (bad UX for open rooms) or do an extra call anyway. Loses the simple "HTTP for discovery, WS for sync" split that makes the relay easy to reason about.

### Option C: Post-upgrade JSON handshake

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — custom frame before `setupWSConnection` can take over |
| Cost | Similar to A |
| Rejection UX | Same as A if paired with HTTP resolve; worse otherwise |
| Team familiarity | Lower — introduces a hand-rolled protocol step |

**Pros:** credentials aren't visible in URL logs. Extensible — the first frame can grow fields that don't fit cleanly in query params.
**Cons:** adds a bespoke transport layer inside the socket, which is exactly what y-websocket is trying not to be. Every change to credentials now affects both endpoints *and* a custom JSON shape. We gain nothing on rejection UX (HTTP 4xx on the upgrade is strictly better than "upgrade, then disconnect"). The URL-visibility concern is real but narrow: opaque tokens aren't replayable in the way a bearer token is, and our relay doesn't retain logs past process lifetime.

### Option D: `Sec-WebSocket-Protocol` subprotocol header for credentials

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | Same as A |
| Rejection UX | Comparable |
| Team familiarity | Low — the subprotocol mechanism is unusual for auth |

**Pros:** credentials live in a header, not a URL. Works with y-websocket as long as the server echoes the selected subprotocol.
**Cons:** the subprotocol list is a legitimate protocol-negotiation primitive we may want later (e.g., wire-format versioning). Overloading it for credentials burns a mechanism we'd rather keep free. Tooling support for setting subprotocols varies across WebSocket client libraries; we'd be committing to whatever happens to work today. Marginal gain over Option A.

## Trade-off Analysis

Option A wins by splitting "does this room exist?" from "let me start exchanging state with it." The first question is cheap, stateless, and easy to explain. The second question naturally lives inside the WebSocket upgrade because the connection is what we're granting. The two-round-trip cost is paid once per join on a human-paced flow (typing a code, tapping Join), so it's invisible.

Options B and D each optimize for a single narrow concern — round-trip count, URL-log hygiene — at the cost of conflating concerns that are currently well-separated. Option C is the worst deal because it adds a custom protocol layer with no offsetting gain once Option A is on the table.

The honest loss in Option A is the URL-log exposure of `pw` / `inv`. We accept it because: (1) those values are opaque to anyone who captures them — a password hash isn't a password; an invite token is single-use and short-lived; (2) the relay has no persistent access log per ADR-0012's architecture; (3) the same values could just as well be captured by an attacker who can read URLs as by one who can read headers, so the attacker-model improvement of Option C is thinner than it looks.

## Consequences

**Easier:**
- The client's join flow is trivially readable — `resolve(code)` then `connect(uuid, credentials)` — and each step fails loudly for one well-defined reason.
- Rejection mapping is a single close-code → `JoinRejectionReason` table that's the same in Phase 3 and Phase 5; adding enforcement in Phase 5 is purely server-side.
- y-websocket's default client and server pathways handle everything the relay forwards; our code is thin glue plus a handful of HTTP routes.
- The `accessMode` hint returned by `GET /rooms/:code` gives the Phase 5 Join Room UI enough to render the correct form without a speculative connection.

**Harder:**
- Query-string credentials appear in any URL log; relay operators will need to keep that in mind if they ever add structured logging.
- "Connect directly by UUID without resolving" is a legal request the relay must also accept (for the Phase 3 jump-back-in fast path); we rely on the close-code table to recover when the UUID has expired. This is a minor branch we document rather than an architectural cost.
- The resolve endpoint is one more surface the relay has to defend against low-effort abuse (code-enumeration scans). Mitigation is out of scope for Phase 3 but tracked — see Action Items.

**Revisit triggers:**
- Real need to add wire-format versioning → use the `Sec-WebSocket-Protocol` mechanism Option D was reserving.
- Real need to hide credentials from URL-level observability (e.g., deploying behind a logging proxy that can't be configured to redact) → Option C becomes the superseding path, targeted by a new ADR.
- Sustained code-enumeration abuse against `GET /rooms/:code` → add rate limiting or a proof-of-work gate at the relay. Not a wire-protocol change; no new ADR needed.

## Action Items

- [ ] Mirror the close-code table in `@hnch/shared` as a constant alongside `JoinRejectionReason` so both client and relay import from one source.
- [ ] Implement the `GET /rooms/:code` and `WS /ws/:uuid` handlers in the Phase 3 relay scaffolding commits (per `plans/phase-3-networking.md` §3.2).
- [ ] Update `adr/README.md` index to list ADR-0016 as Accepted.
- [ ] Update `CLAUDE.md` "Current decisions at a glance" to mention the handshake (new line under the access-control entry).
- [ ] Add a short note to `packages/shared/src/auth.ts` pointing at ADR-0016 for the wire format. The existing TBD comment can be retired.
- [ ] When Phase 5 lands password / invite enforcement, verify no change to this ADR is needed — the Action Items are the additions on the relay side (register hash, mint tokens) and client side (compute hash, surface rejection reasons); the wire shape already carries them.
