# ADR-0050: Reconnect reconciliation — presence re-announce, sync-gated auto-reveal, HTTP refusal lookup

**Status:** Accepted
**Date:** 2026-09-29

Refines [ADR-0025](0025-reconnect-backoff.md) (reconnect posture), [ADR-0018](0018-remove-timer-add-unanimous-reveal.md) (unanimous auto-reveal) and [ADR-0044](0044-local-room-history-cache.md) (cache eviction). Works around the pre-upgrade rejections of [ADR-0035](0035-wrong-password-post-upgrade-close.md) without changing them, through the resolve endpoint of [ADR-0016](0016-client-relay-connection-handshake.md).

## Context

- `y-protocols` accepts an awareness state only at a clock newer than the last one seen for that client. `y-websocket` drops every remote state when a socket closes, but keeps the clocks.
- Relay replays live states to a fresh socket at their current clocks. After a reconnect those are clocks the client already holds → states ignored → every peer reads "offline" until its next renewal, up to 15 s.
- Same in reverse for own state: peers dropped it, kept its clock, ignore the unchanged state.
- 15 s is three election debounces ([ADR-0010](0010-host-election.md)): a blip nobody noticed handed the session to another host, and back.
- Doc outlives the socket (IndexedDB loads it before the socket opens; a drop keeps it). Awareness does not. Between socket open and first sync a peer is the only one it sees online. If it has voted, "every online voter has voted" is true of that picture → it revealed the round for everyone, on reload or blip.
- Relay rejects two handshakes before the upgrade: unknown UUID (HTTP 404) and missing `pw` on a protected room (HTTP 400, ADR-0035). A browser `WebSocket` exposes neither status: the socket closes without a code, same as a dead link. `y-websocket` retries forever; user sits behind "Reconnecting…".
- Both hit participants already in the session. Host sets a password — socket up or down, the next handshake carries no `pw`. Relay restarts (rooms live in memory, [ADR-0012](0012-snapshot-policy.md)) or the room expires.
- Relay never sends close code 4001: an unknown UUID is always the pre-upgrade 404. The `4001 → cache clear` of ADR-0025 and ADR-0044 had no trigger, on either surface.

## Decision

`connectToRelay` sets its own awareness state again on every `connected` and forgets the clocks held for other clients on every `disconnected`; the auto-reveal driver evaluates only on presence the current socket has synced, a session with no other active participant excepted. A close without a relay code is followed by `GET /rooms/:code`, at most one per 5 s: a 404 carrying the relay's `unknown-room` reason, or a UUID other than the connection's, is `unknown-room`; `accessMode: password` with no hash held is `wrong-password` — both permanent rejections, reported through `onRejectionChange`.

## Trade-offs

- Forgotten clock = next state for that client is taken at any clock. Safe because the relay sends a fresh socket the states it holds now. That relay behaviour is now load-bearing.
- `y-websocket`'s BroadcastChannel (on by default) is a second source of states: another tab on the same device can hand over one the relay has dropped.
- Coupled to `y-protocols` internals (`awareness.meta`).
- One extra awareness message per peer per (re)connect.
- Trust gate covers the client that connects, not the ones that stay. A voter who has not voted and drops out still leaves "every online voter": a round that waited only for them reveals (ADR-0018, unchanged).
- Trust gate leaves one window: a link that dies without a close or an `offline` event. Awareness times peers out at 30 s while `synced` still reads true.
- Refusal lookup: one `GET` per client per 5 s for as long as sockets keep closing — a whole outage, not one drop. Relies on `GET /rooms/:code` staying unauthenticated and reporting `accessMode`.
- No answer, or one that is not the relay's (a proxy's 404, a 429 from the rate limit ADR-0016 allows) = keep retrying. "Reconnecting…" without end, as before this ADR.
- `wrong-password` stands in for "no password held". The relay's own distinction (400 vs 4002) is not kept on the client.

## Consequences

- Easier: a short drop costs nobody their presence or the host their role; a client that reloads or reconnects mid-round does not reveal the round on what it sees on its way in; a rejection mid-session reaches the user and routes them (Join with the code for a password, Home otherwise).
- Easier: `unknown-room` from the lookup drops the session from the local cache — the eviction ADR-0025 and ADR-0044 tie to 4001.
- Harder: three reconnect workarounds in two shared modules (`relay-client.ts`, `auto-reveal.ts`), the gate wired once per consumer (client `DocService`, CLI `session.ts`). Each reads like something to clean up; inline comments + this ADR are what keeps them.
- Revisit when: relay moves pre-upgrade rejections to post-upgrade close codes (would supersede the ADR-0035 clause) → drop the lookup. `GET /rooms/:code` gets a rate limit → the lookup needs to tell 429 from silence. `y-protocols` resets a client's clock when its state is removed → drop clock forgetting. Relay ties clientID to socket on every awareness message → re-announce no longer leaves the old state lingering up to 30 s after an abrupt close. A voter dropping out is to stop revealing rounds → grace window in the driver, amending ADR-0018.
