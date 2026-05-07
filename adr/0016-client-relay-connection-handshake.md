# ADR-0016: Client ↔ relay connection handshake

**Status:** Accepted
**Date:** 2026-04-21

## Context

- ADR-0001 content-blind relay; ADR-0008 6-char code → relay-internal UUID; ADR-0009 relay-enforced opaque tokens at connect; ADR-0012 24h in-memory snapshot.
- Unspecified: (1) how client turns code into something connectable — out-of-band HTTP lookup or in-band `/ws/:code` mapping; (2) how `JoinCredentials` from `packages/shared/src/auth.ts` ride the wire — query params, `Sec-WebSocket-Protocol` header, or post-upgrade JSON frame.
- Pre-phase gate per `roadmap.md` §5 + `plans/phase-3-networking.md` §2.1.
- Snapshot rehydration settled by y-websocket sync-step-1/step-2 against relay-side `Y.Doc` — no new design.

## Decision

Two-call handshake. (1) Resolve: `GET {relayUrl}/rooms/:code` → `200 { uuid, accessMode }` or `404 { reason: 'unknown-room' }`. No credentials. Cheap content-free rejection. (2) Connect: `WS {relayUrl}/ws/:uuid?did=<deviceId>&pw=<hash>&inv=<token>`. Relay validates synchronously in HTTP upgrade handler — malformed → `400`; pre-upgrade UUID-invalid → `404`; accepted → handed to `setupWSConnection`. Post-upgrade rejections close with private-use codes 4001–4099: `4001 unknown-room`, `4002 wrong-password`, `4003 invalid-invite`, `4004 expired-invite`, `4005 invite-already-redeemed`, `4006 room-full` (now active per [ADR-0024](0024-participant-cap.md)), `4010 malformed-credentials`. Close `reason` carries enum label.

## Options

- **A — HTTP resolve + WS connect with query-string creds (chosen):** unknown-room costs no socket; readable join flow; works with stock y-websocket; `accessMode` hint enables correct Join UI form. Cons: 2 round-trips happy path; query-string creds appear in URL logs (opaque hashes/tokens, relay has no persistent log).
- **B — Single-call WS to `/ws/:code`:** fewer round-trips; one endpoint. Cons: typo-rejection costs socket upgrade; UI can't know `accessMode` without connecting → bad UX or extra call anyway; loses HTTP-discovery/WS-sync split.
- **C — Post-upgrade JSON handshake:** creds invisible in URL logs; extensible frame. Cons: bespoke transport inside socket — exactly what y-websocket avoids; rejection UX no better than A; URL-visibility concern narrow given opaque tokens + no persistent logs.
- **D — `Sec-WebSocket-Protocol` header for creds:** creds in header. Cons: subprotocol is legitimate negotiation primitive (wire-format versioning) — overloading burns it; tooling support varies.

## Trade-offs

- 2 round-trips per join (paid once on human-paced flow — invisible).
- URL-log exposure of `pw`/`inv` accepted: opaque values, single-use/short-lived tokens, no persistent relay logs.
- Direct UUID-connect skipping resolve is legal (Phase 3 fast-path); close-code table handles expired UUID.
- Resolve endpoint = code-enumeration surface; mitigation deferred.

## Consequences

- Easier: `resolve(code)` then `connect(uuid, creds)`; single close-code → `JoinRejectionReason` table same Phase 3/5; thin glue + few HTTP routes; `accessMode` hint drives Join UI.
- Harder: query-string creds in URL logs; direct-UUID connect needs documented branch; resolve endpoint defends against enumeration scans.
- Revisit when: wire-format versioning needed → Option D mechanism; URL-credential hiding needed (logging-proxy can't redact) → Option C via superseding ADR; sustained enumeration abuse → rate limiting (no ADR).

## Action Items

- [ ] Mirror close-code table in `@hnch/shared` alongside `JoinRejectionReason`.
- [ ] Implement `GET /rooms/:code` and `WS /ws/:uuid` per `plans/phase-3-networking.md` §3.2.
- [ ] Update `adr/README.md` index and `CLAUDE.md` glance entry.
- [ ] Note in `packages/shared/src/auth.ts` pointing at this ADR; retire TBD comment.
- [ ] Phase 5: verify no ADR change — additions are server-side enforcement + client-side hash/rejection mapping.
