# ADR-0051: Hosting — Cloudflare Workers, Durable Objects and Static Assets replace the IONOS VPS

**Status:** Proposed
**Date:** 2026-10-28

Supersedes [ADR-0029](0029-relay-deployment.md) (fully). Supersedes the storage clause of [ADR-0012](0012-snapshot-policy.md) only; TTL, keying and content-blindness hold. Supersedes the `deploy-relay.yml` cross-arch clause of [ADR-0049](0049-self-hosted-runner-pool-current-state-consolidation.md) only; the runner pool stands. Source: [spec](../docs/specs/cloudflare-hosting.md).

## Context

- Today: one IONOS VPS (1 vCPU, 1 GB RAM) runs Caddy (TLS, PWA static, reverse proxy) and the Node relay under systemd ([ADR-0029](0029-relay-deployment.md)). DNS and registrar sit at IONOS.
- Every relay deploy restarts the process: 10–30 s outage, every room lost.
- Rooms live in RAM only. [ADR-0012](0012-snapshot-policy.md): "Storage: in-memory only; relay restart/redeploy discards snapshots."
- Owner settled 2026-10-28 (spec, "Settled by owner"):
  - DNS moves to Cloudflare (zone `hnch.dev`, Active since 2026-10-28). The registration stays at IONOS (owner decision 2026-10-28). No `@hnch.dev` mail.
  - Relay ported to Cloudflare. Room state stored there, EU jurisdiction where the platform allows, deleted 24 h after the last peer leaves.
  - Free plan only. If a free daily limit is hit, the relay errors until 00:00 UTC. Never a bill. Workers Paid is a fallback only.
  - Wire protocol, REST shape, close codes and client behaviour unchanged. Released CLIs and native builds work with no update.
- Compatibility contract, unchanged by this ADR:
  - [ADR-0001](0001-networking-crdt-over-relay.md): content-blind relay. Forwards opaque Yjs updates, never parses them.
  - [ADR-0008](0008-room-code-format.md): code format; code retired for the TTL window.
  - [ADR-0009](0009-access-control-relay-tokens.md) / [ADR-0017](0017-password-hashing-drop-invite-only.md): relay-enforced password; PBKDF2-SHA-256, 100k iterations, room-UUID salt.
  - [ADR-0016](0016-client-relay-connection-handshake.md): `GET /rooms/:code`, then `WS /ws/:uuid?did&pw`. Unknown UUID is pre-upgrade `404`; malformed is pre-upgrade `400`; rejections after upgrade use close codes 4001–4099.
  - [ADR-0024](0024-participant-cap.md): 20 sockets per room; 21st closed `4006`.
  - [ADR-0035](0035-wrong-password-post-upgrade-close.md): wrong password is post-upgrade close `4002`.
  - [ADR-0050](0050-reconnect-reconciliation.md): "Relay replays live states to a fresh socket at their current clocks." Load-bearing after idle and after eviction.
  - Keepalive parity: a lone client must keep receiving inbound traffic at the cadence the Node relay provides, or y-websocket's no-message reconnect fires. Worker relay must match this. Requirement, not yet confirmed on the Worker; the cadence source on the Node relay is being verified (no relay-side timer found in `packages/relay/src`).
  - [ADR-0014](0014-repo-layout-pnpm-workspaces.md): `packages/relay` keeps its name. [ADR-0021](0021-cli-package.md): CLI parity with the PWA.
  - [ADR-0027](0027-test-only-relay-surfaces.md): `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` need an equivalent on the new runtime. Its clause "MUST NOT ... persist outside in-memory store" is read here as "outside the room store"; test routes write nothing new.
- Prototype (throwaway, `packages/relay/prototype-cloudflare`, deployed on Workers Free with EU jurisdiction, 2026-10-28). Measured:
  - Unmodified `@hnch/shared` relay client: 14/15 smoke checks pass (handshake, sync both ways, presence, 4002, 400 and 404 then lookup, password change, fresh device after room empties, case-insensitive codes, 4006 cap).
  - Failing check "B sees A leave" is a presence finding from the prototype smoke script only. It fails identically on the Node relay. Not investigated; tracked separately, not a blocker. The e2e suite is green on the Node relay today.
  - SQLite-backed DO runs on Free. `eu` jurisdiction works on the deployed Worker; local `workerd` refuses it, so dev runs unpinned.
  - Alarm: room emptied at T was gone at T+120 s (test TTL); its code then resolved to `unknown-room`.
  - Hibernation: DO woke with 1 live socket. A newcomer saw the silent peer's presence 21 ms after connect, with BroadcastChannel disabled.
  - Deploy with 3 live peers: sockets dropped, back and synced in ~250 ms; votes and presence intact.
  - CPU: DO WebSocket message p50 0 ms, p95 1 ms. Front `POST /rooms` 4–6 ms (Free cap 10 ms). Cold load of a 10,000-round / 1 MB room: 137 ms CPU in one DO event, succeeded. Fresh-device load 735 ms.
  - Static: SPA fallback works; shell `no-cache, must-revalidate`; hashed JS `immutable` via `_headers`; `run_worker_first` sends `/health`, `/rooms*`, `/ws/*` to the Worker.
  - Latency: `/health` about 100 ms on both stacks from the dev network. Join + first sync 200–400 ms on Cloudflare vs ~50 ms on a local relay. VPS join + sync was not measured.
- Unverified (open):
  - Free-plan accounting of inbound WebSocket messages: 1:1 or 20:1 against the 100k requests/day cap. Billing usage returned 403, so not measurable here.
  - 1:1 worst case ≈ 400 peer-hours/day service-wide. That equals one inbound message per peer per 15 s (the awareness renewal interval in ADR-0050), before any sync traffic.
  - Whether static asset requests count against the Worker request cap.
  - Behaviour of already-open sockets when the daily cap is hit.
  - Free-plan storage cap for DO SQLite.
  - Two-Worker topology: WebSocket through a route, and route vs custom-domain precedence on one hostname. Test pending on `next.hnch.dev`. Fallback is one Worker serving both (proven in prototype).
  - Cloudflare-side deletion and backup behaviour of DO storage after the alarm.
  - Cloudflare DPA and data-location terms: not reviewed.
- Workers routes only run on a proxied (orange-cloud) record, and a Workers Custom Domain creates its own DNS record and cannot be added over an existing CNAME ([routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), checked 2026-10-28). Routes on a hostname run before that hostname's Custom Domain Worker. The owner's "DNS-only records" applies while the VPS still serves; it ends at cutover.

## Decision

PWA and relay move from the IONOS VPS to the Cloudflare free plan; DNS moves to Cloudflare, and the registration stays at IONOS. The relay is ported in place to Workers + Durable Objects, and room state persists in DO storage until 24 h after the last peer leaves.

- **PWA:** Workers Static Assets, custom domain `hnch.dev`. SPA fallback. Cache rules as today: hashed assets `public, max-age=31536000, immutable`; shell and all other paths `no-cache, must-revalidate`.
- **Relay:** `packages/relay` replaced in place. Worker on routes `hnch.dev/rooms*`, `hnch.dev/ws/*`, `hnch.dev/health`. Two SQLite-backed Durable Object classes, `eu` jurisdiction in prod:
  - `Room`, one per room UUID: Y.Doc updates, presence, password hash, participant cap, expiry alarm.
  - `Codes`, one per room code: unique code claim, code → UUID. Released with the room.
- **Storage:** room state (opaque Yjs updates plus room metadata, including the password hash) persists in DO storage. Alarm deletes it 24 h after the last peer leaves; a rejoin cancels the alarm. Supersedes the storage clause of ADR-0012.
  - Password hash is stored so a deploy cannot silently drop a room's password. Hash scheme unchanged. This ADR is the successor that [ADR-0017](0017-password-hashing-drop-invite-only.md) requires before hashes persist.
- **Topology:** two Workers on one hostname. PWA Worker on the custom domain; relay Worker on the routes above. A client deploy does not restart DOs. Single origin, no CORS (the [ADR-0029](0029-relay-deployment.md) property). Fallback: one Worker serves both.
- **Node relay:** deleted with the VPS. No self-host fallback kept.
- **Abuse guard:** one Cloudflare free-plan rate-limiting rule on `POST /rooms`. `GET /rooms/:code` and WS upgrades are not rate-limited by this ADR.
- **`/health`:** `{ status, version }` only. `rooms`, `peers` and `uptime` dropped. No client calls `/health`; the deploy smoke test and tests are the only consumers.
- **Test surfaces ([ADR-0027](0027-test-only-relay-surfaces.md)):** `HNCH_ENABLE_TEST_ROUTES` and `HNCH_ROOM_CAP` are set per invocation by the e2e harness only, never in `.dev.vars` and never in production config. Plain local dev keeps production defaults (cap 20, test routes off). `.dev.vars` carries `JURISDICTION=none` only, since local `workerd` does not implement jurisdictions. Prod deploy asserts both vars absent. Gate-off, unknown UUID and malformed UUID keep the same 404 contract.
- **Keepalive:** Worker relay sends each socket the same inbound traffic cadence as the Node relay, so y-websocket's no-message reconnect does not fire on a lone client. Requirement; verified before Accept.
- **DNS and registrar:** `hnch.dev` zone on Cloudflare; nameservers switched from IONOS. DNS-only A/AAAA records to the VPS until cutover; at cutover they are replaced by the Custom Domain's Cloudflare-managed, proxied record, which the relay routes need. No mail records. The registration stays at IONOS, whose nameserver setting must keep pointing at Cloudflare.
- **Deploy:** CI on the self-hosted pool ([ADR-0049](0049-self-hosted-runner-pool-current-state-consolidation.md)) runs the Cloudflare deploy with a Cloudflare API token scoped to Workers and this zone's routes, stored as a repo secret. Prod smoke: `https://hnch.dev/health` returns `ok`; `https://hnch.dev/` contains `<app-root`. The `npm_config_target_*` cross-arch pin is retired: no native artifact ships.

## Trade-offs

- Room data sits at Cloudflare for up to 24 h: opaque CRDT bytes, password hash, and user-entered `displayName`, votes and agenda titles/ticket IDs ([schema](../docs/schema.md)). ADR-0012's "Nothing on disk → privacy intact" premise is gone. ADR-0028 cites in-memory snapshots as its privacy basis; its decision (no telemetry) is unaffected, its context is stale.
- Content-blindness ([ADR-0001](0001-networking-crdt-over-relay.md)) holds in code, not in transport: TLS terminates at Cloudflare, and Cloudflare can read WebSocket frames and stored bytes. Privacy relies on Cloudflare's terms. No hnch-side at-rest encryption in this ADR.
- Cloudflare becomes processor of user-entered room data. ADR-0028's "no third-party DPA" consequence no longer holds for relay data. DPA not reviewed here.
- PBKDF2 is not memory-hard ([ADR-0017](0017-password-hashing-drop-invite-only.md): "persisting hashes ... requires superseding ADR"). Hashes now at rest; exposure is whoever controls the Cloudflare account and DO storage. Scheme not revisited.
- Free-plan daily caps are hard. Hitting one takes the relay down for everyone until 00:00 UTC. Owner accepted. The rate-limit rule covers `POST /rooms` only.
- Vendor lock-in to Workers and DO APIs (SQLite DO, alarms, hibernating WebSockets). ADR-0029 rejected PaaS partly on lock-in; this accepts it for the free tier.
- Dev and prod diverge: EU pin off locally; storage placement differs.
- Two-Worker routing unverified. Failure mode: a route miss sends `GET /rooms/:code` to the PWA Worker's SPA fallback, which returns `index.html` with 200. The client then fails to parse the lookup. Must be tested before Accept.
- `/health` loses global room and peer counts. Ops visibility drops to external curl plus the deploy smoke test.
- Latency: join + first sync 200–400 ms on Cloudflare vs ~50 ms local. "Same ballpark" holds for `/health` only, since VPS join + sync was not measured.
- Deploys still drop sockets (~250 ms in prototype, 3 peers). Clients reconnect via [ADR-0025](0025-reconnect-backoff.md) and [ADR-0050](0050-reconnect-reconciliation.md). Not zero-blip.
- Cutover loses rooms live on the VPS at switch time, once (RAM only).
- New secret: Cloudflare API token on the runner pool, same ephemeral-container posture as `NPM_TOKEN` in [ADR-0049](0049-self-hosted-runner-pool-current-state-consolidation.md). Cloudflare CLI version pinned like the runner image.

## Consequences

- Easier: no VPS to patch, pay for, or watch its 1 GB ceiling. Rooms survive relay deploys; this satisfies the ADR-0001 revisit trigger "relay-restart loses sessions". One DO per room is single-threaded, so the 20-peer cap check stays race-free. Single origin and cache rules kept. DNS and domain in one account.
- Harder: hard daily cap is an availability risk; 1:1 worst case ≈ 400 peer-hours/day service-wide. Two-Worker routing is a new failure mode. No process-level metrics. Cloudflare-specific runtime. Deploy jobs need Cloudflare credentials. DO storage deletion semantics unverified. Prototype presence finding "B sees A leave" (smoke script only, fails on Node relay too) tracked separately.
- Revisit when:
  - Inbound WebSocket accounting is measured, or any daily cap is hit: decide Workers Paid (owner: fallback only).
  - Two-Worker topology fails on `next.hnch.dev`: move to single-Worker topology; amend Decision (deploy coupling changes).
  - Rate limit added to `GET /rooms/:code`: [ADR-0050](0050-reconnect-reconciliation.md) lookup must tell 429 from silence.
  - Room TTL changes: [ADR-0012](0012-snapshot-policy.md) successor (ADR-0012 owns the TTL).
  - Data-location or DPA terms change, or `eu` pin unavailable on the plan: revisit storage placement.
  - Test var that weakens admission: successor per ADR-0027.
  - Presence replay regresses against the ADR-0050 contract: block release.
  - Lock-in cost realized, or a second host needed: new ADR.
