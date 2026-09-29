# ADR-0050: Reconnect reconciliation — presence re-announce, sync-gated auto-reveal, HTTP refusal lookup

**Status:** Proposed
**Date:** 2026-09-29

Refines [ADR-0025](0025-reconnect-backoff.md) (reconnect posture) and [ADR-0018](0018-remove-timer-add-unanimous-reveal.md) (unanimous auto-reveal). Works around the pre-upgrade rejections of [ADR-0035](0035-wrong-password-post-upgrade-close.md) without changing them.

## Context

- `y-protocols` accepts an awareness state only at a clock newer than the last one seen for that client. `y-websocket` drops every remote state when a socket closes, but keeps the clocks.
- Relay replays live states to a fresh socket at their current clocks. After a reconnect those are clocks the client already holds → states ignored → every peer reads "offline" until its next renewal, up to 15 s.
- Same in reverse for own state: peers dropped it, kept its clock, ignore the unchanged state.
- 15 s is three election debounces ([ADR-0010](0010-host-election.md)): a blip nobody noticed handed the session to another host, and back.
- Doc outlives the socket (IndexedDB loads it before the socket opens; a drop keeps it). Awareness does not. Between socket open and first sync a peer is the only one it sees online. If it has voted, "every online voter has voted" is true of that picture → it revealed the round for everyone, on reload or blip.
- Relay rejects two handshakes before the upgrade: unknown UUID (HTTP 404) and missing `pw` on a protected room (HTTP 400, ADR-0035). A browser `WebSocket` exposes neither status: the socket closes without a code, same as a dead link. `y-websocket` retries forever; user sits behind "Reconnecting…".
- Both rejections hit participants already in the session: host set a password, or the snapshot expired ([ADR-0012](0012-snapshot-policy.md)), while their socket was down. ADR-0025's `4001 → session expired` path is unreachable from a browser for this reason.

## Decision

All in `packages/shared/src/relay-client.ts` and `auto-reveal.ts`, so client and CLI behave alike ([ADR-0021](0021-cli-package.md)):

- **Presence.** On every `disconnected`, and at construction, forget the clocks held for other clients. On every `connected`, set own awareness state again, which bumps its clock.
- **Trust.** `onSyncedChange` reports whether the relay's state has applied on the current socket. The auto-reveal driver evaluates only while it has — unless the session has no other active participant.
- **Refusal lookup.** After a close that carries no relay code, ask `GET /rooms/:code`, at most once per 5 s. `404`, or a UUID other than the connection's → `unknown-room`. `accessMode: password` with no hash held → `wrong-password`. Either is a permanent rejection: reconnecting stops, the reason goes out through `onRejectionChange`. No answer → keep retrying.

## Trade-offs

- Forgotten clock = next state for that client is taken at any clock. Safe only because the relay sends a fresh socket the states it holds now and nothing else. That relay behaviour is now load-bearing.
- Coupled to `y-protocols` internals (`awareness.meta`).
- One extra awareness message per peer per (re)connect.
- Trust gate leaves one window: a link that dies without a close or an `offline` event. Awareness times peers out at 30 s while `synced` still reads true.
- Refusal lookup costs one `GET` per dropped connection, and relies on `GET /rooms/:code` staying unauthenticated and reporting `accessMode`.
- `wrong-password` stands in for "no password held". The relay's own distinction (400 vs 4002) is not kept on the client.

## Consequences

- Easier: a short drop costs nobody their presence or the host their role; reload mid-round does not reveal; a rejection mid-session reaches the user and routes them (Join with the code for a password, Home otherwise).
- Harder: three reconnect workarounds in one module. Each reads like something to clean up; inline comments + this ADR are what keeps them.
- Revisit when: relay moves pre-upgrade rejections to post-upgrade close codes (would supersede the ADR-0035 clause) → drop the lookup. `y-protocols` resets a client's clock when its state is removed → drop clock forgetting. Relay ties clientID to socket on every awareness message → re-announce no longer leaves the old state lingering up to 30 s after an abrupt close.
