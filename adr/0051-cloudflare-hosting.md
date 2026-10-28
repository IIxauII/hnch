# ADR-0051: Hosting — Cloudflare Workers and Durable Objects replace the IONOS VPS

**Status:** Proposed
**Date:** 2026-10-28

Supersedes [ADR-0029](0029-relay-deployment.md) (fully; VPS left idle, not decommissioned). Supersedes the storage clause of [ADR-0012](0012-snapshot-policy.md) (TTL, keying and content-blindness hold). Partially supersedes [ADR-0027](0027-test-only-relay-surfaces.md) (its "persist outside in-memory store" clause). Caveats [ADR-0017](0017-password-hashing-drop-invite-only.md) ("persisting hashes" trade-off; a digest of the hash now persists). Partially supersedes the `deploy-relay.yml` cross-arch clause of [ADR-0049](0049-self-hosted-runner-pool-current-state-consolidation.md). ADR-0052 (runner pool size, branch `worktree-runner-pool-2`, not yet on main) also partially supersedes ADR-0049; at Accept, merge into one parenthetical and one index cell, `ADR-0051 (partial), ADR-0052 (partial)`. Source: [spec](../docs/specs/cloudflare-hosting.md). Plan: [plan](../docs/plans/cloudflare-hosting.md).

## Context

- Today: one IONOS VPS (1 vCPU, 1 GB RAM) runs Caddy and the Node relay under systemd ([ADR-0029](0029-relay-deployment.md)). Every relay deploy restarts it: 10–30 s outage, every room lost.
- Rooms live in RAM only. [ADR-0012](0012-snapshot-policy.md): "Storage: in-memory only; relay restart/redeploy discards snapshots."
- Owner settled 2026-10-28:
  - DNS moves to Cloudflare (zone `hnch.dev`, Active since 2026-10-28). Registration stays at IONOS. No `@hnch.dev` mail.
  - Relay ported to Cloudflare. Room state stored there, EU jurisdiction, deleted 24–25 h after the last peer leaves.
  - Free plan only. Limit hit → relay errors until 00:00 UTC; never a bill. Workers Paid is fallback only.
  - Wire protocol, REST shape, close codes and client behaviour unchanged. Released CLIs and native builds work with no update.
  - One full cutover. Downtime accepted (no users yet). No `next` test host: test on `hnch.dev`, fix forward.
  - VPS untouched. Decommission out of scope.
- Compatibility contract, unchanged by this ADR:
  - [ADR-0001](0001-networking-crdt-over-relay.md): content-blind relay. Forwards opaque Yjs updates, never parses them.
  - [ADR-0008](0008-room-code-format.md): code format; code retired for the TTL window.
  - [ADR-0009](0009-access-control-relay-tokens.md) / [ADR-0017](0017-password-hashing-drop-invite-only.md): relay-enforced password; PBKDF2-SHA-256, 100k iterations, room-UUID salt.
  - [ADR-0016](0016-client-relay-connection-handshake.md): `GET /rooms/:code`, then `WS /ws/:uuid?did&pw`. Unknown UUID pre-upgrade `404`; malformed pre-upgrade `400`; post-upgrade rejections use close codes 4001–4099.
  - [ADR-0024](0024-participant-cap.md): 20 sockets per room; 21st closed `4006`.
  - [ADR-0035](0035-wrong-password-post-upgrade-close.md): wrong password is post-upgrade close `4002`.
  - [ADR-0050](0050-reconnect-reconciliation.md): "Relay replays live states to a fresh socket at their current clocks." Load-bearing after idle and after eviction. Also keepalive parity (requirement): a lone client must keep receiving app-level traffic. The Node relay renews its own `{}` awareness state every 15 s to every socket: the y-protocols `Awareness` it creates per room (`packages/relay/src/room-store.ts:125`) renews its local state on that interval (y-protocols `awareness.js`), and `ws-connection.ts` fans the update out. y-websocket 3.0.0 reconnects after 30 s with no app message (`messageReconnectTimeout`). Measured: Node relay 0 reconnects in 120 s for a lone peer; prototype 3. The Worker must match.
  - [ADR-0014](0014-repo-layout-pnpm-workspaces.md): `packages/relay` keeps its name. [ADR-0021](0021-cli-package.md): CLI parity with the PWA.
  - [ADR-0027](0027-test-only-relay-surfaces.md): `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` need an equivalent on the new runtime.
- G0 (2026-10-28, PASS, both Worker variants):
  - Every relay path, including the WS `101`, answered by the relay; SPA and headers correct.
  - Two Node processes using the real `connectToRelay` and `ws` 8.20.1 synced with 0 closes.
  - Held sockets survived 300 s across a web redeploy with 0 closes.
  - A busy room on old DO code kept running 3–5 min after deploy, then all sockets closed `1006` together and resynced on new code in 0.35–0.45 s, state kept.
- Prototype (throwaway, Workers Free, EU jurisdiction):
  - Unmodified `@hnch/shared` relay client: 14/15 smoke checks pass (handshake, sync both ways, presence, 4002, 400 and 404 then lookup, password change, fresh device after room empties, case-insensitive codes, 4006 cap).
  - SQLite-backed DO and `eu` jurisdiction work on Free. Local `workerd` refuses jurisdictions.
  - Alarm deletion confirmed at test TTL. Hibernated DO replayed presence to a newcomer in 21 ms.
  - Presence finding "B sees A leave" is seen only in the prototype smoke script. It fails identically on the Node relay. Pre-existing, not an e2e blocker; tracked in #542 (related #531). The e2e suite is green on the Node relay today.
- Unverified / open:
  - Inbound WS accounting on Free: 1:1 (plan budget assumes it) or 20:1. Undocumented.
  - Behaviour of open sockets when a daily cap is hit. Undocumented.
  - Outbound WS frame size limit. Undocumented.
  - Static asset requests counted against Worker requests: plan assumes not (no `run_worker_first`). Verify after switch.
  - Cloudflare-side deletion and backup of DO storage after the alarm.
  - Cloudflare DPA and data-location terms: owner's call; not reviewed here.

## Decision

PWA and relay move from the IONOS VPS to the Cloudflare free plan, served from routes on the `hnch.dev` zone; DNS moves to Cloudflare and registration stays at IONOS. The relay is ported in place to Workers + Durable Objects, and room state persists in DO storage until 24–25 h after the last peer leaves.

- **Topology:** routes only, no Custom Domain (its DNS record is Cloudflare-owned and read-only).
  - `hnch-web` (`packages/client`): Workers Static Assets from `www`, SPA fallback, no `run_worker_first`, on `hnch.dev/*`.
  - `hnch-relay` (`packages/relay`): on `hnch.dev/health*`, `hnch.dev/rooms*`, `hnch.dev/ws/*`. More specific relay routes win (G0).
  - `/health*`, not `/health`: exact match misses query strings and trailing slashes. Matching is case-sensitive; `/Rooms` and bare `/ws` fall through to the SPA, as today.
  - Single origin, no CORS ([ADR-0029](0029-relay-deployment.md) property).
  - A client release redeploys only `hnch-web`; relay DOs are not restarted.
- **Switch:** routes deploy inert while the apex and `www` records are DNS-only (VPS still serves). Cutover = proxy the apex and `www` records together and set `HNCH_LIVE`. Workers routes run only on proxied hostnames.
- **Edge:** Always Use HTTPS on. `www` → apex 301 redirect rule (closes #543).
- **Relay objects:**
  - `Room` DO per room UUID: Y.Doc, presence, password digest, participant cap, expiry alarm.
  - `Codes` DO per room code: unique claim, code → UUID; released on deletion.
  - `Expiry` DO per UTC day: backstop index of rooms created that day.
  - SQLite-backed. `eu` jurisdiction in prod; `JURISDICTION=none` only in dev and e2e.
- **Storage:** room state (opaque Yjs updates plus room metadata) persists in DO storage. Writes coalesced (flush at ≤5 s or 512 KiB). Supersedes the ADR-0012 storage clause.
  - Deletion 24–25 h after the last peer leaves: hourly occupancy check; tombstone first; `Codes` release (idempotent); then `deleteAll`.
  - Expiry checked and alarm re-armed on every entry. Daily 04:00 UTC cron sweeps the last 30 `Expiry` days as backstop.
- **Password at rest:** stores `SHA-256(roomUuid ‖ passwordHash)`. `pw` is compared the same way, constant-time. Nothing changes on the wire.
  - Stored so a deploy cannot silently drop a room's password. PBKDF2 scheme unchanged.
  - This is the successor that [ADR-0017](0017-password-hashing-drop-invite-only.md) requires before hashes persist.
- **Keepalive:** requirement under ADR-0050 (see Context). Mechanism is piggyback: on any inbound message on socket S, if S has been sent nothing for ≥10 s, relay sends S one `{}` awareness renewal. No extra DO requests.
  - Pre-agreed fallback, default off: an alarm keepalive, armed only while every socket is quiet for >20 s, behind a constant. A relay release turns it on if the hidden-tab trigger fires (2- or 3-peer room, all tabs hidden, >2 reconnects per 10 min).
  - Hidden-tab residual measured on `hnch.dev` after the switch.
- **Health and failures:**
  - `/health` → `200 {status:'ok', version}`. Shallow: no DO call, no counts, no config or gate state.
  - Deploy smoke also checks `GET /rooms/000000` → `404 {reason:'unknown-room'}`, which exercises Worker → DO.
  - DO failure → `503 {error:'unavailable'}` with no `reason`. A 404 is returned only when a DO positively reports unknown; under ADR-0050 a 404 ends sessions.
- **Deploy coexistence:** old and new DO code run side by side for ≥5 min after each relay deploy.
  - RPC and meta changes are additive, or expand/contract across two releases ≥10 min apart.
  - DO class rename or delete needs a migration; `wrangler rollback` cannot cross one.
- **Abuse guard:** one free-plan rate-limit rule: `http.request.uri.path eq "/rooms"`, 10 per 10 s per IP, block 10 s. The rule also counts native `OPTIONS` preflights. It is a speed bump, not quota protection. `/ws/*` and `GET /rooms/:code` are never limited (owner, 2026-10-28).
- **Logs:** Workers Logs on with `observability.logs.invocation_logs = false`. `console` lines stay content-free ([ADR-0028](0028-telemetry-posture.md) stdout discipline). Marker test after switch.
- **Test surfaces ([ADR-0027](0027-test-only-relay-surfaces.md)):**
  - `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` map to Worker vars. `scripts/dev.mjs` passes them per invocation, only when set, for the e2e `webServer` and `@hnch/relay/testing`.
  - Plain local dev runs production defaults (cap 20, test routes off). `.dev.vars` is not used for them.
  - Deploy asserts both are absent from `wrangler.jsonc`.
  - Gate-off, unknown UUID and malformed UUID keep the same 404 contract.
  - The ADR-0027 "persist outside in-memory store" clause is superseded: test routes write nothing new.
- **Credentials:** `CLOUDFLARE_API_TOKEN` with Workers Scripts: Edit (account-wide) and Workers Routes: Edit on `hnch.dev`. No DNS permission.
  - Repo secret, referenced only by the deploy jobs (no environment secrets on GitHub Free private repos). Runner pool holds it per ephemeral job.
  - This is the pool's only long-lived deploy credential.
- **Deploy:** CI on the self-hosted pool ([ADR-0049](0049-self-hosted-runner-pool-current-state-consolidation.md)) runs `wrangler deploy`, pinned at 4.151.3. The `npm_config_target_*` cross-arch pin is removed; no native artifact ships.
  - Deploy refuses to remove a live `hnch.dev` route.
  - Post-switch smokes are gated on `HNCH_LIVE`.
- **DNS and registrar:** `hnch.dev` zone on Cloudflare; apex and `www` DNS-only until cutover, proxied at cutover. No mail records. Registration stays at IONOS, with its NS delegation pointing at Cloudflare.
- **VPS and rollback:** VPS left idle, not decommissioned. Rollback = set records back to DNS-only; Caddy serves the PWA (kept current by `deploy-client.yml`) and relay 1.2.1, frozen. Rooms created on Cloudflare are lost. Sockets open to the VPS stay until they reconnect.
- **Node relay:** removed with the VPS. No self-host fallback kept.

## Trade-offs

- Room data sits at Cloudflare up to 25 h: opaque CRDT bytes, password digest, and user-entered `displayName`, votes, agenda titles and ticket IDs ([schema](../docs/schema.md)). ADR-0012's "Nothing on disk → privacy intact" premise is gone. ADR-0028 cites in-memory snapshots as its privacy basis; its decision (no telemetry) is unaffected, its context is stale.
- Content-blindness ([ADR-0001](0001-networking-crdt-over-relay.md)) holds in code, not in transport. TLS terminates at Cloudflare, which can read frames and stored bytes. No hnch-side at-rest encryption. Privacy rests on Cloudflare's terms.
- Cloudflare becomes processor of user-entered room data. ADR-0028's "no third-party DPA" consequence no longer holds for relay data. DPA not reviewed here.
- PBKDF2 is not memory-hard. Digests now at rest; exposure is whoever controls the Cloudflare account and DO storage.
- Free-plan caps are per account and shared with the account's other Workers. Binding limit: DO duration ≈ 29 occupied room-hours/day (13,000 GB-s ÷ ~450 GB-s per 8-peer, 1-hour room). Also 100k DO requests and 100k rows written per day.
  - Exhausted on purpose (hold ~29 rooms open for an hour; ~100k cheap requests; room spam) or by accident (tabs left open all day). Result: relay down for everyone until 00:00 UTC.
  - Usage ≈ 0 today; usage notifications on. Stated, not mitigated. Owner accepted.
- Storage: 5 GB per account, 1 GB per DO (plan). Not binding at expected size.
- Observability: no process metrics; `/health` loses counts. Workers Logs free tier: 200k events/day and 3-day retention now; from 2026-12-01, 0.5 GB/day and 7-day retention. Ingestion stops at the limit; the relay does not.
- Vendor lock-in to Workers and DO APIs (SQLite DO, alarms, hibernating WebSockets).
- Dev and prod diverge: no `eu` jurisdiction locally.
- Deploys still drop sockets; they resync in 0.35–0.45 s (G0) via [ADR-0025](0025-reconnect-backoff.md) and [ADR-0050](0050-reconnect-reconciliation.md). Not zero-blip.
- Cutover loses rooms live on the VPS once (RAM only). Downtime accepted.
- Route misconfiguration risk: a missing route sends `GET /rooms/:code` to the SPA fallback, which returns `index.html` with 200. Mitigated by a pre-switch route check via API and post-switch smokes, not by design.
- Latency: join + first sync 200–400 ms on Cloudflare vs ~50 ms local. VPS join + sync not measured. "Same ballpark" holds for `/health` only (~100 ms both).
- IONOS DNS zone is now empty. On 2026-10-28, resolvers that had cached the IONOS NS got NODATA for `hnch.dev` until the NS TTL (3–24 h) expired.
- Cloudflare CLI pinned at wrangler 4.151.3; upgrades are a pin change.

## Consequences

- Easier: no VPS to patch, pay for or watch its 1 GB ceiling. Rooms survive relay deploys; this meets the ADR-0001 revisit trigger "relay-restart loses sessions". One DO per room is single-threaded, so the 20-peer cap check stays race-free. Single origin and cache rules kept. Client releases never touch relay DOs. DNS in one account.
- Harder: shared daily cap is an availability risk. Keepalive, write coalescing and TTL logic are custom and load-bearing. Deploys need expand/contract discipline. Cloudflare-specific runtime. The API token is account-wide. No process metrics. IONOS NODATA window at DNS switch.
- Revisit when:
  - Inbound WS accounting measured, or any daily cap hit: decide Workers Paid (fallback only).
  - Hidden-tab trigger fires: enable the keepalive alarm fallback (relay release; no new ADR).
  - Route precedence or route miss seen in prod: topology change needs a new ADR.
  - Rate limit added to `GET /rooms/:code`: [ADR-0050](0050-reconnect-reconciliation.md) lookup must tell 429 from silence.
  - Room TTL changes: [ADR-0012](0012-snapshot-policy.md) successor (ADR-0012 owns the TTL).
  - Invocation logs turned on, or log content changes: review [ADR-0028](0028-telemetry-posture.md).
  - Data-location or DPA terms change, or `eu` pin unavailable on the plan: revisit storage placement.
  - Test var that weakens admission: successor per ADR-0027.
  - Presence replay or keepalive regresses against the ADR-0050 contract: block release.
  - Lock-in cost realized, or a second host needed: new ADR.
