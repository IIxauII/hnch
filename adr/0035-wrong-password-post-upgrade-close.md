# ADR-0035: Wrong-password rejection on WS close 4002, not pre-upgrade HTTP 403

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** Xau

## Context

[ADR-0017](0017-password-hashing-drop-invite-only.md) §"Password enforcement on WS upgrade" (lines 52–58) specified two rejection paths in the relay's WebSocket upgrade handler:

> - Missing `pw` → reject upgrade with HTTP `400` (malformed credentials).
> - `pw` does not match → reject upgrade with HTTP `403` and close code `4002` (`wrong-password`).

The second clause is incoherent. A pre-upgrade HTTP rejection (`denyUpgrade(403)`) terminates the TCP connection before the WebSocket protocol is established, so no close frame is ever transmitted. The "and close code `4002`" half of the sentence cannot fire; the relay implementation in `packages/relay/src/server.ts` accordingly does only the HTTP 403 path.

This breaks the client's rejection-reason channel:

- Browsers expose almost nothing about failed WebSocket upgrades to JavaScript. Per the WHATWG WebSocket API, a non-101 HTTP response surfaces to JS only as a generic `CloseEvent` with `code: 1006` and an empty `reason`. The HTTP status code is not visible.
- [ADR-0016](0016-client-relay-connection-handshake.md) §"Post-upgrade rejections" defined the `4001–4099` private-use close-code table precisely so the client *can* read a rejection reason — the relay accepts the upgrade, then closes the socket with the appropriate code. That mechanism is what already powers `room-full` (close `4006`, [ADR-0024](0024-participant-cap.md)).
- Result today: when the user types the wrong password, the client's `JoinRejectionReason` mapping never sets `lastRejection` to `'wrong-password'`. The UI cannot distinguish "wrong password" from "network error" and cannot route the user back to the password input with a tailored message.

The constant-time comparison guarantee from ADR-0017 §57 ("`crypto.timingSafeEqual` on equal-length buffers; length mismatch is rejected before comparison") is unrelated to *where* in the handshake the rejection fires and is preserved by both options.

The malformed-credentials case (missing `pw` when the room requires one) is different: it indicates a client-side bug, not a credential mismatch. The user does not need a JS-visible reason for it — surfacing as a generic upgrade failure is acceptable and HTTP 400 keeps the bad request from consuming a WebSocket slot.

## Decision

The relay rejects a wrong password by **completing the WS upgrade and immediately calling `ws.close(4002, 'wrong-password')`** instead of `denyUpgrade(403)`.

The malformed-credentials path (missing `pw` on a password-protected room, illegal `did`, etc.) keeps its **pre-upgrade HTTP 400** behavior from ADR-0016 / ADR-0017. Only the `pw` mismatch case moves post-upgrade.

This supersedes ADR-0017's password-enforcement clause (lines 52–58) only. ADR-0017's PBKDF2-SHA-256 hashing scheme, 100,000 iterations, room-UUID-as-salt, the `POST /rooms` and `PATCH /rooms/:uuid/access` endpoints, and the invite-only removal are unaffected.

## Options Considered

### Option A: Status quo — pre-upgrade HTTP 403

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | None |
| Client UX | Broken — browser surfaces only `close 1006` |
| Alignment with ADR-0016 | Conflicts — close-code `4002` listed but unreachable |

**Pros:** matches ADR-0017 as written; the rejected join never reaches `setupWSConnection`, so it consumes no Yjs-side resources.
**Cons:** the close code `4002` reserved in ADR-0016 §47 is dead. The client cannot tell `wrong-password` apart from a generic network failure. Documentation says one thing; the protocol does another.

### Option B: New HTTP endpoint to verify password before WS

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — new route, new client step, new rejection mapping |
| Cost | One extra round-trip on every password-protected join |
| Client UX | Tailored — HTTP status readable from `fetch` |
| Alignment with ADR-0016 | Adds a third call to the two-call handshake |

**Pros:** the rejection is legible at the HTTP layer; no WS upgrade is burned on a bad credential.
**Cons:** expands ADR-0016's "two-call pattern over two protocols" to three calls. More protocol surface, more TOCTOU windows (the password could change between verify and connect), and the close-code mechanism already exists for exactly this. No benefit over Option C.

### Option C: WS close `4002` post-upgrade (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — same as the existing `room-full` path |
| Cost | One extra WS upgrade for a rejected join (cheap; same as `room-full`) |
| Client UX | Correct — `CloseEvent.code === 4002` reaches JS |
| Alignment with ADR-0016 | Direct — uses the table the ADR defined |

**Pros:** activates the close-code path ADR-0016 §47 already reserved. Mirrors `room-full` (ADR-0024) so the relay has one rejection idiom for "your join cannot proceed because of state on this room." The client's existing close-code → `JoinRejectionReason` mapping picks up `wrong-password` with no shape change. Constant-time comparison is preserved — `passwordHashesMatch` (using `timingSafeEqual` on equal-length buffers, per ADR-0017 §57) just runs inside the upgrade callback before the close call.
**Cons:** a wrong-password attempt now opens a WebSocket and immediately closes it, instead of failing at the HTTP layer. Resource cost is small (one upgrade allocation, no Yjs doc binding) and matches the existing `room-full` pattern. Network-tab signature changes: developers debugging will see "WS connected, then closed with 4002" instead of "HTTP 403". Documented in this ADR.

## Trade-off Analysis

Option C is the only option that makes the client work as documented. ADR-0016's close-code table exists precisely because failed WS upgrades are opaque to browsers; routing wrong-password through that table is the rule, not the exception. The "small extra resource cost" is the price of having a rejection reason the UI can act on.

The narrow loss is observability at the HTTP layer — wrong-password attempts no longer show up as 403s in any future access log on the resolve/upgrade routes. They appear as completed upgrades followed by a `4002` close. That is consistent with how `room-full` is already observed.

## Consequences

**Easier:**
- The client's `lastRejection` correctly surfaces `'wrong-password'`, and the Join screen can route the user back to the password input with a specific error message.
- One rejection idiom for stateful refusals (`room-full`, `wrong-password`, future `invite-*`); no split-brain between HTTP and close codes.
- ADR-0016's close-code table becomes the single authoritative wire-level rejection vocabulary for everything except shape errors (HTTP 400) and unknown UUIDs at upgrade time (HTTP 404).

**Harder:**
- A bad password costs one WS upgrade instead of zero. Acceptable for v1 — the participant cap (ADR-0024) and the unguessability of room codes (ADR-0008) make brute-force attempts uneconomic. If sustained brute force is observed, rate limiting at the relay (already a tracked concern for `GET /rooms/:code` per ADR-0016 Action Items) would be the response, not reverting this ADR.
- Network-tab signature differs from the ADR-0017 narrative — implementers and reviewers should expect a connected-then-closed socket for wrong-password.

**Revisit triggers:**
- Sustained password brute-forcing against a single room → add per-(room, IP) attempt limiting at the relay. Implementation detail; no new ADR.
- Architecture changes that make the cost of an opened-then-closed WS materially different (e.g., per-upgrade auditing) → revisit; this ADR's reasoning is built on the upgrade being cheap.

## Action Items

- [ ] Update `packages/relay/src/server.ts` to call `wss.handleUpgrade` then `ws.close(4002, 'wrong-password')` on `pw` mismatch, instead of `denyUpgrade(403)`. Keep the `timingSafeEqual` length check and constant-time comparison.
- [ ] Confirm `JOIN_REJECTION_CLOSE_CODES['wrong-password'] === 4002` in `packages/shared/src/auth.ts` (already correct; verify no drift).
- [ ] Confirm the client's close-code → `JoinRejectionReason` mapping picks up `4002` and surfaces `wrong-password` to `lastRejection` without further changes.
- [ ] Add a Playwright e2e case: typing the wrong password on a protected room sets the visible error to a `wrong-password`-specific message (not a generic "could not connect").
- [ ] Update `CLAUDE.md` "Current decisions at a glance" if the password line warrants a wire-level note (likely a small parenthetical: "wrong-password surfaces via WS close 4002").
- [ ] ADR-0017 status line updated to `Accepted (password-enforcement clause superseded by ADR-0035)` — partial supersede (done with this ADR).
- [ ] `adr/README.md` index updated: ADR-0017 row status, new ADR-0035 row (done with this ADR).
