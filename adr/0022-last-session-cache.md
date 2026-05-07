# ADR-0022: Last-session cache — TTL aligned to relay snapshot

**Status:** Accepted
**Date:** 2026-04-26

## Context

- Both clients (mobile per ADR-0002, CLI per ADR-0021) need "jump back in" / `hnch resume` without re-entering code.
- Sessions ephemeral (ADR-0006); relay holds snapshots 24h post-last-disconnect (ADR-0012); past TTL → close `4001 / unknown-room` (ADR-0016). Codes recycle (ADR-0008).
- Cache TTL is **not** a free knob — bounded by server:
  - Cache > snapshot → banner lands in *different* room (recycled code) or fails (`unknown-room`).
  - Snapshot > cache → resume silently absent though relay would serve.
  - Equal → banner offered exactly when rejoin works.
- Storage forced by runtime: ADR-0004 (Capacitor) vs ADR-0021 (Node JSON). Shape shareable, persistence not.

## Decision

1. **Invariant:** cache TTL = 24h = ADR-0012 snapshot TTL. Drift either direction = bug. Snapshot TTL change → revisit/supersede this ADR same PR.
2. **Shared base in `packages/shared/src/last-session.ts`:** `{ roomCode, roomUuid, lastSeenAt }`. Mobile extends with `lastScreen: 'lobby' | 'estimating'`. CLI extends with optional `passwordHash` (PBKDF2 per ADR-0017, pre-hashed) for unattended `hnch resume`.
3. **Storage:** mobile = Capacitor Preferences key `hnch.lastSession` (single-row pointer; SQLite path overkill); **no `passwordHash` cached on mobile** (join sheet re-prompts, no UX benefit + threat surface). CLI = `~/.config/hnch/last-session.json`, MUST be mode `0600` (contains hash).
4. **Eviction:** lazy at read (`lastSeenAt + 24h < now` → clear); eager on relay close `4001` → clear + show "session expired".
5. **Write triggers:** on successful join + on meaningful screen transitions (Lobby↔Estimating). NOT during disconnected/reconnecting/replay.
6. **Pointer not mirror:** no participant counts, scales, round history — those come from live doc on rejoin.

## Options

- **A — 24h aligned, shared base, divergent storage (chosen):** Pros: only configuration that can't produce ghost rooms; single source of truth; honors ADR-0021 parity. Cons: pins cache TTL to server detail (intentional — that's the point).
- **B — Long-lived cache, drop on relay rejection:** Pros: client doesn't track relay TTL. Cons: user pays discovery cost every stale tap; recycled-code can route to *different* room; coupling hidden, not absent.
- **C — Short cache (1h):** Pros: always fresh. Cons: misses common "back tomorrow" case; throws away ADR-0012's whole 24h benefit; asymmetric retention confuses.
- **D — Cache `expiresAt` returned by relay:** Pros: no drift, supports per-room TTL. Cons: requires protocol surface change for v1-nonexistent use case; `lastSeenAt + 24h` is faithful approximation.

## Trade-offs

- Two TTLs must move together; visible invariant > hidden coupling.
- CLI `passwordHash` storage = local-trust boundary same as ADR-0021 `participantId`. Stolen file → rejoin until snapshot TTL. Mitigate via `0600` + user hygiene on shared machines.
- Mobile/CLI asymmetry (no hash on mobile) intentional: mobile re-prompt is one tap; CLI re-prompt makes resume useless for password-protected rooms.

## Consequences

- Easier: "back tomorrow" is one tap / `hnch resume`; success rate matches relay capability; coupling documented in one place.
- Harder: TTL no longer free knob — lengthening starts at ADR-0012 (right friction). CLI hash storage adds local-trust footprint.
- Revisit when: ADR-0012 changes TTL or adds per-room → update/supersede same PR; third client added → likely new ADR; mobile gains "remember password" toggle → new ADR covering threat model.

## Action Items

- [ ] Cross-link from ADR-0012, ADR-0021, ADR-0017, ADR-0004 (typo-class).
- [ ] **T22 gap:** `packages/cli/src/last-session.ts:65` write must use mode `0600` + permission-asserting test.
- [ ] **T22 gap:** CLI WS rejection handler `packages/cli/src/index.ts:236` must clear cache on close `4001`. Mobile already covers both paths.
- [ ] Verify both consumers match `packages/shared/src/last-session.ts` shape.
