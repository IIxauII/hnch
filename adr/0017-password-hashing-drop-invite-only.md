# ADR-0017: Password hashing scheme and invite-only removal

**Status:** Accepted (password-enforcement clause superseded by ADR-0035)
**Date:** 2026-04-22
**Deciders:** Xau

## Context

Phase 5 begins access-control enforcement. [ADR-0009](0009-access-control-relay-tokens.md) established relay-enforced opaque tokens and left three action items open:

1. Choose a password-hashing scheme on the client.
2. Design the invite-flow protocol (token minting, delivery, redemption).
3. Extend the relay data model with `passwordHash` and `invitesOutstanding`.

Before implementing, two higher-order questions surfaced:

**Hashing scheme.** ADR-0009 suggested argon2id via WASM as the default. In practice, argon2id adds a ~50 KB WASM dependency and is slow on low-end iPhones (iPhone SE / A9). The relay is in-memory-only ([ADR-0012](0012-snapshot-policy.md)) and never exposes hashes to offline attack — the threat model is mild enough that a lighter scheme suffices.

**Invite-only scope.** Invite-only requires token CRUD, single-use lifecycle management, an out-of-band delivery mechanism (share sheet, QR, deep links), and a host-approval protocol. This is substantial machinery for a niche use case. Open rooms and password-protected rooms cover the real-world planning poker scenarios: public team sessions and private sessions where the password is shared on Slack or verbally.

## Decision

**Password hashing:** PBKDF2 via the Web Crypto API (`crypto.subtle.deriveBits` with `PBKDF2`).

Parameters:
- Algorithm: PBKDF2-SHA-256
- Iterations: 100,000
- Output: 32 bytes, hex-encoded (64 characters)
- Salt: the room's UUID (from the `GET /rooms/:code` resolve step)

Using the room UUID as salt means:
- The same password on different rooms produces different hashes (prevents cross-room credential reuse).
- The joiner must resolve the room before hashing, which is already the case per [ADR-0016](0016-client-relay-connection-handshake.md).
- No additional salt needs to be stored or transmitted.

The `hashPassword(password: string, salt: string): Promise<string>` function lives in `@hnch/shared` so both client and relay tests import from one source.

**Invite-only is dropped from v1.** The only access modes are `open` and `password`. The `invite` value is removed from the `accessMode` union and from the close-code table's active paths. The relay does not implement invite token storage, minting, or redemption. If invite-only is needed post-v1, a new ADR will reintroduce it.

**Relay endpoints for password management:**

1. `POST /rooms` — extended body: `{ passwordHash?: string }`. When present, the room is created as password-protected. The hash must be a 64-character hex string; malformed values are rejected with `400`.

2. `PATCH /rooms/:uuid/access` — new endpoint for mid-session access changes:
   - `{ "passwordHash": "<hex>" }` — set or replace the password hash (room becomes password-protected).
   - `{ "passwordHash": null }` — remove the password (room reverts to open).
   - Returns `200 { accessMode }` on success, `404` if UUID is unknown.
   - Existing WebSocket connections are NOT evicted when the access mode changes — the change only affects future joins, consistent with `ux.md`.

No authentication is required on `PATCH` in v1. The UUID is unguessable (random v4), the relay is in-memory-only, and the endpoint is only called by the host client. If this becomes a concern, a future ADR can add host-auth tokens.

**Password enforcement on WS upgrade** (extends [ADR-0016](0016-client-relay-connection-handshake.md)'s upgrade handler):

- Room has `passwordHash` set → `pw` query param is required.
  - Missing `pw` → reject upgrade with HTTP `400` (malformed credentials).
  - `pw` does not match → reject upgrade with HTTP `403` and close code `4002` (`wrong-password`).
  - Match uses `crypto.timingSafeEqual` on equal-length buffers; length mismatch is rejected before comparison.
- Room has no `passwordHash` → proceed as before, ignoring `pw` if present.

## Options Considered

### Option A: argon2id via `hash-wasm`

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — WASM dependency, async init |
| Cost | ~50 KB bundle size |
| Security | Strongest — memory-hard |
| Performance | Potentially slow on low-end mobile (iPhone SE) |

**Pros:** gold-standard password hashing; memory-hard resists GPU attacks.
**Cons:** the relay never persists hashes and never exposes them to offline attack, so memory-hardness is defense-in-depth against a threat that doesn't exist in this architecture. The WASM dependency and mobile performance risk are real costs for a theoretical benefit.

### Option B: PBKDF2 via Web Crypto API (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — zero dependencies, built into every runtime |
| Cost | None |
| Security | Adequate — not memory-hard, but sufficient for the threat model |
| Performance | ~200 ms on iPhone SE, hardware-accelerated on most platforms |

**Pros:** zero dependencies; hardware-accelerated; available in both browser and Node 20+; fast enough on low-end devices; adequate security for an in-memory-only relay where hashes are never exposed to offline attack.
**Cons:** not memory-hard — if the threat model ever escalates to persistent hash storage or offline attack surface, PBKDF2 would need to be replaced.

### Option C: SHA-256 via Web Crypto API

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest |
| Cost | None |
| Security | Weak — single-round hash with no key stretching |
| Performance | Sub-millisecond |

**Pros:** simplest possible implementation.
**Cons:** even though the relay only does equality comparison, shipping a raw hash feels like a promise we can't keep. A single SHA-256 round is trivially brute-forced if the hash ever leaks. Rejected — the marginal cost of PBKDF2 over SHA-256 is near zero.

## Trade-off Analysis

Option B is the right call because the threat model doesn't justify argon2id's costs. The relay holds hashes in RAM for at most 24 hours, never writes them to disk, and the only attack surface is the `PATCH` endpoint which requires knowing the UUID. PBKDF2 with 100K iterations is more than adequate here and costs nothing in bundle size or dependencies. If the architecture ever changes to persist hashes (e.g., a database-backed relay), a new ADR should revisit this.

Dropping invite-only is the right call because it eliminates a large surface area (token CRUD, delivery protocol, share infrastructure) for a feature that doesn't serve the core use case. Password protection covers "I want a private room" with far less complexity.

## Consequences

**Easier:**
- Zero new dependencies for password hashing — Web Crypto is built in everywhere.
- The access model is binary: open or password. No token lifecycle, no admission queue, no host-approval flow.
- The `PATCH` endpoint gives the host full control over access mode without reconnecting.
- Share sheet, QR, and deep links (later Phase 5 steps) only need to carry room codes, not tokens.

**Harder:**
- No invite-only means no fine-grained per-person admission control. A password shared with N people gives all N permanent access until the host changes it. This is acceptable for planning poker but wouldn't work for, say, a confidential voting scenario.
- PBKDF2 is not memory-hard — if we ever persist hashes to disk, this ADR must be superseded.
- No host authentication on `PATCH /rooms/:uuid/access` — anyone who guesses or intercepts a UUID can change the access mode. Mitigated by UUID unguessability but flagged for future hardening.

**Revisit triggers:**
- Relay gains persistent storage for room metadata → revisit hashing scheme (argon2id or better).
- Real user demand for per-person admission control → reintroduce invite-only via a new ADR.
- UUID leakage becomes a concern → add host-auth tokens on mutating endpoints.

## Action Items

- [ ] Add `hashPassword()` to `@hnch/shared` with the parameters above.
- [ ] Update `packages/shared/src/auth.ts`: remove invite-related types and close codes from active use (keep `InviteToken` type and close codes as reserved/commented for future use, or remove entirely).
- [ ] Extend `POST /rooms` to accept `{ passwordHash }`.
- [ ] Implement `PATCH /rooms/:uuid/access` on the relay.
- [ ] Enforce password validation in the WS upgrade handler.
- [ ] Wire the client Join page to show a password field when `accessMode === 'password'`.
- [ ] Wire the client session-settings access picker to call `PATCH`.
- [ ] Remove or disable the "Invite only" option in the access picker UI.
