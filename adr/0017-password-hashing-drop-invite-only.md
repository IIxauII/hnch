# ADR-0017: Password hashing scheme and invite-only removal

**Status:** Accepted (password-enforcement clause superseded by ADR-0035)
**Date:** 2026-04-22

## Context

- Phase 5 begins access-control enforcement. ADR-0009 left open: hashing scheme, invite-flow protocol, relay data model extension.
- Hashing: ADR-0009 suggested argon2id WASM (~50 KB, slow on iPhone SE/A9). Relay in-memory-only per ADR-0012 — hashes never exposed to offline attack.
- Invite-only requires token CRUD, single-use lifecycle, OOB delivery, host-approval — heavy machinery for niche use case. Open + password covers real planning-poker scenarios.

## Decision

Password hashing: PBKDF2-SHA-256 via Web Crypto (`crypto.subtle.deriveBits`), 100k iterations, 32-byte output hex-encoded (64 chars), salt = room UUID. `hashPassword(password, salt): Promise<string>` lives in `@hnch/shared`. Zero deps; hardware-accelerated; ~200 ms on iPhone SE; available browser + Node 20+; adequate for in-memory-only relay (not memory-hard — must be replaced if architecture ever persists hashes). Invite-only dropped from v1 — `accessMode` union becomes `'open' | 'password'`. Relay endpoints: `POST /rooms` body extended with `passwordHash?`; new `PATCH /rooms/:uuid/access` accepts `{ passwordHash: <hex> | null }` — no auth required (UUID unguessable, in-memory-only). Existing WS connections NOT evicted on access change. Password enforcement on WS upgrade: missing `pw` → `400`; mismatch → HTTP `403` close `4002` via `crypto.timingSafeEqual`. (Enforcement clause superseded by [ADR-0035](0035-wrong-password-post-upgrade-close.md) — rejection now post-upgrade close `4002`, not pre-upgrade `403`.)

## Trade-offs

- PBKDF2 not memory-hard — persisting hashes (DB-backed relay) requires superseding ADR.
- Password shared with N people = permanent access until rotated; no per-person admission control.
- No host auth on `PATCH /rooms/:uuid/access` — anyone with UUID can change access mode; mitigated by UUID unguessability.

## Consequences

- Easier: zero new deps; binary access model (open/password); host controls access without reconnect; share/QR/deep-links carry only codes.
- Harder: no fine-grained admission; no memory-hardness guarantee; UUID guessing is hardening gap.
- Revisit when: relay gains persistent storage → revisit hashing scheme; demand for per-person admission → reintroduce invite-only via new ADR; UUID leakage concern → host-auth tokens on mutating endpoints.
