# ADR-0022: Last-session cache — TTL aligned to relay snapshot

**Status:** Accepted
**Date:** 2026-04-26
**Deciders:** Xau

## Context

Both clients — the Capacitor mobile/PWA client ([ADR-0002](0002-frontend-framework-angular-ionic-capacitor.md)) and the CLI ([ADR-0021](0021-cli-package.md)) — need to answer "what room was I last in, and can I jump straight back?" without making the user re-enter the code. The mobile client surfaces this as a Home-screen "Jump back in" banner; the CLI surfaces it as `hnch resume`.

Sessions are ephemeral ([ADR-0006](0006-ephemeral-sessions.md)) and the relay holds opaque snapshots for **24 hours** after the last peer disconnects ([ADR-0012](0012-snapshot-policy.md)). Past that window the room is gone and any rejoin attempt fails with the `unknown-room` close code 4001 from the [ADR-0016](0016-client-relay-connection-handshake.md) handshake. Room codes themselves are recyclable after the snapshot is retired ([ADR-0008](0008-room-code-format.md)) — a code can later belong to a brand-new room.

The question for both clients is therefore the same: how long is it worth keeping a "you were in room X" pointer on disk? The answer is **not** locally tunable — it is bounded by the server.

- **Cache outlives snapshot** → "Jump back in" can land the user inside a *different* room that has since claimed the same recycled code, or fail with `unknown-room`. Both are unacceptable: the first is silent data confusion, the second is a banner whose only function is to disappoint.
- **Snapshot outlives cache** → peers can still rejoin manually via the room code or a deep link, but the auto-resume UX silently doesn't fire even though the relay would happily serve the snapshot. The feature underdelivers for no reason.
- **TTLs equal** → both correct. The banner / `hnch resume` is offered exactly when the relay can serve the rejoin.

This makes the cache TTL a **cross-package invariant** rather than an independent product knob. The shape is otherwise small — `roomCode` for display, `roomUuid` to skip a code-resolution round trip, `lastScreen` so the mobile client lands on the right route, `lastSeenAt` to drive TTL — plus a CLI-only optional `passwordHash` for unattended `hnch resume` of password-protected rooms (the mobile client has a UI sheet capable of re-prompting; the CLI does not).

The two storage backends are forced by the runtime split: [ADR-0004](0004-local-persistence-sqlite-indexeddb.md) chose Capacitor SQLite + IndexedDB for the Capacitor client, and [ADR-0021](0021-cli-package.md) relaxed that to flat JSON files for the Node CLI. Neither option is correct for both runtimes; the cache shape itself is shareable but the persistence path is not.

## Decision

1. **Cross-package invariant — load-bearing.** The last-session cache TTL is **24 hours, equal to [ADR-0012](0012-snapshot-policy.md)'s relay snapshot TTL.** This equality is the architecture, not a coincidence. If the relay snapshot TTL ever changes, this ADR must be revisited or superseded in the same PR — drift in either direction is a bug.

2. **Shared base shape in `packages/shared/src/last-session.ts`.** Both clients import the same base type:

   ```ts
   export interface LastSessionCache {
     readonly roomCode: string
     readonly roomUuid: string
     readonly lastSeenAt: number    // epoch ms
   }
   ```

   Each client extends this with platform-specific fields:
   - **Mobile client** adds `lastScreen: 'lobby' | 'estimating'` to drive route restoration on tap.
   - **CLI** adds optional `passwordHash: string` (PBKDF2 format from [ADR-0017](0017-password-hashing-drop-invite-only.md), already pre-hashed before transit) to support unattended `hnch resume` of password-protected rooms.

3. **Storage divergence by platform.**
   - **Mobile / PWA:** Capacitor Preferences key `hnch.lastSession`, single string-encoded JSON value. Preferences (small KV) over the SQLite path of [ADR-0004](0004-local-persistence-sqlite-indexeddb.md) because the cache is a single-row pointer, not a row-per-event store; SQLite's schema setup is dead weight here. **No `passwordHash` is stored** — the mobile join flow can always re-prompt via the join sheet, so caching the credential adds threat surface for no UX benefit.
   - **CLI:** plain JSON file at `~/.config/hnch/last-session.json` per [ADR-0021](0021-cli-package.md)'s persistence divergence. The file MUST be written with mode `0600` (user-only) because it can contain `passwordHash`. This is the policy this ADR pins; current code uses the default mode and the gap is tracked as an Action Item below.

4. **Eviction.**
   - **Local TTL:** a read with `lastSeenAt + 24h < now` clears the entry and returns "no cache". No background sweeper — eviction is purely lazy at read time, which is enough because the banner / `hnch resume` are the only consumers.
   - **Server-driven:** if the relay rejects rejoin with close code `4001 / unknown-room` ([ADR-0016](0016-client-relay-connection-handshake.md)), the client clears the cache eagerly and surfaces a "session expired" UX rather than re-offering the dead room.

5. **Write triggers.**
   - On every successful join (resolve → connect succeeds and the local doc is bound).
   - On every in-session screen transition that meaningfully changes state (e.g., Lobby → Estimating, Estimating → Lobby on reveal-completion). `lastSeenAt` is stamped at write time so the TTL is measured from the last live interaction, not from the original join.
   - **Not** during disconnected, reconnecting, or replay state — these states do not represent a meaningful new "last seen" and would extend the TTL based on background reconciliation rather than user presence.

6. **No participant or scale state cached.** The cache deliberately does not record participant counts, scales, or round history — those come from the live doc on rejoin via the [ADR-0012](0012-snapshot-policy.md) snapshot. The cache is a pointer, not a mirror.

## Options Considered

### Option A: 24-hour TTL aligned to ADR-0012, shared base shape, platform-divergent storage (chosen)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| User experience | Banner / `hnch resume` only shown when rejoin actually works |
| Cross-package coupling | Explicit and load-bearing |
| Team familiarity | Standard |

**Pros:** the only configuration that cannot produce ghost rooms (banner pointing at a snapshot the relay has already discarded *or* at a recycled code now belonging to a different room). Single source of truth — change the relay TTL, change the cache TTL, no other knobs to tune. The shared base shape keeps both clients honest with the parity contract from [ADR-0021](0021-cli-package.md). Lazy eviction keeps both clients simple.
**Cons:** pins the cache TTL to a server detail; a future bump to 48-hour relay snapshots forces a co-ordinated client change. We accept this — that's the whole point of recording it as an invariant.

### Option B: Long-lived cache, drop on relay rejection only

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| User experience | Banner shown for stale rooms until user taps |
| Cross-package coupling | Hidden — easy to drift |
| Team familiarity | Standard |

**Pros:** the client doesn't need to know about the relay's TTL; it learns when an entry is dead by trying.
**Cons:** the user pays for the discovery. Every banner older than the snapshot TTL becomes a "tap, see error, return to home" disappointment — and worse, with [ADR-0008](0008-room-code-format.md)'s code recycling a stale cache can resolve to a *different* room than the one it was written for. The relay-TTL coupling exists either way; pretending it doesn't just hides it from readers.

### Option C: Short cache (1 hour)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| User experience | Frequently absent banner |
| Cross-package coupling | Loose |
| Team familiarity | Standard |

**Pros:** entries are always fresh; no risk of pointing at a stale or recycled room.
**Cons:** misses the most common rejoin case — "back tomorrow morning". The relay supports a 24-hour return precisely because that's the realistic window ([ADR-0012](0012-snapshot-policy.md) trade-off analysis); a 1-hour cache throws away most of that benefit on the client side. Asymmetric retention windows are a recipe for confusion.

### Option D: Cache exact `expiresAt` returned by relay on join

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| User experience | Banner expires at the same instant the snapshot does |
| Cross-package coupling | Explicit, derived per-session |
| Team familiarity | Standard |

**Pros:** no drift possible — the relay tells the client exactly when the snapshot will be discarded for this specific room. Tolerates per-room TTL changes (e.g., a future "premium long-retention" mode).
**Cons:** requires the relay to expose an `expiresAt` field and update it on every disconnect (the TTL clock restarts when the last peer leaves, per ADR-0012). That's a protocol surface change for marginal benefit at v1 — the "premium retention" use case doesn't exist. The `lastSeenAt + 24h` heuristic is a faithful approximation because clients write `lastSeenAt` on every screen change and rejoin resets it.

## Trade-off Analysis

Option A wins because it makes the invariant *visible*. The cost of the alignment is that the two TTLs must move together; the benefit is that they always do, and the recycling-aware nature of [ADR-0008](0008-room-code-format.md) means "drift" is not a UX papercut, it's a correctness bug. Option B's "be lazy, learn from failures" approach moves the same coupling underground — drift becomes invisible until users complain.

Option D is the principled long-term answer if [ADR-0012](0012-snapshot-policy.md) ever gains per-room TTL configuration. Today there is no such variation; adding the protocol field would be premature.

The decision to add `passwordHash` only on the CLI is intentional asymmetry, and it is a real security posture choice rather than a UX shortcut:

- The mobile client's join flow always involves a UI sheet capable of re-prompting; "type your password" is a one-tap recovery if the cache is missing. The cache adds threat surface (a stolen device's Preferences store gives the thief a usable credential) for no UX benefit, so we skip it.
- The CLI's `hnch resume` is one command — re-prompting on every resume effectively makes the feature useless for password-protected rooms, which are the rooms users most want to resume cleanly. The hash format is already defined by [ADR-0017](0017-password-hashing-drop-invite-only.md) and the value is already what travels on the wire (PBKDF2-SHA-256, 100k iterations, room UUID as salt — never the plaintext password), so caching it doesn't lower the abstraction. The local-trust concern is to be mitigated with `0600` file permissions on `~/.config/hnch/last-session.json` (see Action Items for the current code gap) and we treat the CLI config directory as a local-trust boundary the same way [ADR-0021](0021-cli-package.md) does for `participantId`.

The shared base shape pulls its weight precisely because the invariant is cross-package. If the field set ever changes, it changes in `@hnch/shared` and both clients pick it up; isolated copies in each package would be a parallel-implementation hazard exactly the way [ADR-0021](0021-cli-package.md)'s parity contract warns against.

## Consequences

**Easier:**
- "Back tomorrow morning" is one tap (mobile) or `hnch resume` (CLI). The success rate matches the relay's actual ability to serve the rejoin.
- Banner / resume never offer a room the relay would reject for staleness or recycling — the recovery UX is "show banner, tap, succeed" rather than "show banner, tap, fail, dismiss banner".
- The cross-package coupling is documented in one place, so a future TTL change has a checklist (this ADR's revisit trigger).

**Harder:**
- The cache TTL is no longer a free product knob. Anyone wanting to lengthen it has to start with [ADR-0012](0012-snapshot-policy.md). That's the right friction.
- The CLI's `passwordHash` storage means a stolen `~/.config/hnch/last-session.json` lets the thief rejoin the cached room until the snapshot TTL expires. That's the same trust posture as [ADR-0021](0021-cli-package.md)'s `participantId` storage, but it's worth flagging — a CLI user with a sensitive room should clear `~/.config/hnch/` on shared machines. The required `0600` permission is the floor once implemented, not a substitute for that hygiene.

**Revisit triggers:**
- [ADR-0012](0012-snapshot-policy.md) gains a different snapshot TTL or per-room TTL configuration → this ADR is updated or superseded in the same PR.
- A third client appears (e.g., a server-side bot) and needs to participate in the cache contract — likely a new ADR rather than an extension here.
- User reports of "stale banner" or "rejoin fails despite recent banner" → first investigate whether the relay's TTL clock is being kept in sync with what we think it is; the bug class is "the two TTLs disagree", not "our TTL is wrong".
- Demand for a "remember my password" toggle on the mobile client → would re-open the asymmetry between mobile and CLI; should be done as a new ADR that covers the mobile platform-store properties and the threat model deliberately, not as a silent extension.

## Action Items

- [ ] Once accepted, update `adr/README.md` index with this entry.
- [ ] Update CLAUDE.md "Current decisions at a glance" with a one-liner referencing the cache invariant.
- [ ] Cross-link from [ADR-0012](0012-snapshot-policy.md) (typo-class addition) noting the cache TTL is bound to the snapshot TTL by this ADR.
- [ ] Cross-link from [ADR-0021](0021-cli-package.md) (typo-class addition) noting the `last-session.json` file's TTL contract is fixed by this ADR.
- [ ] Cross-link from [ADR-0017](0017-password-hashing-drop-invite-only.md) (typo-class addition) noting the CLI exception that caches the pre-hashed password.
- [ ] Cross-link from [ADR-0004](0004-local-persistence-sqlite-indexeddb.md) (typo-class addition) noting Preferences is intentionally chosen for this single-row pointer rather than the SQLite path that ADR establishes.
- [ ] **Gap-closing follow-up (tracked under impl task T22):** `packages/cli/src/last-session.ts:65` currently writes `last-session.json` with the default mode. Update the write to apply mode `0600` and add a test or assertion that fails on broader permissions.
- [ ] **Gap-closing follow-up (tracked under impl task T22):** the CLI's WS-layer rejection handler at `packages/cli/src/index.ts:236` covers `wrong-password` and `room-full` but not `unknown-room`. Tighten it to call `clearLastSession()` (and surface a "session expired" UX) on close code `4001` so the policy in Decision §4 holds on both the HTTP resolve path and the WS path. Mobile already covers both paths.
- [ ] Verify both consumers (`packages/client/src/app/core/last-session.service.ts` and `packages/cli/src/last-session.ts`) match the shared shape from `packages/shared/src/last-session.ts`.
