# ADR-0035: Wrong-password rejection on WS close 4002, not pre-upgrade HTTP 403

**Status:** Accepted
**Date:** 2026-04-30

## Context

- [ADR-0017](0017-password-hashing-drop-invite-only.md) §"Password enforcement on WS upgrade" specified: missing `pw` → HTTP 400; `pw` mismatch → HTTP 403 + close code 4002.
- Mismatch clause incoherent: `denyUpgrade(403)` terminates TCP before WS established → no close frame transmitted. Relay impl in `packages/relay/src/server.ts` does only the HTTP 403 path.
- Browsers expose almost nothing about failed WS upgrades to JS. Per WHATWG WebSocket API, non-101 surfaces as generic `CloseEvent` `code: 1006`, empty `reason`. HTTP status invisible.
- [ADR-0016](0016-client-relay-connection-handshake.md) close-code table 4001–4099 exists precisely so client can read rejection reason post-upgrade. Already powers `room-full` (4006, [ADR-0024](0024-participant-cap.md)).
- Result: client `JoinRejectionReason` mapping never sets `'wrong-password'` → UI cannot distinguish wrong-password from network error.
- Constant-time compare guarantee from ADR-0017 §57 (`crypto.timingSafeEqual` on equal-length buffers) is orthogonal to where rejection fires; preserved either way.
- Missing-`pw` case = client bug, not credential mismatch → HTTP 400 stays.

## Decision

Relay rejects wrong password by completing WS upgrade then immediately calling `ws.close(4002, 'wrong-password')` instead of `denyUpgrade(403)`. Malformed-credentials path keeps pre-upgrade HTTP 400. Supersedes only ADR-0017's password-enforcement clause; PBKDF2-SHA-256 hashing, 100k iterations, room-UUID salt, `POST /rooms`, `PATCH /rooms/:uuid/access`, invite-only removal — all unaffected.

## Options

- **A — Status quo (pre-upgrade HTTP 403):** matches ADR-0017 as written; no Yjs resources consumed on rejection. Cons: close code 4002 reserved in ADR-0016 dead; client can't distinguish wrong-password from network failure. Rejected.
- **B — New HTTP endpoint to verify password before WS:** legible at HTTP layer; no WS upgrade burned. Cons: expands ADR-0016's two-call handshake to three; adds TOCTOU window (password could change between verify + connect); close-code mechanism already exists. Rejected.
- **C — WS close 4002 post-upgrade (CHOSEN):** activates close-code path ADR-0016 already reserved; mirrors `room-full` (single rejection idiom for stateful refusals); client mapping picks up `wrong-password` with no shape change; constant-time compare runs inside upgrade callback before close. Cons: wrong-password opens + closes a WS instead of failing at HTTP layer (small cost, matches `room-full`); network-tab signature differs from ADR-0017 narrative.

## Trade-offs

- Loses HTTP-layer observability — wrong-password no longer shows as 403 in access logs; appears as completed upgrade + 4002 close. Consistent with `room-full` already.
- Bad password costs one WS upgrade vs zero. Acceptable: participant cap ([ADR-0024](0024-participant-cap.md)) + room code unguessability ([ADR-0008](0008-room-code-format.md)) make brute force uneconomic. If observed, response = relay rate-limiting, not reverting this ADR.

## Consequences

- Easier: client `lastRejection` correctly surfaces `'wrong-password'`; Join screen routes user back to password input with specific message; one rejection idiom for stateful refusals (`room-full`, `wrong-password`, future `invite-*`); ADR-0016 close-code table = single authoritative wire-level vocabulary except shape errors (HTTP 400) and unknown UUIDs (HTTP 404).
- Harder: bad password costs one WS upgrade; network-tab signature differs from ADR-0017 narrative — implementers expect connected-then-closed for wrong-password.
- Revisit when: sustained brute force on a single room → per-(room, IP) rate limit (impl detail, no new ADR); per-upgrade auditing makes opened-then-closed materially expensive → revisit.

## Action Items

- [ ] Update `packages/relay/src/server.ts`: `wss.handleUpgrade` then `ws.close(4002, 'wrong-password')` on `pw` mismatch instead of `denyUpgrade(403)`. Keep `timingSafeEqual` length check + constant-time compare.
- [ ] Confirm `JOIN_REJECTION_CLOSE_CODES['wrong-password'] === 4002` in `packages/shared/src/auth.ts` (verify no drift).
- [ ] Confirm client close-code → `JoinRejectionReason` mapping picks up 4002.
- [ ] Add Playwright e2e: wrong password → wrong-password-specific error (not generic).
- [ ] Update `CLAUDE.md` glance with parenthetical: "wrong-password surfaces via WS close 4002".
- [ ] ADR-0017 status line → `Accepted (password-enforcement clause superseded by ADR-0035)` (done with this ADR).
