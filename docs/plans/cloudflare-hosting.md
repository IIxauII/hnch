# Host hnch on Cloudflare (Workers + Durable Objects) instead of the VPS

**Status:** Draft
**Date:** 2026-10-28
**Source spec:** docs/specs/cloudflare-hosting.md
**Shape:** Multi-PR: 4 PRs (1a, 1b, 2, 3-docs). The owner runs the Phase 0 ops and the Phase 3 switch.

## Summary

The relay moves to a Cloudflare Worker with three kinds of Durable Object (DO): `Room` (one per room UUID), `Codes` (one per room code) and `Expiry` (one per UTC day, a backstop that makes sure rooms get deleted). The PWA moves to an assets-only Worker.

Both Workers attach to `hnch.dev` through zone routes. Those routes are deployed early but stay inert while the apex DNS record is DNS-only. Cutover is one full switch: proxy the apex records, then verify on `hnch.dev` and fix forward. Only DNS is at Cloudflare; the domain registration stays at IONOS. The IONOS VPS is left untouched and idle, and decommissioning it is out of scope. (Reopened 2026-10-29: the VPS is removed; see [Decisions resolved](#decisions-resolved).) *(Superseded by [ADR-0054](../../adr/0054-vps-decommission.md): VPS deploys stopped 2026-10-29; the box is shut down after the switch.)*

Rooms now survive relay deploys. They persist, pinned to the EU, until 24–25 h after the last peer leaves, which is the ADR-0012 TTL plus the Node relay's hourly sweep jitter. The wire protocol, REST shape and close codes are unchanged, so released CLIs (1.1.1 onwards) and native builds keep working without a release. Structural decision: [ADR-0051](../../adr/0051-cloudflare-hosting.md) (Proposed; amendments listed under ADR impact).

## Approach

### Topology (D1-A, settled)

- Two Workers on one hostname, both attached by zone routes. The single origin of ADR-0029 is kept, so there is still no CORS for the PWA.
  - **`hnch-relay`** (`packages/relay`), on routes `hnch.dev/health*`, `hnch.dev/rooms*` and `hnch.dev/ws/*`.
    - The trailing `*` on `/health*` is needed: G0 showed that exact `/health` misses `/health?x=1` and `/health/`.
    - Matching is case-sensitive. `/Rooms/…` and a bare `/ws` fall through to the SPA, which matches Caddy and the Node relay today.
  - **`hnch-web`** (`packages/client`): an assets-only Worker serving `packages/client/www`, with SPA fallback and `_headers`, on route `hnch.dev/*`. The more specific relay routes win (G0).
  - A client release redeploys only `hnch-web`. In G0, relay sockets held for 300 s across a web redeploy with 0 closes. A relay release is a staggered blip (contract item 12).
- **Routes are inert until the switch.** Workers routes only run on proxied hostnames.
  - Both Workers deploy with their `hnch.dev` routes from their first release (1b and 2).
  - The apex stays DNS-only and points at the VPS until Phase 3, so the VPS keeps serving users.
  - **The switch** is setting the apex records to proxied (`www` has been proxied since Phase 0 and only redirects). Both Workers then go live at once.
- **No proving ground** (D3/D4, settled). There is no `next.hnch.dev` and no pre-cutover test build. Pre-cutover confidence comes from CI (unit tests on workerd, e2e against a local workerd relay) plus G0. Real-network checks run on `hnch.dev` right after the switch.
- **The VPS is left as is.** After the switch it gets no traffic, except sockets already open to it (they stay until they reconnect) and resolvers still holding the old A record (until its TTL expires). That leaves an incidental rollback: set the records back to DNS-only and Caddy serves again, with its relay frozen at 1.2.1. (Reopened 2026-10-29: the VPS is removed; see [Decisions resolved](#decisions-resolved).) *(Superseded by ADR-0054: the VPS gets no client deploys, so this rollback reaches a frozen build, and it ends when the box is shut down after the switch.)*

### Relay Worker: behavioural contract (parity with `packages/relay` today)

1. **Routes:**
   - `GET /health` (any query), `POST /rooms` (exact path), `GET /rooms/:code`, `PATCH /rooms/:uuid/access`, `WS /ws/:uuid`.
   - `OPTIONS *` → `204`.
   - Anything else that reaches the Worker (for example `/health/` or `/roomsXYZ`) → `404 {error:'not-found'}`.
   - CORS headers stay identical to the Node relay: `*`, `GET, POST, PATCH, DELETE, OPTIONS`, `Content-Type`. Native apps send a preflight `OPTIONS /rooms` before each `POST /rooms`, from `capacitor://localhost` or `https://localhost`.
2. **`POST /rooms`:**
   - Body: JSON, at most 4 KiB; an empty body counts as `{}`.
   - `passwordHash` is optional. If present it must be 64 lowercase hex, else `400 {error:'bad-request', detail}`.
   - Success → `201 {uuid, code}`.
   - Codes come from `generateRoomCode` (ADR-0008) and stay unique across live rooms through a CAS claim on `Codes`. A code becomes reusable only once its room is deleted or tombstoned.
   - After `init`, the room is registered with `Expiry(<UTC day>)` on a best-effort basis; a failure there never fails the create.
3. **`GET /rooms/:code`:**
   - The code is normalised with `normalizeRoomCode`.
   - Returns `200 {uuid, accessMode}` or `404 {reason:'unknown-room'}`.
   - Unauthenticated and never rate-limited (R7, ADR-0050).
4. **`PATCH /rooms/:uuid/access`:**
   - `passwordHash` may be hex, `null` or absent.
   - Returns `200 {accessMode}` or `404 {reason:'unknown-room'}`.
   - Open sockets are not evicted.
5. **`WS /ws/:uuid`:**
   - Non-upgrade request → `426`.
   - Unknown or tombstoned UUID → HTTP `404` before the upgrade.
   - Password room with no `pw` → HTTP `400` before the upgrade.
   - Wrong `pw` → accept, then close `4002 wrong-password`. The comparison is constant-time against the stored digest (item 16).
   - Open sockets ≥ cap → accept, then close `4006 room-full`.
   - Refused sockets never count as peers. Close codes come from `JOIN_REJECTION_CLOSE_CODES`.
   - Never rate-limited (settled 2026-10-28; R7: a 429 or 5xx on the upgrade makes y-websocket retry every ~2.5 s forever).
6. **Failure mapping:**
   - Any DO call that throws (overload, daily limit, storage error, RPC failure) → `503 {error:'unavailable'}` with **no `reason`**. This applies to HTTP routes and to the pre-upgrade check.
   - `404` is returned only when a DO positively reports that the room or code is unknown.
   - ADR-0050 treats any non-404 as "no verdict" and keeps retrying, so a platform failure never evicts sessions from clients.
7. **Sync:**
   - y-websocket wire format: `0` is sync, `1` is awareness; unknown types are ignored.
   - On accept, the relay sends sync-step-1, then every awareness state it holds.
   - It never echoes a sender's own update or awareness back to it.
   - Doc updates fan out immediately; storage writes are coalesced (item 10).
8. **Presence (load-bearing for ADR-0050):**
   - A fresh socket gets every awareness state the room holds, immediately, including after the DO hibernated, was evicted or restarted.
   - States survive hibernation through per-socket attachments (16 KiB cap).
   - A state not renewed for 30 s is neither replayed nor kept. This is checked lazily on inbound events.
   - When a socket closes, the states it announced are removed and the removal is broadcast.
9. **Keepalive (hard requirement; R4, measured):**
   - **Evidence:** y-websocket 3.0.0 closes any socket that receives no app message for more than 30 s, then reconnects. The Node relay renews its own `{}` awareness state every 15 s to every socket. With one lone client over 120 s, the Node relay caused 0 reconnects; the prototype caused 3.
   - **Requirement:** every open socket whose client is renewing gets an app-level frame at least every 15 s, including a lone peer.
   - **Mechanism (settled; owner may veto): piggyback.**
     - When the relay handles any inbound message on socket S, and S has been sent nothing for at least 10 s, the relay sends S one relay-own awareness renewal (`{}`, the same bytes the Node relay emits).
     - This costs 0 extra DO requests and 0 extra duration.
     - Clients drop states that have no `participantId` (R5).
     - The relay should keep one clientID per room across wakes (stored at init, with a time-derived clock).
   - **Known residual:** Chrome's intensive throttling batches timers in tabs hidden for more than 5 min. Lone hidden tabs, and rooms of 2–3 peers whose tabs are all hidden, may then reconnect about once a minute, at roughly 4 DO requests per reconnect.
     - Local workerd never hibernates, so this is measured on `hnch.dev` after the switch (Phase 3).
   - **Pre-agreed fallback:**
     - Trigger: any 2- or 3-peer room with all tabs hidden shows more than 2 reconnects per 10 min.
     - Fix: an alarm keepalive, armed only while every open socket has been quiet for more than 20 s. It shares the alarm slot with the TTL: `alarm = min(ttlCheck, keepaliveDue)`.
     - It ships in 1b behind a constant, default off. If the trigger fires, a fix-forward relay release switches it on.
   - **Tests:**
     - `packages/relay/src/room.keepalive.test.ts`, with an injected clock:
       - (a) a lone socket that renews 10 s after its last frame gets exactly one relay frame;
       - (b) a socket that got a peer update 3 s ago gets none;
       - (c) the first message after a forced DO restart gets one;
       - (d) with the fallback on, an all-quiet room arms the alarm and keeps the TTL deadline.
     - e2e `packages/e2e/tests/lone-peer-keepalive.spec.ts`: a lone host stays in the lobby for 75 s. It must see exactly one `/ws/` socket in `page.on('websocket')` and no "Reconnecting…". Uses `test.setTimeout(120_000)`; it already passes on the Node relay.
10. **Persistence (coalesced writes):**
    - Updates are broadcast at once and buffered for storage.
    - The buffer is flushed as one row (`Y.mergeUpdates`) when the first of these happens:
      - the oldest buffered update is 5 s old;
      - the buffer reaches 512 KiB;
      - the last socket closes;
      - a compaction is about to run;
      - any alarm fires.
    - No flush happens after the room is tombstoned.
    - **Durability trade:** if a deploy or eviction lands inside the 5 s window, those updates are lost from relay storage only. Reconnecting clients re-supply them through sync-step-2.
    - **Compaction:** once the log has more than 32 rows, one transaction writes snapshot chunks of at most 1 MiB each (the platform row maximum is 2 MB) and deletes the log.
    - `meta.schemaVersion` is set at init.
    - **Lazy doc load:** the doc is loaded only for a new socket, a sync message, compaction or deletion.
    - **Storage-write failure:** the room keeps relaying from memory, logs once, and never closes sockets because of it.
11. **TTL and deletion (ADR-0012; deletion 24–25 h after the last peer leaves).** Settled design; owner may veto.
    - **State:** `meta.lastOccupiedAt`, `meta.tombstonedAt` and the single alarm. Close events are never relied on.
    - **init:** `lastOccupiedAt = now`; alarm at `now + 1 h`.
    - **Alarm handler.** It flushes first, then:
      - sockets open → set `lastOccupiedAt = now` and re-arm at `now + 1 h`;
      - tombstoned → resume deletion;
      - `now ≥ lastOccupiedAt + TTL + 1 h` → delete;
      - otherwise → alarm at `lastOccupiedAt + TTL + 1 h`.
      - Its `catch` tries `setAlarm(now + 10 min)` before re-throwing.
    - **Re-arm on any entry** (`fetch`, upgrade, `webSocketMessage`, `webSocketClose`, `info`, `setPassword`, `expireIfDue`), at most once every 10 min per instance and on every constructor run:
      - if `meta` exists and `getAlarm()` is null → alarm at `now + 1 h`;
      - when accepting a socket, an alarm later than `now + 1 h` is pulled in to `now + 1 h`.
    - **Lazy expiry:** `info`, `fetch`/upgrade and `setPassword` first check "no open sockets and `now ≥ lastOccupiedAt + TTL + 1 h`". If it holds, they start deletion and answer `404`.
    - **Deletion, in this order:**
      1. Write `meta.tombstonedAt = now` and drop the flush buffer. From then on every entry answers unknown, upgrades are refused and flushes write nothing.
      2. `await Codes(code).release(uuid)`. It is idempotent: it deletes only if the stored value equals `uuid`, and succeeds if the entry is absent or holds another UUID. On failure, keep the tombstone and set the alarm to `now + 10 min`.
      3. `deleteAll()`.
      - A `Codes.claim` treats a holder whose `Room.info()` is null as free.
    - **Backstop sweep** (planner-decided; owner may veto):
      - `Expiry(<UTC day>)` lists the UUIDs created that day, plus the rooms a sweep moved there that day (one row per room).
      - A daily cron on `hnch-relay` at 04:00 UTC runs `sweep()` for each of the last 30 days: 30 DO requests, plus one per listed room it checks (at most 40 per day). `sweep()` calls `Room(uuid).expireIfDue()` → `deleted | gone | moved | live`, and drops the `deleted`, `gone` and `moved` entries.
        - For the 5 oldest days of the window (`RELIST_DAYS`) the cron passes today: a room that stays (not due, or its delete failed) registers itself under `Expiry(today)` and answers `moved`, so it stays covered however long it lives (#554). That is one more DO request per moved room, made by the room, not the sweep.
        - If the move fails, the room answers `live`, stays listed where it was, and the next sweep retries, up to 5 times before its index leaves the window. Only those 5 days move rooms, so live rooms don't pile into one index.
      - It uses one of the account's free cron slots.
    - **Tests:**
      - the alarm throws 7 times → the room still expires through lazy expiry and through the sweep;
      - storage writes throw during the alarm → re-armed on the next entry;
      - an upgrade or `GET /rooms/:code` between tombstone and release → `404`;
      - a flush after the tombstone writes nothing;
      - a failing release → retried, code freed later;
      - a double release, or one with a foreign UUID → no-op;
      - an unjoined room is deleted at about 25 h;
      - a room re-occupied at 23 h survives.
12. **Deploy coexistence (G0, measured):**
    - DO code updates roll out gradually.
      - A busy room kept running the **old** code for about 3–5 min after deploy. Then all its sockets closed with `1006` together and resynced on the new version in 0.35–0.45 s, with state kept.
      - Hibernated rooms woke on the new code without a close.
    - **Requirement:** old and new code must work side by side for **at least 5 min** after every relay deploy. That covers a new front Worker calling an old DO, old and new DOs calling each other, and old code reading rows written by new code.
      - RPC methods and meta fields are additive only.
      - Format changes go through expand/contract over **two releases at least 10 min apart**.
      - Renaming or deleting a DO class needs a migration, and `wrangler rollback` cannot cross one.
    - Post-switch deploy smokes retry `/health` for up to 60 s.
    - These rules go into `docs/deployment.md` in 1b.
13. **Data location:**
    - DOs are created in the `eu` jurisdiction.
    - The pin is on by default. Only an explicit `JURISDICTION=none` turns it off, and only in dev and e2e.
    - The deploy job fails if the deployed config turns it off.
14. **`/health`:** `200 {status:'ok', version}`, with `version` = `packages/relay/package.json#version` at build time.
    - It is shallow: no DO call, no counts, no config or gate state.
    - The deploy smoke additionally checks `GET /rooms/000000` → `404 {reason:'unknown-room'}` (`0` is outside the code alphabet). That exercises the Worker → DO path.
15. **Test-only surfaces** (ADR-0027, partially superseded by ADR-0051):
    - `HNCH_ENABLE_TEST_ROUTES='1'` mounts `DELETE /test/rooms/:uuid`, which runs item 11's deletion and returns `200 {evicted}`.
    - With the gate off, or for a malformed or unknown UUID, the route returns `404 {error:'not-found'}`.
    - `HNCH_ROOM_CAP` can only lower the cap: clamped to [1, 20], invalid values → 20.
    - Values are fixed per deployed version, and non-prod values are logged at WARN.
    - Only `scripts/dev.mjs` passes them. The deploy job asserts both are absent from `wrangler.jsonc`.
16. **Password hash at rest (D16-B, settled):**
    - The room stores `SHA-256(roomUuid ‖ passwordHash)` and compares the submitted `pw` the same way, in constant time. `PATCH` stores the digest too.
    - Nothing changes on the wire, and a leaked row is not the `pw` credential.
17. **Logs (D12-A, settled):**
    - Workers Logs on, with `observability.logs.invocation_logs = false`. `console` lines stay content-free.
    - Free-plan limits: today 200k events per day and 3-day retention. From 2026-12-01: 0.5 GB per day of ingest and 7-day retention, with no overage; ingestion just stops at the limit and resets at 00:00 UTC ([Cloudflare Observability pricing](https://developers.cloudflare.com/observability/pricing/)).
    - Marker test after the switch: send markers to `/health?probe=<m>` and to a WS upgrade with `?pw=<m>`, then search Workers Logs after 5 min. They must be absent. If they show up, turn observability off as a fix-forward.

### Data flow

```
GET  /rooms/:code ─▶ hnch-relay ─▶ Codes(code).lookup ─▶ Room(uuid).info (lazy expiry) ─▶ 200 | 404 | 503
POST /rooms ──────▶ hnch-relay ─▶ Codes(code).claim (CAS, retry ≤64) ─▶ Room(uuid).init ─▶ Expiry(day).register (best-effort)
PATCH …/access ───▶ hnch-relay ─▶ Room(uuid).setPassword (digest)
WS   /ws/:uuid ───▶ hnch-relay ─▶ Room(uuid).fetch: 404/400 pre-upgrade │ accept → 4002/4006 │ hibernatable socket
Room DO: Y.Doc (lazy) + Awareness ⇄ SQLite (meta{schemaVersion,lastOccupiedAt,tombstonedAt,digest}, log ≤32, snapshot ≤1 MiB chunks)
inbound msg on S ─▶ apply/broadcast ─▶ buffer (≤5 s) ─▶ S quiet ≥10 s? relay renewal to S
alarm (hourly while occupied) ─▶ occupied? stamp : due? tombstone → Codes.release → deleteAll : re-arm
cron 04:00 UTC ─▶ Expiry(day−1…day−30).sweep ─▶ Room.expireIfDue: due? delete : (index day−26…day−30? Expiry(today).register, moved)
```

### Free-plan budget (information; per account, daily, reset 00:00 UTC; inbound WS counted 1:1)

Usage today is about 0 (VPS `/health`: 0 rooms, 0 peers). The Free plan has no usage alerts (P0.5), so growth is checked by hand in the dashboard. There is no gate. The reference session below is 8 peers for 1 h, 20 rounds and about 300 doc updates.

| Budget (Free) | Per reference session | Sessions/day that fit | Notes |
|---|---|---|---|
| DO duration 13,000 GB-s (128 MB billed per awake DO) | 450 GB-s | **≈ 29 occupied room-hours** | **Binding.** With 2 or more visible peers the DO never hibernates (inferred; measured after the switch). One room with two unthrottled tabs open all day uses about 83 % of the daily budget. |
| DO requests 100k | ≈ 2,300 | ≈ 43 | Hidden-tab reconnect churn adds about 240 per hidden peer-hour; the sweep adds about 30 a day, plus one per listed room it checks and one per room it moves. |
| Rows written 100k | ≈ 200 | ≈ 500 | Coalescing caps a room at 12 flushes per minute or fewer. |
| Rows read 5M | ≈ 750 | ≈ 6,600 | Lazy load keeps this low. |
| Storage 5 GB/account; plan **1 GB per DO** | KBs (stress room: 1 MB) | n/a | |
| Workers requests 100k | ≈ 30 | ≈ 3,000 | Static assets are free (no `run_worker_first`). |
| Workers Logs | small | n/a | 200k events/day now; 0.5 GB/day from 2026-12-01. Hitting it stops logging, not the relay. |

- **Abuse exposure (stated, not mitigated):** anyone can take hnch down until 00:00 UTC.
  - Ways to do it: hold about 29 rooms open for an hour, send about 100k cheap requests, or spam room creation.
  - The single free rate-limit rule only slows one IP down.
  - The caps are **per account**, so the account's other Workers draw from the same budget (P0.6 inventory).
  - Owner accepted: free plan only.

### Local dev, tests, e2e

- **Tooling (D5, settled):** `wrangler.jsonc` plus wrangler pinned at **4.151.3**, compatibility date no later than 2026-10-19, and `WRANGLER_SEND_METRICS=false`.
- **Vitest:** only the relay moves to vitest 4.1.x, with `@cloudflare/vitest-plugin` 1.4.6 and `@vitest/coverage-istanbul`. The other packages stay on `^3.2.7`. If the plugin can't be used, fall back to `pool-workers` 0.12.21 on vitest 3 and record the workerd version skew.
- **Shared imports:** the relay imports the leaf subpaths `@hnch/shared/room-code`, `@hnch/shared/auth` and `@hnch/shared/health` (new `exports` entries), not the barrel.
- **`packages/relay/scripts/dev.mjs`** (`pnpm --filter @hnch/relay dev`):
  - maps `PORT` → `--port`, and the ADR-0027 env vars → `--var` (only if set);
  - always passes `JURISDICTION:none`;
  - uses a fresh temporary `--persist-to` when the test vars are set;
  - leaves the Playwright `webServer` contract and `pnpm dev:relay` unchanged;
  - needs no `.dev.vars`.
- **`@hnch/relay/testing`** (fixes the CLI blocker): `startTestRelay(opts?) → Promise<{ httpUrl, wsUrl, stop() }>`.
  - 1a backs it with the in-process Node relay.
  - 1b spawns `scripts/dev.mjs` on a free port with a temporary persist dir, polls `/health` with a 30 s timeout, and makes `stop()` kill the process tree. `unstable_startWorker` may replace the spawn behind the same API.
  - `packages/cli/src/session.test.ts` and `packages/shared/src/live-session.test.ts` use only this helper. Shared reaches it through a vitest alias, not a package dependency, because a shared → relay dependency would be a workspace cycle.
  - `ci.yml` `detect-changes`: a relay change now also sets `cli=true` and `shared=true`.
- **e2e on workerd:** the ADR-0027 specs (`expired-recent-session`, `recent-rooms-list`, `room-full`, `vote-dots-196`, `_screenshots/participant-cap`, `_screenshots/vote-bars-shot`) plus `lone-peer-keepalive`.
- **`packages/relay/scripts/smoke.mjs`:** one client per process. Modes: `basic`, `cap`, `hold`, `deploy-hold`, `preflight`. It takes `BASE=https://hnch.dev`.

### CI/CD and release flow

- **Relay:** a `relay-v*` release dispatches `deploy-relay.yml` on the pool, which runs `wrangler deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
  - **Pre-deploy asserts:**
    - the ADR-0027 vars are absent;
    - `JURISDICTION` is not `none`;
    - **route-removal guard:** fail if the deploy would remove any live `hnch.dev/*` route of this script. `wrangler deploy` deletes routes missing from config (R2). Only a manual dispatch with `allow_route_removal=true` bypasses the guard.
  - **Post-deploy smoke**, gated on the repo variable `HNCH_LIVE == 'true'`, which is set at the switch: `/health` (retry for up to 60 s until `version` matches the tag), plus `GET /rooms/000000` → `404 {reason:'unknown-room'}`. Before the switch the job only checks that the deploy succeeded (`wrangler deployments list`).
  - **Rollback of code:** `wrangler rollback` only. Never re-dispatch an old tag: the guard blocks it from `relay-v1.3.0` on, and a tag at or before `relay-v1.2.1` runs the pre-1b workflow, which has no guard and deploys to the VPS.
- **From the 1b merge, the relay no longer ships to the VPS (D9).** The VPS relay stays at `relay-v1.2.1`. Usage is about 0, so no VPS hot-fix path is planned.
- **Client (D10):** a `client-v*` release dispatches `deploy-client.yml`.
  - It builds `production` once and ships it to the VPS (as today; that keeps the incidental rollback current) and to `hnch-web` (from Phase 2).
  - Reopened 2026-10-29: the VPS deploy job is removed, so the VPS keeps its current client build until the switch (see [Decisions resolved](#decisions-resolved)).
  - Input `targets: all | web-only` (default `all`). Manual dispatches of unreleased `main` use `web-only`.
  - *Superseded by ADR-0054:* the `vps` job and the `targets` input are gone; `deploy-client.yml` deploys `hnch-web` only.
  - The `hnch-web` smoke is gated on `HNCH_LIVE`.
- **Secrets (D14):**
  - Stored as a repo secret, referenced only by the two deploy jobs; environment secrets are unavailable on GitHub Free private repos. Fork PRs get no secrets.
  - The token (`hnch-ci-deploy`) has Workers Admin, formerly Workers Scripts: Edit (account-wide, so it also covers the account's other Workers; the narrower Workers Editor can't create the two new Workers), and Workers Routes: Write on `hnch.dev`. It has no DNS permission and no Zone: Read, so every route in `wrangler.jsonc` carries `zone_id`.
- The `npm_config_target_*` cross-arch pin is deleted (ADR-0051 supersedes that ADR-0049 clause).

### Static headers (D13)

- 24 files in the prod build are hashed (`<name>.<16 hex>.js|css`). Everything else is unhashed: `index.html`, `3rdpartylicenses.txt`, `assets/*`, `svg/*.svg`. There is no manifest, no service worker, and no wasm or fonts served from origin.
- `packages/client/src/_headers` is copied to the root of `www`:

  ```
  /*
    Cache-Control: no-cache, must-revalidate
  /*.js
    ! Cache-Control
    Cache-Control: public, max-age=31536000, immutable
  /*.css
    ! Cache-Control
    Cache-Control: public, max-age=31536000, immutable
  ```

  Rules are cumulative. `! Cache-Control` detaches the `/*` value, so each response carries exactly one `Cache-Control`.
- **Parity guard** in `deploy-client.yml`: fail if any `www/**/*.js|css` does not match `\.[0-9a-f]{16}\.(js|css)$`, the build's exact hash form (16 lowercase hex, measured).
- **Header matrix**, checked on `hnch.dev` after the switch:
  - `/`, `/join`, `/lobby/x` and `/r/ABCD` → exactly one `no-cache, must-revalidate`;
  - hashed `.js` and `.css` → `immutable`;
  - `/svg/…`, `/assets/…` and `/3rdpartylicenses.txt` → `no-cache`;
  - a missing `/x.<hash>.js` → `index.html` with `immutable`, the same as Caddy today.

### Cutover (D2: one full switch, settled)

1. **Before (Phase 0 ops, done 2026-10-28):**
   - zone settings, including Always Use HTTPS;
   - the rate-limit rule;
   - account alerts (Free has no usage alerts);
   - the `www` redirect rule, live with `www` proxied;
   - the apex DNS-only TTL lowered to 60 s.
2. **Preconditions:**
   - 1b and 2 are merged, and their releases have deployed both Workers, with `hnch.dev` routes present but inert.
   - A route check via API shows `hnch.dev/health*`, `/rooms*` and `/ws/*` → `hnch-relay`, and `hnch.dev/*` → `hnch-web`.
3. **Switch:**
   - set the apex A and AAAA records to **proxied** (`www` already is);
   - set `HNCH_LIVE=true`;
   - re-dispatch both deploy jobs to run the gated smokes: relay at its latest tag; client at a client tag cut after the ADR-0054 merge or, if no client release has happened since, `main`. A manual dispatch bypasses the release gate, so dispatch `main` only when its latest `ci.yml` push run is green. Never a pre-ADR-0054 client tag (≤ `client-v1.46.0`): its workflow ships only to the VPS.
4. **Verify on `hnch.dev` and fix forward:** run the Phase 3 checklist. Problems are fixed by releases.
5. **During propagation:**
   - Resolvers that cached the old A record reach the VPS until the TTL runs out.
   - Sockets already open to the VPS stay on it (relay 1.2.1) until they reconnect. With usage at about 0 this is accepted, and the VPS is not touched.
   - Stale-NS resolvers: IONOS now serves an empty zone, so on 2026-10-28 resolvers that had cached the IONOS NS got NODATA for `hnch.dev`. This heals within the NS TTL (3–24 h) and should be long gone by the switch.
6. **Incidental rollback (not planned, only available because the VPS is untouched; superseded by ADR-0054: frozen build only, gone once the box is shut down):**
   - set the records back to DNS-only and `HNCH_LIVE=false`;
   - Caddy serves the PWA (frozen at `client-v1.46.0` since ADR-0054) and relay 1.2.1;
   - every room created on Cloudflare is lost to users.
   - Reopened 2026-10-29: with the VPS deploy job removed, Caddy serves the frozen client build; once the VPS is shut down after the switch, there is no rollback to it (see [Decisions resolved](#decisions-resolved)).

## ADR impact

- **ADR-0051 (Proposed): final amendments for adr-writer.**
  - **a. Topology and cutover:**
    - Routes only: web `hnch.dev/*`; relay `hnch.dev/health*`, `/rooms*`, `/ws/*`. No Custom Domain, because its DNS record is Cloudflare-owned and read-only. G0 passed both variants.
    - Routes deploy early and stay inert while DNS-only. The cutover is one full switch: proxy the apex records.
    - No `next` proving ground; test on `hnch.dev` and fix forward.
    - Replace the "Custom Domain" wording.
  - **b. VPS:** stays untouched and idle. Decommissioning is out of scope. Un-proxying the records is an incidental rollback; rooms created on Cloudflare are lost on it. Sockets already open to the VPS stay until they reconnect. The VPS relay is frozen at 1.2.1. Reopened 2026-10-29: the VPS is removed by a new ADR (see [Decisions resolved](#decisions-resolved)). *(Superseded by ADR-0054.)*
  - **c. "B sees A leave":** reword the "blocks the e2e criterion" line as a pre-existing finding seen only in the smoke test, tracked in #542 (related #531).
  - **d. Test vars:** `.dev.vars` → `scripts/dev.mjs` passes them per invocation.
  - **e. Keepalive:** the requirement (ADR-0050 conformance), the piggyback mechanism, the hidden-tab residual measured after the switch, and the pre-agreed alarm fallback.
  - **f. Logs:** `invocation_logs = false`; the free observability limits (200k events/day with 3-day retention; from 2026-12-01, 0.5 GB/day with 7-day retention, ingestion stops at the limit); the marker test.
  - **g. Rate limit:** the free plan can't match on method, so the rule is `path eq "/rooms"` at 10 per 10 s per IP (it also counts the native `OPTIONS` preflight). It is a speed bump, not quota protection. `GET /rooms/:code` and `/ws/*` are never limited (owner, 2026-10-28; R7 retry storm, ADR-0050).
  - **h. Password at rest:** `SHA-256(roomUuid ‖ passwordHash)` (D16-B).
  - **i. Abuse exposure:**
    - The caps are per account and shared with other Workers: about 29 occupied room-hours of DO duration, 100k DO requests and 100k rows written.
    - They can be exhausted on purpose or by accident (tabs left open all day), which takes the relay down until 00:00 UTC.
    - Usage is about 0 today. The Free plan has no usage alerts, so usage is checked by hand.
  - **j. Credentials:**
    - Drop the stale `NPM_TOKEN` analogy (`release.yml` publishes via OIDC).
    - The Cloudflare token is the pool's only long-lived deploy credential, and Workers Scripts: Edit is account-wide.
    - It is a repo secret (no environment secrets on GitHub Free private repos), used by the deploy jobs only, with no DNS permission.
  - **k. ADR-0027:** partial supersession of its "MUST NOT … persist outside in-memory store" clause, instead of reinterpreting it. Add the env var → Worker var mapping (`scripts/dev.mjs`).
  - **l. ADR-0017:** a caveat that a digest of the hash now persists. This is its second partial caveat.
  - **m. Registration:** stays at IONOS; only DNS is at Cloudflare. IONOS serves an empty zone, so stale-NS resolvers got NODATA, which heals within the NS TTL.
  - **n. Route pattern:** `/health*` (exact `/health` misses query strings and a trailing slash); route matching is case-sensitive.
  - **o. Deploy coexistence:** old and new DO code run side by side for at least 5 min. Storage and RPC changes expand and contract across two releases. Sockets resync in about 0.4 s (G0); update the "~250 ms".
  - **p. Health and failures:** `/health` stays shallow. The deploy smoke reaches a DO via `GET /rooms/000000`. DO failures → `503` with no `reason`.
  - **q. TTL robustness:** deletion at 24–25 h; tombstone before the cross-DO release; lazy expiry and re-arm on entry; the `Expiry` cron backstop.
  - **r. Binding limit:** DO duration (about 29 occupied room-hours/day) replaces "≈ 400 peer-hours/day" as the headline figure.
  - **s. ADR-0049:** ADR-0051's cross-arch caveat and ADR-0053's pool-size caveat share one parenthetical and one index cell (ADR-0052 only refines targeting). Consolidating 0049 forward is not done yet (see ADR-0049 below).
  - **t. Edge behaviour:** Always Use HTTPS on (parity with Caddy's redirect), and a `www` → apex 301 redirect rule (live since Phase 0; it fixed #543, the pre-existing `www` TLS failure).
- **ADR-0029:** superseded by ADR-0051, flipped in 1b. Optional status note at the switch: "VPS decommission: see ADR-0054". Reopened 2026-10-29: the VPS is removed (see [Decisions resolved](#decisions-resolved)), so the earlier note "VPS left idle, not decommissioned (owner, 2026-10-28)" no longer applies.
- **ADR-0012:** storage clause superseded by ADR-0051; TTL, keying and content-blindness hold.
- **ADR-0049:**
  - Its cross-arch clause is superseded by ADR-0051 and its pool-size clause by ADR-0053 (ADR-0052 as merged only refines targeting).
  - One parenthetical, `Accepted (deploy-relay cross-arch clause superseded by ADR-0051; pool-size clause superseded by ADR-0053)`, and one index cell, `ADR-0051 (partial), ADR-0053 (partial)`. Done 2026-10-29.
  - Index order: 0050, 0051, 0052, 0053.
  - Two caveats hit the README threshold. Recommendation: don't consolidate yet, because the two clauses are independent. Consolidate when a third arrives.
- **ADR-0027:** header `Accepted (in-memory-store clause superseded by ADR-0051)`. Editorial: the audit hint now points at `scripts/dev.mjs`, and `expired-jump-back-in.spec.ts` becomes `expired-recent-session.spec.ts`.
- **ADR-0017:** second partial caveat (ADR-0035 and ADR-0051). Recommendation: don't consolidate, because the clauses are distinct.
- **ADR-0050:** conforms (items 3, 5, 6, 8 and 9).
- **ADR-0001:** conforms in code; TLS now terminates at Cloudflare.
- **ADR-0008, -0009, -0016, -0024, -0035:** unchanged.
- **ADR-0028:** decision unaffected; its "in-memory" context goes stale.
- **ADR-0014:** `packages/relay` keeps its name and gains a `./testing` export.

## Decisions resolved

- Settled 2026-10-28 (owner, spec):
  - DNS moves to Cloudflare.
  - The registration stays at IONOS (registrar transfer out of scope by owner decision). No `@hnch.dev` mail.
  - Room state is stored at Cloudflare (EU) and deleted 24 h after the last peer leaves.
  - Free plan only.
- Settled 2026-10-28 (owner): G0 approved and run.
- Settled 2026-10-28 (owner, D1/D2): two Workers on `hnch.dev` attached by routes (web `hnch.dev/*`; relay `/health*`, `/rooms*`, `/ws/*`), switched over **in one full cutover** with no staged proxy-to-VPS step. There is no customer base yet, so downtime during the switch is acceptable.
- Settled 2026-10-28 (owner, D3/D4): no `next.hnch.dev` proving ground and no pre-cutover browser or native test build. Test directly on `hnch.dev` after the cutover and fix forward. The `next.hnch.dev` placeholder record was deleted on 2026-10-28.
- Settled 2026-10-28 (owner, P0.6/D17): no usage baseline and no usage gate. Usage is about 0 today. Cloudflare usage notifications cover later growth.
- Settled 2026-10-28 (owner, P0.5): the Free plan has no Workers or DO usage alerts, so the line above's "usage notifications cover later growth" doesn't hold. Six account alerts are on instead, and usage is checked by hand in the dashboard. A scheduled usage check is deferred until there are users.
- Settled 2026-10-28 (owner, P0.3): `www` is proxied in Phase 0, so its redirect is live before the cutover (fixing #543 early). The switch proxies only the apex records.
- Settled 2026-10-28 (owner): the VPS stays as it is. No shutdown, rollback window or cancellation is planned in these phases. Decommissioning stays out of scope until the owner reopens it. Before any cancellation, check that `hnch.dev` isn't bundled with the IONOS VPS contract.
  - Reopened 2026-10-29 (owner): the VPS is removed. See the 2026-10-29 VPS entry below.
- Settled 2026-10-28 (owner, D11): one rate-limit rule, on path `/rooms` only, 10 per 10 s per IP.
- Settled 2026-10-28 (owner): no rate limit on `/ws/*`; `GET /rooms/:code` is not limited either.
- Settled 2026-10-28 (owner, D12): Workers Logs on with `invocation_logs = false`, plus the marker test.
- Settled 2026-10-28 (owner, D15): moot; the switch happens when the PRs are ready.
- Settled 2026-10-28 (owner, D16): store `SHA-256(roomUuid ‖ passwordHash)`.
- Settled 2026-10-28 (owner): replace the Node relay in place, with no self-host fallback.
- Settled 2026-10-28 by orchestrator (owner may veto):
  - **D5 A:** wrangler 4.151.3 with `wrangler.jsonc`.
  - **D6 A:** `/health` = `{status, version}`.
  - **D7 A:** ADR-0051 is accepted before the 1b merge.
  - **D8 A:** 1b is atomic.
  - **D9 A:** the relay goes to Cloudflare only from 1b.
  - **D10 A:** the client deploys to both the VPS and `hnch-web`, with a `targets` input. Reopened 2026-10-29: the VPS target goes (see the VPS entry below). *(Superseded by ADR-0054.)*
  - **D13 A:** splat rules in `_headers`, plus a hash guard.
  - **D14 A:** a repo-secret token used by the deploy jobs only.
  - Keepalive by piggyback, plus the hidden-tab measurement and the alarm fallback.
  - The TTL robustness design.
- Planner-decided (owner may veto):
  - coalesced writes with lazy load;
  - leaf subpath imports from shared;
  - the dev wrapper;
  - the `@hnch/relay/testing` harness (1a);
  - the route-removal guard;
  - routes deployed inert with the switch done by proxying;
  - smokes gated on `HNCH_LIVE`;
  - the `www` redirect;
  - relay-only vitest 4.
- Settled 2026-10-29 (owner): CI and hosting fixes ship as a short ordered series of small PRs, not one big PR. Fold the work into existing PRs and issues instead of building parallel copies.
  - Reversed 2026-10-29 (owner): the remaining CI and hosting work ships as one PR, so it takes one CI cycle instead of a PR → `main` → release cycle per change. The "separate PR" and "follow-up CI PR" in the entries below are parts of that one PR. Folding work into existing PRs and issues still holds.
- Settled 2026-10-29 (owner): the VPS is removed. This reopens the 2026-10-28 "VPS stays as it is" entry above and ADR-0051's "VPS left idle, not decommissioned" clause.
  - Now: remove the VPS deploy job, the VPS docs and the VPS `infra/` files. Production (`hnch.dev`, on the VPS until the #549 switch) stays frozen at its current client build until the switch.
  - At this PR's merge: delete the `VPS_*` repo secrets (owner, 2026-10-29), so a dispatch of an old client or relay tag fails instead of deploying to the VPS.
  - After the #549 switch: shut down the VPS. Before cancelling the contract, check that `hnch.dev` isn't bundled with it.
  - Until the shutdown, the incidental rollback (Cutover step 6) serves the frozen client build. After it, there is no rollback to the VPS.
  - A separate PR with a new ADR does the removal (mechanism: planner, not owner). This entry only records the decision.
- Settled 2026-10-29 (owner): no paid merge gate. The repo is private on GitHub Free, so branch protection is unavailable (the API returns 403). By convention, agents and humans never merge a PR on red CI: every check must be green, and a cancelled check is not green. See `docs/release.md`, [Merge only on green CI](../release.md#merge-only-on-green-ci).
- Settled 2026-10-29 (owner): the self-hosted runner pool stays at `POOL_SIZE=2`, the value the live LaunchAgent plist uses. The repo copy (`infra/runner/dev.hnch.runner.plist`) now matches. Out of scope by owner decision: raising the pool.
  - [ADR-0053](../../adr/0053-runner-pool-two-slots.md) records this and supersedes ADR-0049's "pool size = `verify` matrix lane count" clause.
- Settled 2026-10-29 (owner): `ci.yml`'s workflow-level `concurrency` with `cancel-in-progress` keeps cancelling superseded runs on `main` too. The newest `main` run must cover the changes of every merge whose run was cancelled.
  - Mechanism (planner, not owner): on a push to `main`, change detection diffs from the commit of the last successful `main` CI run instead of the previous push, and runs the full pipeline if there is none. The follow-up CI PR implements it.
- Settled 2026-10-29 (owner): `release.yml` starts from a successful `ci.yml` push run on `main` (`workflow_run`), not from the push, so a red or cancelled merge releases and deploys nothing until the next green run.
  - Mechanism (planner, not owner): the release checks out the commit that run tested; if `main` holds a newer merge by then, it releases nothing and the newer merge's green run releases both. A manual dispatch releases the newest green run's commit. See `docs/release.md`, [When a release runs](../release.md#when-a-release-runs).
- Settled 2026-10-29 (owner): #562 (test(shared,cli): give the test-relay startup hook the same 60 s as relay) won't land. One local relay per test run replaces it (vitest `globalSetup`: mechanism from the planner, not the owner).

## Phases

### Phase 0: Ops (owner-run, no PR)

- **Scope:**
  - **Done:**
    - P0.1 DNSSEC: nothing to remove.
    - P0.2 NS switch: Active since 2026-10-28 14:17 UTC.
    - G0: PASS for both variants. Details:
      - (a) every relay path, including the WS `101`, was answered by the relay; SPA and headers were correct;
      - (b) two Node processes using the real `connectToRelay` plus `ws` 8.20.1 synced, with 0 closes and no challenge;
      - (c) held sockets survived 300 s across a web redeploy, with 0 closes.
      - Lessons: use `/health*`; matching is case-sensitive; deploy coexistence is 5 min or more; a Custom Domain's record is read-only; zone defaults challenge neither `ws` nor Node requests.
    - `next.hnch.dev` / `next-cd.hnch.dev`: torn down; placeholder deleted.
  - **P0.3 zone settings** (done 2026-10-28 16:05 UTC; inert for DNS-only hostnames until the switch):
    - SSL/TLS Full (strict) (was Full), minimum TLS 1.2 (was 1.0);
    - Always Use HTTPS on (was off);
    - Rocket Loader off (already) and Email Obfuscation off (was on);
    - Browser Integrity Check (on) and Bot Fight Mode (off) kept as found;
    - rate-limit rule "hnch: limit room creation": `http.request.uri.path eq "/rooms"`, 10 per 10 s per IP (`ip.src` plus the mandatory `cf.colo.id`), block for 10 s (no rule on `/ws/*`, settled). It is the one rule Free allows;
    - Single Redirect `http.host eq "www.hnch.dev"` → `concat("https://hnch.dev", http.request.uri.path)` (301, query string kept). **Live since Phase 0:** the `www` A and AAAA records were proxied with it (owner, 2026-10-28), which fixed #543. The apex stays DNS-only until the switch;
    - apex A and AAAA (DNS-only) TTL lowered to 60 s.
  - **P0.4 secrets** (D14): `CLOUDFLARE_API_TOKEN`, a token `hnch-ci-deploy` with two policies (Entire Account › Workers › Admin, formerly Workers Scripts: Edit; Specified Domains `hnch.dev` › Workers Routes, "Write" in the API), and `CLOUDFLARE_ACCOUNT_ID`, both set by the owner on 2026-10-28. In the dashboard form, Workers Routes only appears in a policy scoped to Specified Domains. Repo variable `HNCH_LIVE=false` set.
  - **P0.5 alerts:** the Free plan has no Workers or DO usage alerts. Nothing warns before a daily cap; past it, Workers return error 1027 until 00:00 UTC (the usage alert type needs Pro and pay-as-you-go). Six account alerts are on instead, by email: Universal SSL, HTTP DDoS attack, Trust & Safety block, abuse report, major or critical incidents on Workers, DO or Workers Assets, and Workers real-time issues.
  - **P0.6 account inventory** (2026-10-28, last 7 days): besides `hnch-relay-prototype` (134 requests; deleted once 1b is live), two other Workers with about 2.2k requests combined, plus 170 requests from deleted Worker versions. No Pages projects, KV, D1, R2 or Queues; the prototype's two are the only DO namespaces. No Worker routes on any of the account's three zones, all on Free.
- **Exit bar:** P0.3–P0.5 done; P0.6 recorded. Met 2026-10-28.
- **PR title scope:** none.
- **Closes:** tracking issue `#544`, closed by Phase 3.
- **Worktree:** none.
- **Depends on:** none.

### Phase 1a: Relay test harness (prep PR)

- **Scope:**
  - `packages/relay`: `testing/start-relay.mjs` (Node relay); `package.json` `exports` `./testing` and `.`.
  - `packages/cli`: `src/session.test.ts` uses `startTestRelay`; devDependency `@hnch/relay: workspace:*`.
  - `packages/shared`: `src/live-session.test.ts` uses `startTestRelay` through a vitest alias (it landed in #534 after this plan was drafted); `src/relay-client.test.ts`: fix the stale comment.
  - `.github/workflows/ci.yml`: a relay change also runs the CLI and shared lanes.
  - `pnpm-lock.yaml`.
- **Exit bar:**
  - The CLI, relay and shared lanes are green.
  - No `relay/src` imports remain outside `packages/relay`.
- **PR title scope:** `test(cli,relay,shared,ci,repo,docs): start the relay for CLI and shared tests through @hnch/relay/testing`. There is no release, which avoids a no-op CLI npm publish.
- **Closes:** `Closes #546`, `Refs #544` (sub-issue #546)
- **Worktree:** `git fetch origin && pnpm worktree:add cloudflare-hosting-phase-1a main`
- **Depends on:** none.

### Phase 1b: Relay on Workers + Durable Objects (deployed, routes inert)

- **Scope:**
  - **`packages/relay`, replaced in place:**
    - Worker router plus a `scheduled` handler.
    - `Room`, `Codes` and `Expiry` DOs (contract items 1–17).
    - The protocol module ported from `ws-connection.ts`, plus config parsing.
    - `wrangler.jsonc`:
      - `hnch-relay` with SQLite migration v1;
      - `JURISDICTION=eu`;
      - routes `hnch.dev/{health*,rooms*,ws/*}`, each with `zone_id` (the token has no Zone: Read);
      - cron `0 4 * * *`;
      - `invocation_logs = false`;
      - `workers_dev = false`.
    - `scripts/dev.mjs` and `scripts/smoke.mjs`; `testing/start-relay.mjs` reimplemented on workerd.
    - Vitest 4 with the plugin and istanbul; `tsconfig.json`.
    - `package.json`: drop `ws`, `@types/ws`, `tsx` and `@types/node`; add `wrangler@4.151.3`, the vitest stack and Workers types.
    - Delete `server.ts`, `room-store.ts`, `code-pool.ts`, `snapshot.ts`, `ws-connection.ts` and their tests.
    - Tests for every item, including the keepalive and TTL tests.
  - **`packages/shared`:** `exports` `./room-code`, `./auth` and `./health`; `health.ts` → `{status, version}`.
  - **`packages/e2e`:** `tests/lone-peer-keepalive.spec.ts`.
  - **`.github/workflows/deploy-relay.yml`:**
    - deploy with `wrangler`;
    - asserts: ADR-0027 vars, jurisdiction, route-removal guard (with an `allow_route_removal` input);
    - smoke gated on `HNCH_LIVE`;
    - cross-arch env removed.
  - **`.github/workflows/ci.yml`:** a relay change now also sets `cli=true`.
  - **Root:** `.gitignore` (`.wrangler/`), `pnpm-lock.yaml`.
  - **Docs:**
    - `CONTRIBUTING.md`: `relay` scope = Cloudflare Worker; dev notes.
    - `docs/deployment.md`: the Cloudflare relay, secrets and token scope, and the relay release rules (coexistence, expand/contract, no old-tag re-dispatch, `wrangler rollback`).
  - **ADRs:**
    - 0051 → Accepted (amended); 0029 → Superseded;
    - partial caveats on 0012, 0027 and 0017;
    - 0049: cross-arch caveat (ADR-0051; the pool-size caveat is ADR-0053's, and ADR-0052 only refines targeting);
    - `adr/README.md` index in the order 0050, 0051, 0052.
- **Exit bar:**
  - CI is green: the relay, cli (through the harness) and shared lanes, plus e2e chromium on local workerd (the ADR-0027 specs and `lone-peer-keepalive`).
  - The merge cuts a `relay-v*` minor, and `deploy-relay.yml` deploys `hnch-relay` with its routes present but inert. The guard and asserts pass.
  - `https://hnch.dev/health` is still answered by the VPS (`1.2.1`).
  - Security review signed off.
- **PR shape (D8):** atomic.
- **PR title scope:** `feat(relay,shared,e2e,ci,docs,repo): run the relay on Cloudflare Workers and Durable Objects`
- **Closes:** `Closes #547`, `Refs #544` (sub-issue #547)
- **Worktree:** `git fetch origin && pnpm worktree:add cloudflare-hosting-phase-1b main`
- **Depends on:** 1a merged; P0.4; amended ADR-0051 accepted (D7).

### Phase 2: PWA on Workers Static Assets (deployed, route inert)

- **Scope:**
  - **`packages/client`:**
    - `wrangler.jsonc`: `hnch-web`, assets `./www`, SPA not-found handling, no `run_worker_first`, route `hnch.dev/*` with `zone_id`, `workers_dev = false`.
    - `src/_headers` plus an entry in the `angular.json` assets.
    - `package.json`: wrangler as a dev dependency.
  - **`.github/workflows/deploy-client.yml`:**
    - keep the VPS ship (reopened 2026-10-29: the `vps` job and the `targets` input were removed later, by the ADR-0054 change);
    - add the hash guard;
    - add `wrangler deploy` of the same `www` to `hnch-web`;
    - add the `targets: all | web-only` input and the route-removal guard;
    - smoke gated on `HNCH_LIVE`.
  - **Docs:** the PWA section of `docs/deployment.md`.
  - **Root:** `pnpm-lock.yaml`.
- **Exit bar:**
  - CI is green.
  - A manual `targets=web-only` dispatch deploys `hnch-web` with `hnch.dev/*` present but inert. The API route check shows all four routes.
  - `hnch.dev` is still served by the VPS.
- **PR title scope:** `build(client,ci,docs,repo): deploy the PWA to Workers Static Assets`. There is no client release; the first deploy is a `web-only` dispatch.
- **Closes:** `Closes #548`, `Refs #544` (sub-issue #548)
- **Worktree:** `git fetch origin && pnpm worktree:add cloudflare-hosting-phase-2 main`
- **Depends on:** 1b merged (the shared token and guard). It can be built in parallel with 1b.

### Phase 3: Cutover (owner switch) + docs PR

- **Scope:**
  - **Switch:** Cutover steps 2–3: route check, proxy the apex records, set `HNCH_LIVE=true`, re-dispatch both deploys.
  - **Post-switch verification on `hnch.dev`, fixing forward:**
    - Smokes: `/health` returns the tag version; `GET /rooms/000000` → JSON `404`. HTTP → HTTPS redirect, and `www` → apex 301 (a re-check; #543 was fixed in Phase 0).
    - The header matrix.
    - CLI matrix on default config: 1.1.1 (default `wss://hnch.dev`), 1.1.2 and the latest version. Each must pass:
      - create, join, vote, reveal;
      - `4002`, `400` → lookup, `404` → lookup;
      - 21st peer → `4006`;
      - case-insensitive code;
      - fresh device after the room emptied;
      - `smoke.mjs hold` 120 s → 0 reconnects.
    - **Native preflight:**
      - `curl -X OPTIONS https://hnch.dev/rooms`, once with `Origin: capacitor://localhost` and once with `Origin: https://localhost`, plus `Access-Control-Request-Method: POST` and `Access-Control-Request-Headers: content-type`;
      - expect `204`, ACAO `*`, and the methods and headers listed.
      - Then the current iOS and Android store builds: create, join, vote, reveal, password.
    - **Browser matrix:** Chrome, Firefox and Safari on desktop; iOS Safari; Android Chrome. Covers create, join, vote, reveal, password room, reload mid-round, and presence across two devices, with no challenge.
    - **Hidden-tab measurement:** 1, 2 and 3 hidden Chrome tabs, 15 min each. If the item-9 trigger fires, a relay release turns the fallback on.
    - **Deploy coexistence:** a busy room held across a `deploy-relay.yml` re-dispatch keeps its state through the old-code window and the `1006` resync.
    - Logs marker test.
    - **Duration check:** a 2-peer room held 30 min shows about 225 GB-s.
    - **Rate limit:** the 11th `/rooms` request within 10 s from one IP → `429`. `GET /rooms/:code` and WS are unaffected.
    - **Static-asset billing:** after a day of traffic, the account's Workers request count tracks `hnch-relay` calls, not page and asset loads (ADR-0051 assumes static assets are free without `run_worker_first`).
  - **Docs PR:**
    - `docs/deployment.md`: prod topology, the switch and incidental rollback, the rate-limit rule, the free-plan budget and abuse exposure, the account alerts and the missing usage alerts.
    - `docs/project.md`: snapshot wording (persisted, EU, 24 h).
    - `docs/roadmap.md:241`.
    - `packages/client/src/environments/environment.prod.ts`: comment only.
    - `adr/0029` status note.
  - **Post-switch: VPS decommission ([ADR-0054](../../adr/0054-vps-decommission.md)).** Owner runs these once the post-switch checks pass. *(2026-10-29: the VPS was shut down and deleted before the switch, so `hnch.dev` was down until the records were proxied; the records were repointed at the switch.)*
    - [x] with the apex proxied (never before the switch), repoint the Cloudflare A/AAAA records of `hnch.dev` and `www` from the VPS IP to a placeholder origin, `192.0.2.1` / `100::`, proxied, so a reassigned IP never serves `hnch.dev`. The IONOS zone is already empty;
    - [x] shut down the VPS (`hnch-vps`);
    - the repo secrets `VPS_HOST`, `VPS_SSH_KEY` and `VPS_USER` are already gone: deleted at the ADR-0054 merge;
    - [ ] before cancelling the IONOS contract, check whether the `hnch.dev` registration is bundled with it; the registration must survive;
    - [ ] optional: drop `openssh-client` from `infra/runner/Dockerfile`, installed only for the VPS deploys.
  - **Issues:** #542 ("B sees A leave": a cleanly disconnected peer stays present until the 30 s awareness timeout; related #531) stays open as a separate bug. #543 (`www` TLS) was fixed in Phase 0 by the redirect.
- **Exit bar:**
  - Every check above passes, or has a fix-forward issue linked to the tracking issue.
  - `hnch.dev` is served by Cloudflare (`cf-ray`, no `Server: Caddy`).
  - The docs PR is merged.
- **PR title scope:** `docs(client,docs): document Cloudflare hosting of hnch.dev`. `docs` type, so no release.
- **Closes:** `Closes #549, Closes #544` (sub-issue #549 and the tracking issue). #543 was closed with Phase 0.
- **Worktree:** `git fetch origin && pnpm worktree:add cloudflare-hosting-phase-3 main`
- **Depends on:** 1b and 2 deployed with their routes present (Cutover step 2), and Phase 0 done.

## Open questions

- **Inbound WS accounting on Free:** 1:1 or 20:1? Undocumented; the budget assumes 1:1.
- **What happens to open sockets when a daily cap is hit:** undocumented.
- **"B sees A leave":** also present on the Node relay. Tracked in #542 (related #531).
- **Outbound WS frame size limit:** undocumented. The inbound limit is 32 MiB.
- **Cloudflare DPA and data-location terms:** not reviewed. That is the owner's call, outside this plan.
- **VPS:** left idle. Decommission and the `infra/` and docs cleanup are deferred by owner decision. Before any cancellation, check that the domain isn't bundled with the VPS contract. Reopened 2026-10-29: no longer open; the VPS is removed (see [Decisions resolved](#decisions-resolved)). *(Superseded by ADR-0054: the cleanup is done; decommission follows the Phase 3 post-switch checklist.)*

## Verification plan

- **1a:** `test` and `typecheck`, run as separate commands, for `@xauyxau/hnch`, `@hnch/relay` and `@hnch/shared`. A combined `pnpm --filter <pkg> test typecheck` would hand `typecheck` to vitest as a test filter.
- **1b:**
  - relay `typecheck`, `format:check`, `lint`, `test:coverage` and `build`;
  - shared `test` and `typecheck`;
  - cli `test` (harness on workerd) and `typecheck`;
  - client `typecheck`;
  - `pnpm test:e2e` (chromium);
  - deploy job: asserts, guard and inert routes.
- **2:** production build; hash guard; `web-only` dispatch; route check.
- **3:** the post-switch checklist on `hnch.dev`.
- **Every PR:** CI `Verify` and `E2E (Playwright)` green. No telemetry (ADR-0028).

## Screenshots

**Required:** No

- Reason: no UI change (hosting and relay runtime only).

## References

- Spec: `docs/specs/cloudflare-hosting.md`
- ADR-0051 (Proposed), ADR-0029, ADR-0012, ADR-0001, ADR-0008, ADR-0009, ADR-0016, ADR-0017, ADR-0024, ADR-0027, ADR-0035, ADR-0049, ADR-0050, ADR-0052, ADR-0053
- Prototype (throwaway, never merge): branch `prototype/cloudflare-relay`
- Research digest, G0 result and plan critique, 2026-10-28 (orchestrator job notes)
- Cloudflare docs: [Workers routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [Observability pricing](https://developers.cloudflare.com/observability/pricing/)
