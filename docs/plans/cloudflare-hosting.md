# Host hnch on Cloudflare (Workers + Durable Objects) instead of the VPS

**Status:** Draft
**Date:** 2026-10-28
**Source spec:** docs/specs/cloudflare-hosting.md
**Shape:** Multi-PR: 6 PRs in 4 phases (1a, 1b, 2, 3a, 3b, 4), plus owner-run preconditions in Phase 0

## Summary

The relay moves to a Cloudflare Worker with Durable Objects (DOs): `Room`, one per room UUID; `Codes`, one per room code; and `Expiry`, one per UTC day, which backs up room deletion. The PWA moves to an assets-only Worker. Both sit on `hnch.dev` through zone routes. Only DNS moves to Cloudflare; the registration stays at IONOS. After a 7-day rollback window the IONOS VPS is switched off.

Rooms now survive relay deploys. They persist (EU-pinned) until 24–25 h after the last peer leaves, which matches the Node relay's ADR-0012 TTL plus its hourly sweep. The wire protocol, REST shape and close codes do not change, so released CLIs (1.1.1 onwards) and native builds keep working without a release. Structural decision: [ADR-0051](../../adr/0051-cloudflare-hosting.md) (Proposed; amendments listed under ADR impact).

## Approach

### Topology (D1-A recommended; G0 passed both variants)

- Two Workers on one hostname, both on zone routes. This keeps the single origin of ADR-0029, so there is still no CORS for the PWA.
  - **`hnch-relay`** (`packages/relay`): routes `<host>/health*`, `<host>/rooms*`, `<host>/ws/*`.
    - The trailing `*` on `/health*` is needed: G0 showed that exact `/health` misses `/health?x=1` and `/health/`.
    - Matching is case-sensitive. `/Rooms/…` and bare `/ws` fall through to the SPA, which is parity with Caddy and the Node relay.
  - **`hnch-web`** (`packages/client`): an assets-only Worker serving `packages/client/www`, with SPA fallback and `_headers`, on route `<host>/*`. The more specific relay routes win (G0).
  - A client release redeploys only `hnch-web`. G0 held relay sockets for 300 s across a web redeploy with 0 closes.
  - A relay release is a staggered blip (see "Deploy coexistence").
- **Apex DNS:** `hnch.dev` A stays pointed at the VPS, but proxied, from the pre-cutover step until Phase 4. Every path without a route falls through to the VPS, which is what makes instant rollback possible (D2-A).
- **Proving ground:** the same Workers on `next.hnch.dev` (proxied `AAAA 100::`, P0.4). Until Phase 3b it serves a `next` build of the PWA that points at the `next` relay (D3-A). Phase 4 removes it (D4).

### Relay Worker: behavioural contract (parity with `packages/relay` today)

1. **Routes:**
   - `GET /health` (any query string), `POST /rooms` (exact path), `GET /rooms/:code`, `PATCH /rooms/:uuid/access`, `WS /ws/:uuid`.
   - `OPTIONS *` → `204`.
   - Anything else that reaches the Worker, such as `/health/` or `/roomsXYZ` → `404 {error:'not-found'}`.
   - CORS headers stay identical to the Node relay (`*`, `GET, POST, PATCH, DELETE, OPTIONS`, `Content-Type`). Native apps send a preflight `OPTIONS /rooms` from `capacitor://localhost` or `https://localhost` before each `POST /rooms`.
2. **`POST /rooms`:**
   - Body is JSON, at most 4 KiB. Empty body counts as `{}`.
   - `passwordHash` is optional and must be 64 lowercase hex, else `400 {error:'bad-request', detail}`.
   - Success → `201 {uuid, code}`.
   - Codes come from `generateRoomCode` (ADR-0008) and are unique across live rooms through a compare-and-swap claim on `Codes`. A code is reusable only after its room is deleted or tombstoned.
   - After `init`, the room is registered best-effort with `Expiry(<UTC day>)`. A failure there never fails the create.
3. **`GET /rooms/:code`:**
   - Input is normalised with `normalizeRoomCode`.
   - Returns `200 {uuid, accessMode}` or `404 {reason:'unknown-room'}`.
   - Unauthenticated. Never rate-limited (R7, ADR-0050).
4. **`PATCH /rooms/:uuid/access`:**
   - `passwordHash` may be hex, `null` or absent.
   - Returns `200 {accessMode}` or `404 {reason:'unknown-room'}`.
   - Open sockets are not evicted.
5. **`WS /ws/:uuid`:**
   - Non-upgrade request → `426`.
   - Unknown or tombstoned UUID → HTTP `404` before the upgrade.
   - Password room with no `pw` → HTTP `400` before the upgrade.
   - Wrong `pw` → accept, then close `4002 wrong-password` (constant-time compare).
   - Open sockets ≥ cap → accept, then close `4006 room-full`.
   - Refused sockets never count as peers.
   - Codes come from `JOIN_REJECTION_CLOSE_CODES`. Never rate-limited (R7: a 429 or 5xx on the upgrade makes y-websocket retry every ~2.5 s forever).
6. **Failure mapping:**
   - Any DO call that throws (overload, exceeded daily limit, storage error, RPC failure) → `503 {error:'unavailable'}` with **no `reason`**, both on HTTP routes and pre-upgrade.
   - `404` is sent only when a DO positively reports that the room or code is unknown.
   - ADR-0050 treats any non-404 as "no verdict" and keeps retrying, so a platform failure never evicts sessions from client caches.
7. **Sync:**
   - y-websocket wire format: `0` is sync, `1` is awareness, unknown types are ignored.
   - On accept, the relay sends sync-step-1, then every awareness state it holds.
   - It never echoes a sender's own update or awareness change back to it.
   - Doc updates go to every other open socket immediately; storage writes are coalesced separately (item 10).
8. **Presence (load-bearing for ADR-0050):**
   - A fresh socket gets every awareness state the room holds, right away. That includes after the DO hibernated, was evicted or restarted.
   - States survive hibernation through per-socket attachments (16 KiB cap per attachment).
   - A state not renewed for 30 s is neither replayed nor kept (parity with the y-protocols outdated timeout). This is checked lazily on inbound events.
   - When a socket closes, the states it announced are removed and the removal is broadcast.
9. **Keepalive (hard requirement; R4, measured):**
   - **Evidence:**
     - y-websocket 3.0.0 closes any socket that receives no app message for more than 30 s (checked every 3 s), then reconnects.
     - The Node relay's own `Awareness` renews its `{}` state every 15 s to every socket.
     - Measured with one lone client for 120 s: Node relay 0 reconnects; prototype 3.
   - **Requirement:** every open socket whose client is renewing receives an app-level frame at least every ≤ 15 s, including a lone peer. Protocol pings do not count.
   - **Mechanism (settled, owner may veto): piggyback.**
     - When the relay handles any inbound message on socket S, and S has been sent nothing for ≥ 10 s, it sends S one relay-own awareness renewal: state `{}`, the same bytes the Node relay emits.
     - This costs 0 extra DO requests and 0 extra duration; outgoing messages are free.
     - Clients drop states without a `participantId` (R5).
     - The relay should keep one clientID per room across wakes, stored at init, with a time-derived clock.
   - **Known residual:** under Chrome intensive throttling (tabs hidden for more than 5 min, timers batched about 1/min), a renewal and y-websocket's check land in the same wake-up. Lone hidden tabs, and rooms of 2–3 all-hidden peers (common during a call), may then reconnect about once a minute. That means presence churn, an ADR-0050 reconnect each time, and about 4 DO requests per reconnect.
     - Measured on `next` in Phase 2 (1, 2 and 3 hidden tabs, 15 min each).
     - Local workerd never hibernates. Whether the vitest plugin simulates hibernation is unverified, so hibernation behaviour is verified on `next` only.
   - **Pre-agreed fallback.** Trigger: any 2- or 3-peer all-hidden room shows more than 2 reconnects per 10 min in that measurement.
     - Add an alarm keepalive that is armed only while every open socket has been quiet for more than 20 s.
     - It sends the renewal to all sockets and shares the single alarm slot with the TTL: `alarm = min(ttlCheck, keepaliveDue)`.
     - It costs 1 DO request per 20 s, and only for all-quiet rooms.
     - It ships in Phase 1b behind a constant, default off, and is switched on before Phase 3a if the trigger fires.
   - **Tests:**
     - `packages/relay/src/room.keepalive.test.ts`, with an injected clock:
       - (a) a lone socket renewing 10 s after its last frame gets exactly one relay frame;
       - (b) a socket sent a peer update 3 s ago gets none;
       - (c) the first message after a forced DO restart gets one;
       - (d) with the fallback on, an all-quiet room arms the alarm and the TTL deadline is kept.
     - e2e `packages/e2e/tests/lone-peer-keepalive.spec.ts`: a lone host stays in the lobby for 75 s, with exactly one `/ws/` socket in `page.on('websocket')` and no "Reconnecting…". It uses `test.setTimeout(120_000)` and passes on the Node relay today.
     - On `next`: `smoke.mjs hold` with 1 client for 120 s → 0 reconnects; plus the Phase 2 hidden-tab measurement.
10. **Persistence (coalesced writes):**
    - Applied updates are broadcast at once and buffered for storage.
    - The buffer is flushed as one row (`Y.mergeUpdates`) when any of these happens:
      - the oldest buffered update is 5 s old;
      - the buffer reaches 512 KiB;
      - the last socket closes;
      - before compaction;
      - on any alarm.
    - No flush runs once the room is tombstoned or deleted (item 11).
    - **Durability trade:** a deploy or eviction inside the 5 s window loses those updates from relay storage only. Reconnecting clients re-supply them through sync-step-2.
    - **Compaction:** once the log has more than 32 rows, one transaction writes snapshot chunks of at most 1 MiB each (platform row maximum 2 MB) and deletes the log.
    - `meta.schemaVersion` is set at init, so future format changes can expand and contract (see "Deploy coexistence").
    - **Lazy doc load:** the Y.Doc is loaded only for a new socket, a sync message, compaction or deletion. Awareness-only wakes read no doc rows.
    - **Storage-write failure:** the room keeps relaying from memory, logs once, and never closes sockets because of it.
11. **TTL and deletion (ADR-0012; Node parity: deletion 24–25 h after the last peer leaves).** Settled design, owner may veto.
    - **State:** `meta.lastOccupiedAt`, `meta.tombstone`, plus the single DO alarm. Close events are never relied on.
    - **init:** `lastOccupiedAt = now`; alarm at `now + 1 h`.
    - **Alarm handler:**
      - First flush. Then:
        - sockets open → `lastOccupiedAt = now`, alarm at `now + 1 h`;
        - tombstoned → resume deletion;
        - `now ≥ lastOccupiedAt + TTL + 1 h` → delete;
        - else → alarm at `lastOccupiedAt + TTL + 1 h`.
      - If the handler throws, its `catch` tries to set the alarm to `now + 10 min` before re-throwing, which feeds the platform's own retries.
    - **Re-arm on any entry:** `fetch`, upgrade, `webSocketMessage`, `webSocketClose`, `info`, `setPassword`, `expireIfDue`.
      - At most once per 10 min per instance (an in-memory stamp; also on every constructor run): if `meta` exists and `getAlarm()` is null → alarm at `now + 1 h`.
      - When accepting a socket, an alarm later than `now + 1 h` is pulled in to `now + 1 h`.
      - This recovers a room whose alarm died, for example after retries ran out during a row-write-cap outage, as soon as anything touches it.
    - **Lazy expiry:** `info`, `fetch`/upgrade and `setPassword` first check the condition "no open sockets and `now ≥ lastOccupiedAt + TTL + 1 h`". If it holds, they start deletion and answer as an unknown room (`404`).
    - **Deletion (order matters):**
      1. Write `meta.tombstone = now` in one transaction and drop the flush buffer. From here on every entry answers unknown (`404`), upgrades are refused, and flushes write nothing.
      2. `await Codes(code).release(uuid)`.
         - The release is idempotent: delete only if the stored value equals `uuid`; succeed if the entry is absent or holds another UUID.
         - On failure, keep the tombstone and set the alarm to `now + 10 min`.
      3. `deleteAll()` (storage and alarm), then drop in-memory state.
      - A `Codes.claim` treats a holder whose `Room.info()` is null (deleted or tombstoned) as free.
    - **Backstop sweep** (planner-decided, owner may veto):
      - `Expiry(<UTC creation day>)` stores the UUIDs created that day (+1 row per room).
      - A daily Cron Trigger on `hnch-relay` (04:00 UTC) calls `Expiry(day).sweep()` for each of the last 30 days. That is about 30 DO requests a day; an empty day costs 1 request and no storage.
      - `sweep()` calls `Room(uuid).expireIfDue()` → `deleted | gone | live`, and drops `deleted` and `gone` entries.
      - This catches rooms whose alarm died and that nobody touches again.
      - **Residual:** a room re-occupied for more than 30 days leaves the sweep window, but its own alarm and re-arm still apply.
      - The sweep uses one of the account's free-plan cron trigger slots.
    - **Tests:**
      - alarm handler throws 7 times in a row → the room still expires through lazy expiry and through the sweep;
      - storage writes throw during the alarm (simulated row-write cap) → re-armed on the next entry;
      - an upgrade or `GET /rooms/:code` arriving between tombstone and `Codes.release` → `404`;
      - a flush timer firing after the tombstone writes nothing;
      - `Codes.release` failing → tombstone kept, retried, code later freed;
      - `release` called twice, or with a foreign UUID → no-op;
      - an unjoined room is deleted at about 25 h;
      - a room re-occupied at 23 h survives.
12. **Deploy coexistence (G0, measured):**
    - DO code updates roll out gradually.
      - A busy room kept running the **old** Room code with sockets intact for about 3–5 min after `deploy`. Then all its sockets closed with `1006` at once, reconnected and synced in 0.35–0.45 s on the new version, with state kept.
      - A hibernated room woke on new code with its sockets still attached and no close.
    - **Requirement:** old and new code must work side by side for **at least 5 min** after every relay deploy. That covers new-front-Worker → old-DO calls, old-DO ↔ new-DO calls, and old code reading rows written by new code.
      - RPC methods and meta fields are additive only.
      - Format changes go through expand/contract over **two releases at least 10 min apart**.
      - DO class renames or deletes need a migration, and `wrangler rollback` cannot cross one.
    - The `/health` smoke retries for up to 60 s until `version` = tag.
    - Release rules go into `docs/deployment.md` (Phase 1b).
13. **Data location:**
    - DOs are created in the `eu` jurisdiction.
    - The pin is on by default. Only an explicit `JURISDICTION=none` (dev and e2e) turns it off.
    - The deploy workflow fails if the deployed config turns it off.
14. **`/health`:** `200 {status:'ok', version}`, with `version` = `packages/relay/package.json#version` at build time. It is shallow: no DO call, no room or peer counts, no config or gate state. The deploy smoke also runs `GET /rooms/000000` (`0` is outside the code alphabet, so it is never minted) and expects `404 {reason:'unknown-room'}`. That proves the Worker → DO path.
15. **Test-only surfaces** (ADR-0027, partially superseded by ADR-0051):
    - `HNCH_ENABLE_TEST_ROUTES='1'` mounts `DELETE /test/rooms/:uuid`. It runs the deletion of item 11 and returns `200 {evicted}`.
    - Gate off, malformed UUID and unknown UUID all return `404 {error:'not-found'}`.
    - `HNCH_ROOM_CAP` can only lower the cap: clamped to [1, 20], invalid → 20.
    - Values are fixed per deployed version. Non-prod values are logged at WARN.
    - Only `scripts/dev.mjs` passes them. The deploy workflow asserts both are absent from `wrangler.jsonc`.
16. **Password hash at rest (D16, pending owner):**
    - Recommended: store `SHA-256(roomUuid ‖ passwordHash)` and compare the submitted `pw` the same way, in constant time. `PATCH` stores the digest too.
    - Nothing changes on the wire, and a leaked row is not the `pw` credential.
17. **Logs:**
    - `observability.logs.invocation_logs = false`; `console` logs stay content-free.
    - Phase 1b exit test: send markers to `/health?probe=<m>` and to a WS upgrade `?pw=<m>`, then search Workers Logs after 5 min. They must be absent; otherwise fall back to D12-B.

### Data flow

```
GET  /rooms/:code ─▶ hnch-relay ─▶ Codes(code).lookup ─▶ Room(uuid).info (lazy expiry) ─▶ 200 | 404 | 503
POST /rooms ──────▶ hnch-relay ─▶ Codes(code).claim (CAS, retry ≤64) ─▶ Room(uuid).init ─▶ Expiry(day).register (best-effort)
PATCH …/access ───▶ hnch-relay ─▶ Room(uuid).setPassword (digest, D16)
WS   /ws/:uuid ───▶ hnch-relay ─▶ Room(uuid).fetch: 404/400 pre-upgrade │ accept → 4002/4006 │ hibernatable socket
Room DO: Y.Doc (lazy) + Awareness ⇄ SQLite (meta{schemaVersion,lastOccupiedAt,tombstone,digest}, log ≤32, snapshot ≤1 MiB chunks)
inbound msg on S ─▶ apply/broadcast ─▶ buffer (≤5 s) ─▶ S quiet ≥10 s? relay renewal to S
alarm (hourly while occupied) ─▶ occupied? stamp : due? tombstone → Codes.release → deleteAll : re-arm
cron 04:00 UTC ─▶ Expiry(day−1…day−30).sweep ─▶ Room.expireIfDue
```

### Free-plan budget (per account, daily, reset 00:00 UTC; plan 1:1 for inbound WS messages)

Reference session: 8 peers, 1 h, 20 rounds, ~300 doc updates.

| Budget (Free) | Per reference session | Sessions/day that fit | Notes |
|---|---|---|---|
| DO duration 13,000 GB-s (128 MB billed per awake DO) | 450 GB-s | **≈ 29 occupied room-hours** | **Binding.** With ≥ 2 visible peers renewing, the DO never hibernates (inferred; measured in the 1b exit). **One room with two tabs left open all day costs ≈ 83 % if the tabs stay unthrottled (≈ 30 % if hidden and throttled).** |
| DO requests 100k | ≈ 2,300 (renewals 1,920 + sync 320 + HTTP/upgrade 30 + alarms 3) | ≈ 43 | Hidden-tab reconnect churn: about 240 per hidden peer-hour. Sweep about 30 a day. 20:1 accounting would give about 600. |
| Rows written 100k | ≈ 200 (create 4 + flushes 90 + compactions 100 + TTL 2 + delete 5) | ≈ 500 | Coalescing caps one room at ≤ 12 flushes/min. |
| Rows read 5M | ≈ 750 | ≈ 6,600 | Lazy load. |
| Storage 5 GB/account; plan **1 GB per DO** | KBs (stress room 1 MB) | n/a | |
| Workers requests 100k | ≈ 30 | ≈ 3,000 | Static assets are free (no `run_worker_first`). |

- **Abuse exposure (stated, not mitigated):**
  - Anyone can take hnch down until 00:00 UTC. Holding about 29 rooms open for an hour does it, so does about 100k cheap requests, and so does creation spam against rows written.
  - The single free rate-limit rule (10 s window, 10 s block) only slows one IP. It cannot protect a daily quota.
  - The caps are **per account**, shared with the account's other Workers (P0.7).
- **Gate (moved earlier):** P0.6 (7-day usage baseline from the VPS `/health`) plus P0.7 (other Workers' usage) must be done, and D17 answered, **before the Phase 1b merge**. Phase 1b is the point of no return: it freezes the VPS relay and flips ADR-0029.
  - Go on Free if the peak day, including other Workers, is ≤ 50 % of every row.

### Local dev, tests, e2e

- **Tooling (D5, settled):**
  - `wrangler.jsonc` plus wrangler pinned at **4.151.3** everywhere.
  - Compatibility date ≤ 2026-10-19.
  - `WRANGLER_SEND_METRICS=false`.
  - `cf` covered everything in G0 but cannot list or delete routes, and the vitest plugin needs a Wrangler config.
- **Vitest (settled):** relay only moves to vitest 4.1.x with `@cloudflare/vitest-plugin` 1.4.6 and `@vitest/coverage-istanbul`. The other packages stay on `^3.2.7` (pinned per package; no catalog). Fallback is `pool-workers` 0.12.21 on vitest 3, with workerd 7 months older; record the skew if used.
- **Shared imports (R16):** the relay imports leaf subpaths `@hnch/shared/room-code`, `@hnch/shared/auth` and `@hnch/shared/health`, which are new `exports` entries. `room-code.ts` and `auth.ts` import nothing.
- **Dev wrapper `packages/relay/scripts/dev.mjs`** (`pnpm --filter @hnch/relay dev`):
  - maps env to `wrangler dev`: `PORT` → `--port`; the ADR-0027 vars → `--var` (only if set); always `JURISDICTION:none`;
  - uses a fresh temp `--persist-to` when the test vars are set;
  - leaves the Playwright `webServer` contract and `pnpm dev:relay` unchanged;
  - needs no `.dev.vars`.
- **Relay test harness for other packages (fixes the CLI blocker):** `@hnch/relay/testing`, a new `exports` subpath, `startTestRelay(opts?) → Promise<{ httpUrl, wsUrl, stop() }>`.
  - **Node relay (1a):** creates the in-process server on port 0.
  - **Worker relay (1b):** baseline is to spawn `scripts/dev.mjs` on a free port with a temp persist dir, poll `GET /health` with a 30 s timeout, and have `stop()` kill the process tree (also on process exit). wrangler's programmatic `unstable_startWorker` may replace the spawn behind the same API if it proves stable under vitest.
  - `packages/cli/src/session.test.ts` (today it imports `../../relay/src/{code-pool,room-store,server}.js`) uses only this helper. `@hnch/relay` becomes a CLI devDependency (`workspace:*`).
  - `ci.yml` `detect-changes`: a relay change now also sets `cli=true`.
- **e2e specs exercising ADR-0027 surfaces on workerd (R10):**
  - `expired-recent-session`, `recent-rooms-list`, `room-full`, `vote-dots-196`;
  - `_screenshots/participant-cap`, `_screenshots/vote-bars-shot`;
  - plus `lone-peer-keepalive`.
  - The known pre-push reuse footgun stays (CONTRIBUTING).
- **`packages/relay/scripts/smoke.mjs`** runs one client per process (a shared BroadcastChannel hides relay behaviour). Modes: basic, cap, hold, deploy-hold, preflight.

### CI/CD and release flow

- **Relay:** a `relay-v*` release dispatches `deploy-relay.yml` on the pool (ADR-0049; workerd linux-arm64 needs GLIBC 2.35, bookworm has 2.36). It runs `wrangler deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
  - **Pre-deploy asserts:**
    - ADR-0027 vars absent;
    - `JURISDICTION` ≠ `none`;
    - **route-removal guard:** read the zone's current routes for this script, and fail if the config would remove any `hnch.dev/*` route. `wrangler deploy` deletes routes missing from config (R2). Only a manual dispatch with input `allow_route_removal=true` bypasses the guard. This stops a re-dispatched old tag from silently detaching prod.
  - **Post-deploy smoke:**
    - `/health` (retry ≤ 60 s for `version` = tag; coexistence window);
    - `GET /rooms/000000` → `404 {reason:'unknown-room'}`.
  - **Rollback:** code via `wrangler rollback` only (routes are not part of a version). Never re-dispatch tags older than current prod routes; the guard blocks it.
- **Freeze (D9):**
  - From the Phase 1b merge, relay releases deploy only to Cloudflare, and the VPS relay is frozen at `relay-v1.2.1`.
  - **Freeze length:** target ≤ 14 days, **hard max 28 days**, from the 1b merge to 3a. Past that the owner decides: push 3a, or hot-fix the VPS.
  - Emergency VPS relay fix during the freeze: branch from tag `relay-v1.2.1`, build locally, and ship with the `infra/README.md` ssh/symlink runbook (still present until Phase 4).
- **Client (D10):**
  - A `client-v*` release dispatches `deploy-client.yml`.
  - From Phase 2 until 3b: build `production` → VPS, and build `next` (relay = `next.hnch.dev`, D3-A) → `hnch-web`.
  - From 3b until Phase 4: the `production` build goes to the VPS and to `hnch-web`.
  - Input `targets: all | web-only` (default `all`). Manual verification dispatches use `web-only`, so unreleased `main` never reaches the prod VPS.
- **Secrets (D14, settled):**
  - Repo secret, referenced only by the two deploy jobs (release dispatch or manual dispatch). Environment secrets are unavailable on GitHub Free private repos.
  - Fork PRs get no secrets, and the only same-repo PR author is the owner (and their agents).
  - The token holds Workers Scripts: Edit, which is **account-wide** (it also covers the account's other Workers), plus Workers Routes: Edit on `hnch.dev`. No DNS permission is needed under D1-A.
- The `npm_config_target_*` cross-arch pin is deleted (ADR-0051 supersedes that ADR-0049 clause).

### Static headers (R8, R-HDR; D13 settled)

- The prod build has 1,386 files.
  - Exactly 24 are hashed (`<name>.<16 hex>.js|css`).
  - The rest are unhashed: `index.html`, `3rdpartylicenses.txt`, `assets/*`, `svg/*.svg`.
  - No manifest, no service worker, no wasm or fonts on origin.
- `packages/client/src/_headers` is copied to the `www` root through the `angular.json` assets:

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

  Rules are cumulative; `! Cache-Control` detaches the `/*` value, so each response carries exactly one `Cache-Control`.
- **Parity guard** (`deploy-client.yml`): fail if any `www/**/*.js|css` does not match `\.[A-Za-z0-9]{8,}\.(js|css)$`.
- **Tests on `next`** (Phase 2 exit):
  - shell and SPA-fallback paths (`/`, `/join`, `/lobby/x`, `/r/ABCD`) → exactly one `no-cache, must-revalidate` (G0 saw `no-cache` on the fallback);
  - hashed `.js` and the `.css` → `immutable` only;
  - `/svg/…`, `/assets/…`, `/3rdpartylicenses.txt` → `no-cache`.
  - A missing `/x.<hash>.js` gets `index.html` with `immutable`: Caddy parity, unchanged.

### Cutover (D2-A recommended)

1. **Pre-steps, days before, invisible to users:**
   - Zone: SSL/TLS Full (strict), minimum TLS 1.2, **Always Use HTTPS on** (Caddy redirected HTTP → HTTPS). Keep Browser Integrity Check and Bot Fight Mode as found (G0: no challenge for `ws`, Node fetch or empty-UA curl) unless the Phase 2 browser tests show a problem.
   - `hnch.dev` A → proxied (VPS origin). Check PWA, WS, CLI and native through the proxy.
   - **IONOS no longer serves the zone:** delete or disable the zone at IONOS DNS, keeping the registration with NS → Cloudflare. Check that IONOS's authoritative servers stop answering `hnch.dev`. Otherwise stale-NS resolvers (registry TTL 10,800 s) reach the VPS directly.
   - The rate-limit rule (D11). Usage notifications on, wherever Free offers them.
   - `www.hnch.dev` TLS fails on the VPS today (pre-existing; filed as a separate bug). Add a proxied `www` record and a Single Redirect `www` → apex (301).
   - VPS cert `notAfter` is 2027-01-22, with renewal around 2026-12-23 (HTTP-01 works behind the proxy, inferred). Keep the rollback window clear of that date.
2. **3a, relay first (in the window, D15):**
   - Merge PR 3a → release → `deploy-relay.yml` attaches `hnch.dev/{health*,rooms*,ws/*}`.
   - Verify: smoke, the CLI matrix, and the PWA from the VPS, whose relay calls now go to the Worker.
   - Then right away run `ssh hnch-vps sudo systemctl stop hnch-relay`. This ends the split brain: proxied sockets still open to the VPS would otherwise survive, and a peer that blips would land on the Worker with `404` while its team stayed on the VPS.
   - Rooms live on the VPS are lost once, at this moment (spec).
3. **3b, web second:** merge PR 3b → release → `deploy-client.yml` deploys the `production` build to `hnch-web` and attaches `hnch.dev/*`. Verify.
4. **Rollback (7 days):**
   - Detach `hnch.dev/*` (web), then the relay routes (dashboard or API, seconds).
   - `systemctl start hnch-relay` on the VPS.
   - Revert 3b, then 3a. Their release deploys pass the route guard because the routes are already detached.
   - **Every room created on Cloudflare since 3a is lost to users on rollback** (the VPS cannot read DO storage).

## ADR impact

- **ADR-0051 (Proposed): amendments for adr-writer, after the owner answers.**
  - **a. Topology (D1/D2):**
    - routes only: web `hnch.dev/*`; relay `hnch.dev/health*`, `/rooms*`, `/ws/*`;
    - no Custom Domain;
    - proxied apex to the VPS until decommission;
    - G0 evidence (both variants passed; routes run in front of a Custom Domain);
    - a Custom Domain's DNS record is Cloudflare-owned and read-only, which is why it is avoided.
  - **b. "B sees A leave":** reword the "blocks the e2e criterion" line as a pre-existing, smoke-only finding. The e2e suite is green.
  - **c. Test vars:** replace "`.dev.vars`" with "`scripts/dev.mjs` passes the test vars per invocation".
  - **d. Keepalive:** the requirement (ADR-0050 conformance), the piggyback mechanism, the measured hidden-tab residual, and the pre-agreed alarm fallback.
  - **e. Logs:** `invocation_logs = false` (D12).
  - **f. Rate limit:**
    - the free plan cannot match on method, so the rule is `path eq "/rooms"` (it counts the native `OPTIONS` preflight);
    - never on `/ws/*` or `/rooms/:code`;
    - it is a speed bump, not quota protection.
  - **g. Password at rest:** per D16 (a digest, if recommended).
  - **h. Abuse exposure, stated explicitly:**
    - the free daily caps (≈ 29 occupied room-hours of DO duration, 100k DO requests, 100k rows written) are **per account** and shared with other Workers;
    - they can be exhausted on purpose (about 29 rooms held for an hour) or by accident (tabs left open all day);
    - when exhausted, the relay is down for everyone until 00:00 UTC.
  - **i. Credentials:**
    - drop the stale "same posture as `NPM_TOKEN`" analogy (`release.yml` publishes through OIDC);
    - the Cloudflare token is the pool's only long-lived deploy credential;
    - Workers Scripts: Edit is account-wide;
    - repo secret, because environments are unavailable on GitHub Free private repos;
    - deploy jobs only; no DNS permission.
  - **j. ADR-0027:** **partial supersession** of its "MUST NOT … persist outside in-memory store" clause, instead of reinterpreting it. Add the env var → Worker var mapping (`scripts/dev.mjs`).
  - **k. ADR-0017:** caveat that a digest of the hash, or the hash itself, now persists. This is ADR-0017's second partial caveat (ADR-0035 is the first).
  - **l. Registration:** stays at IONOS (transfer dropped 2026-10-28). Only DNS is at Cloudflare. The IONOS DNS zone is disabled before cutover.
  - **m. Route pattern:** `/health*`, because exact `/health` misses query strings and a trailing slash. Route matching is case-sensitive.
  - **n. Deploy coexistence:** old and new DO code run side by side for ≥ 5 min. Storage and RPC changes expand/contract across two releases. Deploys drop and resync sockets in about 0.4 s (G0), so the prototype's "~250 ms" line needs updating.
  - **o. Health and failure mapping:**
    - `/health` stays shallow;
    - the deploy smoke checks a DO through `GET /rooms/000000`;
    - DO failures → `503` with no `reason` (ADR-0050 safety).
  - **p. TTL robustness:**
    - deletion at 24–25 h;
    - tombstone before the cross-DO release;
    - lazy expiry plus re-arm on entry;
    - the `Expiry` cron backstop.
  - **q. Cutover:**
    - relay → web, in order;
    - the VPS relay is stopped right after the relay routes attach;
    - rooms are lost once at cutover, and rooms created on Cloudflare are lost on rollback.
  - **r. Binding limit:** DO duration, ≈ 29 occupied room-hours/day, replaces "≈ 400 peer-hours/day" as the headline.
  - **s. ADR-0049 caveat:** ADR-0051's cross-arch caveat is merged with ADR-0052's pool-size caveat into one parenthetical and one index cell. The consolidate-forward question is answered at Phase 1b.
- **ADR-0029:** superseded by ADR-0051 (flipped in Phase 1b; status note "VPS decommissioned" in Phase 4).
- **ADR-0012:** storage clause superseded by ADR-0051. TTL, keying and content-blindness hold.
- **ADR-0049:** the `deploy-relay.yml` cross-arch clause is superseded by ADR-0051.
  - ADR-0052 (another session, branch `worktree-runner-pool-2`, not yet on main) already partially supersedes its pool-size clause.
  - Merge both caveats into one header parenthetical, `Accepted (pool-size clause superseded by ADR-0052; deploy-relay cross-arch clause superseded by ADR-0051)`, and one index cell, `ADR-0051 (partial), ADR-0052 (partial)`.
  - Index rows go in number order: 0050, 0051, 0052.
  - Two caveats hit the README consolidate-forward threshold. Decide at Phase 1b whether to consolidate 0049 forward (see Phase 1b).
- **ADR-0027:** header `Accepted (in-memory-store clause superseded by ADR-0051)`. Editorial: the audit hint points at `scripts/dev.mjs`; the stale `expired-jump-back-in.spec.ts` becomes `expired-recent-session.spec.ts`.
- **ADR-0017:** second partial caveat (ADR-0035, ADR-0051). The README consolidation guideline applies at 2+ caveats. Recommendation: don't consolidate now, since the two clauses are distinct; adr-writer confirms.
- **ADR-0050:** conforms (items 3, 5, 6, 8 and 9).
- **ADR-0001:** conforms in code; TLS terminates at Cloudflare.
- **ADR-0008, -0009, -0016, -0024, -0035:** unchanged (compatibility contract).
- **ADR-0028:** decision unaffected; its context goes stale. The P0.6 sampling is operator monitoring of an existing aggregate endpoint.
- **ADR-0014:** `packages/relay` keeps its name; it gains a `./testing` export.

## Decisions resolved

- Settled 2026-10-28 (owner, spec):
  - DNS moves to Cloudflare, with DNS-only records until the cutover pre-steps.
  - The registration stays at IONOS (registrar transfer out of scope by owner decision 2026-10-28). No `@hnch.dev` mail.
  - Room state is stored at Cloudflare (EU) and deleted 24 h after the last peer leaves.
  - Free plan only. Workers Paid is a fallback only if limits bite.
- Settled 2026-10-28 (owner): G0 approved and run. P0.4 approved.
- Settled 2026-10-28 by orchestrator (owner may veto):
  - **D5 A:** wrangler 4.151.3 plus `wrangler.jsonc`.
  - **D6 A:** `/health` = `{status, version}`.
  - **D7 A:** ADR-0051 is accepted before the 1b merge.
  - **D8 A:** 1b is atomic.
  - **D9 A:** relay → Cloudflare only from 1b; VPS frozen with a hard max of 28 days.
  - **D10 A:** dual client deploy, with `targets` input.
  - **D13 A:** splat `_headers` plus hash guard.
  - **D14 A:** one repo-secret token, deploy jobs only.
  - Keepalive by piggyback, plus the hidden-tab measurement and the pre-agreed alarm fallback.
  - TTL robustness design (item 11).
- Planner-decided (owner may veto):
  - coalesced writes plus lazy load;
  - shared leaf subpaths;
  - dev wrapper;
  - `@hnch/relay/testing` harness (1a);
  - route-removal guard;
  - ordered 3a/3b cutover with the VPS relay stopped after 3a;
  - `www` redirect in the Phase 3 pre-steps;
  - relay-only vitest 4.
- **Pending owner:** D1, D2, D3, D4, D11, D12, D15, D16, D17, and replacing the Node relay in place (no self-host fallback). See the orchestrator's question list.

## Phases

### Phase 0: Preconditions (owner-run, no PR)

- **Scope:**
  - **P0.1 DNSSEC — done.** Nothing to remove. Optional later: Cloudflare DNSSEC, with the DS record set at IONOS.
  - **P0.2 NS switch — done.** Active since 2026-10-28 14:17 UTC (NS `amy` / `rayden.ns.cloudflare.com`).
  - **P0.3 Zone settings:**
    - read in G0: `security_level=medium`, `browser_check=on`, `fight_mode=false`, `websockets=on`, `ssl=full`, `always_use_https=off`, `min_tls_version=1.0`;
    - to set before 1b: SSL Full (strict), min TLS 1.2, Rocket Loader and Email Obfuscation off;
    - Always Use HTTPS is set in the Phase 3 pre-steps.
  - **P0.4 `next.hnch.dev` — done.** Proxied `AAAA 100::`; the `next-cd` test host was torn down.
  - **P0.5 secrets:** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets (D14).
  - **P0.6 usage baseline:**
    - sample `https://hnch.dev/health` (`rooms.active`, `peers.connected`) every 15 min for at least 7 days, with a temporary local cron writing to a CSV (deleted afterwards);
    - compute peak-day occupied room-hours and peer-hours, plus all-day "forgotten tab" rooms.
  - **P0.7 account inventory:** list every Worker, Pages Function, DO namespace and cron trigger on the Cloudflare account (for example `app.pdfofen.de`), with their daily usage from analytics. Free caps are per account.
  - **G0 topology gate: PASS, both variants (2026-10-28; throwaway spike, torn down; evidence in the job's `g0/` folder).**
    - **Variant A** (routes only; web `next.hnch.dev/*`, relay `/health`, `/rooms*`, `/ws/*`):
      - (a) every relay path, including the WS `101`, was answered by the relay. `/`, `/r/ABCD` and `/join?…` came from the web Worker with `no-cache`; hashed JS was `immutable`; `GET /rooms/ZZZZZZ` → relay JSON `404`.
      - (b) two separate Node processes using the real `connectToRelay` plus `ws` 8.20.1 synced votes and presence, with 0 closes and no challenge.
      - (c) holders kept their sockets for 300 s across a web redeploy: 0 closes, maximum tick gap 3.03 s.
    - **Variant B** (Custom Domain web plus relay routes on `next-cd.hnch.dev`): (a)–(c) passed the same way. Routes run in front of the Custom Domain Worker.
    - **Lessons, applied above:**
      - use `/health*`;
      - matching is case-sensitive;
      - deploy coexistence is ≥ 5 min;
      - a Custom Domain's DNS record is Cloudflare-owned and read-only, so it forces a hard apex switch → **D1-A**;
      - zone defaults did not challenge `ws`, Node fetch or empty-UA curl.
- **Exit bar:**
  - G0 recorded (done).
  - P0.3–P0.5 done.
  - P0.6 and P0.7 results recorded here, with D17 answered: this gates the 1b merge.
- **PR title scope:** none (ops only).
- **Closes:** `Closes #TBD` (tracking issue for the plan, closed by Phase 4)
- **Worktree:** none
- **Depends on:** none

### Phase 1a: Relay test harness (prep PR)

- **Scope:**
  - **`packages/relay`:**
    - `testing/start-relay.mjs` (`startTestRelay`, backed by today's Node relay);
    - `package.json` `exports` `./testing` (plus `.` → `./dist/index.js`).
  - **`packages/cli`:**
    - `src/session.test.ts` uses `startTestRelay` instead of importing `relay/src/*`;
    - `package.json` devDependency `@hnch/relay: workspace:*`.
  - **`packages/shared/src/relay-client.test.ts`:** fix the stale `relay/src/ws-connection.ts` comment (or defer it to 1b).
  - **Root:** `pnpm-lock.yaml`.
- **Exit bar:**
  - CLI, relay and shared lanes green.
  - `rg "relay/src" packages/cli packages/shared packages/client` finds nothing outside comments.
- **PR title scope:** `test(cli,relay,repo): start the relay for CLI session tests through @hnch/relay/testing`. `test` cuts no release, which avoids a spurious CLI npm publish. Adding `cli` to 1b's `feat` title would publish a no-op CLI minor.
- **Closes:** `Refs #TBD`
- **Worktree:** `git fetch origin && pnpm worktree:add cloudflare-hosting-phase-1a main`
- **Depends on:** none (can merge today).

### Phase 1b: Relay on Workers + Durable Objects (proving ground `next.hnch.dev`)

- **Scope:**
  - **`packages/relay`, replaced in place:**
    - Worker router (`src/index.ts`, `scheduled` handler for the sweep);
    - `Room` DO (contract items 7–12, 16);
    - `Codes` DO (CAS claim, idempotent release);
    - `Expiry` DO (register, sweep);
    - protocol module ported from `ws-connection.ts`;
    - config parsing;
    - `wrangler.jsonc`:
      - `hnch-relay`, sqlite DO migration v1 for `Room`, `Codes` and `Expiry`, `JURISDICTION=eu`;
      - routes `next.hnch.dev/{health*,rooms*,ws/*}`;
      - cron `0 4 * * *`;
      - `observability.logs.invocation_logs = false`;
    - `scripts/dev.mjs`, `scripts/smoke.mjs`;
    - `testing/start-relay.mjs` reimplemented with the same API;
    - `vitest.config.ts` (vitest 4, `@cloudflare/vitest-plugin`, istanbul), `tsconfig.json`;
    - `package.json`: drops `ws`, `@types/ws`, `tsx`, `@types/node`; adds `wrangler@4.151.3`, the vitest stack and Workers types;
    - deletes `server.ts`, `room-store.ts`, `code-pool.ts`, `snapshot.ts`, `ws-connection.ts` and their tests;
    - tests for items 1–17, including the keepalive and TTL robustness tests listed.
  - **`packages/shared`:** `exports` `./room-code`, `./auth`, `./health`; `src/health.ts` → `{status, version}`.
  - **`packages/e2e`:** `tests/lone-peer-keepalive.spec.ts`.
  - **`.github/workflows/deploy-relay.yml`:**
    - Cloudflare deploy;
    - asserts (ADR-0027, jurisdiction, route-removal guard with `allow_route_removal` input);
    - smoke (`/health` with retry, `GET /rooms/000000`) on `next.hnch.dev`;
    - cross-arch env removed.
  - **`.github/workflows/ci.yml`:** `detect-changes` relay → `cli=true`.
  - **Root:** `.gitignore` (`.wrangler/`), `pnpm-lock.yaml`.
  - **Docs:**
    - `CONTRIBUTING.md`: `relay` scope row → "Cloudflare Worker"; dev notes.
    - `docs/deployment.md`:
      - the Cloudflare relay on `next`;
      - secrets and token scope;
      - relay release rules (coexistence, expand/contract, no old-tag re-dispatch);
      - the freeze and the emergency VPS fix path.
  - **ADRs:**
    - 0051 → Accepted (amended); 0029 → Superseded;
    - partial caveats on 0012, 0027 and 0017;
    - 0049 gets one merged parenthetical and one index cell with ADR-0052 (rebase on 0052 if it lands first);
    - `adr/README.md` index in order 0050, 0051, 0052.
    - **Phase 1b decision:** consolidate 0049 forward per the README, or keep two caveats. Recommendation: keep the two caveats. The clauses are independent, and both are one line. Consolidate once a third caveat arrives. adr-writer confirms.
- **Exit bar:**
  - CI green: relay, cli (through the harness), shared and e2e chromium on local workerd, including the ADR-0027 specs and `lone-peer-keepalive`.
  - Merge cuts a `relay-v*` minor; `deploy-relay.yml` deploys; both smokes pass on `next.hnch.dev`.
  - `smoke.mjs` plus the CLI matrix on `next` (1.1.1 with `HNCH_RELAY_URL=wss://next.hnch.dev`; 1.1.2 and latest with `https://next.hnch.dev`). Checks:
    - create, join, vote, reveal;
    - 4002;
    - 400 → lookup;
    - 404 → lookup;
    - 21st peer → 4006;
    - case-insensitive code;
    - fresh device after the room emptied;
    - lone hold for 120 s → 0 reconnects.
  - **Deploy coexistence:** a busy room held across a `deploy-relay.yml` re-dispatch survives the old-code window and the `1006` resync, with state intact.
  - **Preflight:** `curl -X OPTIONS https://next.hnch.dev/rooms` with `Origin: capacitor://localhost` and with `Origin: https://localhost`, plus `Access-Control-Request-Method: POST` and `Access-Control-Request-Headers: content-type`. Each → `204` with ACAO `*` and the methods and headers listed.
  - Logs marker test passes.
  - A 2-peer room held 30 min shows ≈ 225 GB-s of duration.
  - `https://hnch.dev/health` is still `1.2.1`.
  - security-reviewer sign-off.
- **PR shape (D8):** one atomic PR. Otherwise the release-dispatched deploy would ship Worker code to the VPS.
- **PR title scope:** `feat(relay,shared,e2e,ci,docs,repo): run the relay on Cloudflare Workers and Durable Objects`. No `cli`: 1a moved the CLI to the harness, and the harness lives in `packages/relay`.
- **Closes:** `Closes #TBD`
- **Worktree:** `git fetch origin && pnpm worktree:add cloudflare-hosting-phase-1b main`
- **Depends on:**
  - 1a merged;
  - Phase 0 exit (P0.6, P0.7, D17);
  - the owner's answers on D16 and on replacing the Node relay in place;
  - the amended ADR-0051 accepted (D7).

### Phase 2: PWA on Workers Static Assets, validated against the Worker relay (`next.hnch.dev`)

- **Scope:**
  - **`packages/client`:**
    - `wrangler.jsonc` (`hnch-web`, assets `./www`, SPA not-found handling, no `run_worker_first`, route `next.hnch.dev/*`);
    - `src/_headers` plus the `angular.json` assets entry;
    - **D3-A:** `src/environments/environment.next.ts` (relay `https://next.hnch.dev` / `wss://next.hnch.dev`) plus an `angular.json` `next` configuration (`fileReplacements`, same optimisation as `production`);
    - `package.json` (wrangler dev dependency).
  - **`.github/workflows/deploy-client.yml`:**
    - keep the VPS ship of the `production` build;
    - add the hash parity guard;
    - add a `next` build → `wrangler deploy` to `hnch-web`;
    - add the `targets: all | web-only` input;
    - smoke `https://next.hnch.dev/` (`<app-root`, header matrix).
  - **Docs:** `docs/deployment.md`, the PWA section.
  - **Root:** `pnpm-lock.yaml`.
- **Exit bar:**
  - The header tests pass on `next`.
  - G0 (a)–(c) re-run on the real Workers.
  - A manual `targets=web-only` dispatch on `main` deploys to `next` only; the VPS is untouched.
  - **Browser matrix on `next`** (Chrome, Firefox, Safari desktop; iOS Safari; Android Chrome): create, join, vote, reveal, password room, reload mid-round, presence across two devices; no Browser Integrity Check or Bot Fight Mode challenge.
  - **Hidden-tab measurement:** 1, 2 and 3 hidden Chrome tabs in one room for 15 min each. Record reconnects per 10 min. The fallback trigger (item 9) is decided and recorded here, and its request cost is added to the budget.
  - `hnch.dev` is unchanged.
- **PR title scope:** `build(client,ci,docs,repo): serve a next build of the PWA from Workers Static Assets on next.hnch.dev`. No client release; verification uses `web-only` dispatches.
- **Closes:** `Closes #TBD`
- **Worktree:** `git fetch origin && pnpm worktree:add cloudflare-hosting-phase-2 main`
- **Depends on:** 1b merged. Implementation can run in parallel with 1b.

### Phase 3a: Cutover, relay paths on `hnch.dev`

- **Scope:**
  - **Owner pre-steps:** the Cutover list, step 1.
  - **Repo:**
    - `packages/relay/wrangler.jsonc` adds `hnch.dev/{health*,rooms*,ws/*}`;
    - `deploy-relay.yml` smoke targets `https://hnch.dev`;
    - `docs/deployment.md`: prod topology, cutover and rollback runbook, rate-limit rule, free-plan budget, and the `www` redirect.
- **Exit bar:**
  - `https://hnch.dev/health` returns the Worker version, and `GET /rooms/000000` returns the relay JSON `404`.
  - CLI matrix on default config (1.1.1 with default `wss://hnch.dev`, 1.1.2, latest), and the current iOS and Android store builds: create, join, vote, reveal, password, room-full.
  - The PWA, still served by the VPS through the proxy, works against the Worker relay.
  - The VPS `hnch-relay` is stopped.
  - Rate-limit probe: the 11th request to `/rooms` within 10 s from one IP → `429`; `GET /rooms/:code` and WS are unaffected.
- **PR title scope:** `feat(relay,ci,docs): serve the relay on hnch.dev from Cloudflare`. Merge only in the window (D15).
- **Closes:** `Refs #TBD`
- **Worktree:** `git fetch origin && pnpm worktree:add cloudflare-hosting-phase-3a main`
- **Depends on:**
  - Phases 1b and 2 exit bars met;
  - the fallback keepalive switched on, if the Phase 2 trigger fired;
  - pre-steps done;
  - D15.

### Phase 3b: Cutover, PWA on `hnch.dev`

- **Scope:**
  - `packages/client/wrangler.jsonc` adds `hnch.dev/*`.
  - `deploy-client.yml`: `hnch-web` now gets the `production` build (the `next` build retires; `next.hnch.dev` keeps serving the prod build until Phase 4). The VPS ship stays for the rollback window. Smoke targets `https://hnch.dev`.
  - `packages/client/src/environments/environment.prod.ts` comment (no longer VPS/Caddy).
  - `docs/project.md` (snapshot wording: persisted, EU, 24 h) and `docs/roadmap.md:241`.
- **Exit bar:**
  - `/` is served by `hnch-web` (`cf-ray`, no `Server: Caddy`).
  - The header matrix passes on `hnch.dev`.
  - Browser smoke on `hnch.dev`: create, join, vote, reveal.
  - A room created before a relay redeploy rejoins intact.
  - The rollback runbook is written and was rehearsed on `next`.
- **PR title scope:** `feat(client,ci,docs): serve the PWA on hnch.dev from Cloudflare`. Merge in the same window, after the 3a exit bar.
- **Closes:** `Closes #TBD`
- **Worktree:** `git fetch origin && pnpm worktree:add cloudflare-hosting-phase-3b main`
- **Depends on:** 3a exit bar met.

### Phase 4: Decommission the VPS (≥ 7 days after 3b, no rollback used)

- **Scope** (R15 delete list):
  - **Delete:** `infra/Caddyfile`, `infra/bootstrap-vps.sh`, `infra/hnch-relay.service`, `infra/deploy.pub`, `plans/plan-pwa-deploy.md`.
  - **`infra/README.md`:** drop the VPS and PWA-host halves; keep the runner section.
  - **`infra/runner/**` untouched**, including the stale `Dockerfile:24` comment.
  - **`deploy-client.yml`:** drop the VPS steps and the `next` remnants.
  - **`packages/relay/testing`:** drop the Node-relay remnants, if any.
  - **Both `wrangler.jsonc`:** drop the `next.hnch.dev` routes.
  - **Docs:**
    - `docs/deployment.md`: drop the VPS sections.
    - `CONTRIBUTING.md:56`: `infra` = runner only.
    - `adr/0029` status note.
  - **Owner ops:**
    - **Precondition:** confirm in the IONOS contract that the `hnch.dev` registration is **not bundled with the VPS**. Cancelling could release the domain, and that cannot be undone. If it is bundled, move the domain to a standalone IONOS domain contract first.
    - Then cancel the VPS.
    - Delete the `VPS_*` secrets.
    - Replace the `hnch.dev` A record with a proxied `AAAA 100::`.
    - Remove `next.hnch.dev` and its routes (dispatch with `allow_route_removal=true`).
    - Remove the P0.6 cron.
- **Exit bar:**
  - No `hnch-vps`, `VPS_*` or Caddy references remain outside `docs/plans/`, `docs/specs/`, `plans/archive/`, CHANGELOGs, superseded ADRs and `infra/runner/Dockerfile`.
  - IONOS appears only as the registrar.
  - CI green; `hnch.dev` is unaffected.
  - The VPS is cancelled and the domain is still registered.
- **PR title scope:** `chore(relay,client,infra,ci,docs,repo): decommission the VPS`
- **Closes:** `Closes #TBD` (tracking issue)
- **Worktree:** `git fetch origin && pnpm worktree:add cloudflare-hosting-phase-4 main`
- **Depends on:** 3b merged, plus 7 days with no rollback.

## Open questions

- **Inbound WS accounting** on Free (1:1 or 20:1): undocumented, so the plan assumes 1:1.
- **Open sockets when a daily cap is hit:** undocumented.
- **"B sees A leave"** (a cleanly closed peer stays shown as present): pre-existing on the Node relay. File it as a separate issue; not a blocker.
- **`www.hnch.dev` TLS failure** on the VPS: pre-existing. File it as a separate bug; it is fixed by the Phase 3 redirect.
- **Outbound WS frame size limit:** undocumented (inbound is 32 MiB).
- **Cloudflare DPA and data-location terms:** not reviewed; owner, outside the plan.
- **Registrar:** `hnch.dev` stays at IONOS (out of scope by owner decision 2026-10-28). Keep the IONOS NS setting pointing at Cloudflare.

## Verification plan

- **1a:** `pnpm --filter @xauyxau/hnch test typecheck`, `pnpm --filter @hnch/relay test typecheck`.
- **1b:**
  - relay `typecheck`, `format:check`, `lint`, `test:coverage`, `build`;
  - shared `test`, `typecheck`;
  - cli `test` (through the harness against workerd), `typecheck`;
  - client `typecheck`;
  - `pnpm test:e2e` (chromium);
  - on `next`: `smoke.mjs` (all modes), the CLI matrix, deploy coexistence, preflight curl, logs marker, duration check.
- **2:** production and `next` builds; hash guard; header matrix; browser matrix; hidden-tab measurement; `web-only` dispatch.
- **3a/3b:** smoke (shallow plus DO); CLI matrix on default config; iOS and Android store builds; rate-limit probe; header matrix; browser smoke; rollback rehearsal beforehand.
- **4:** full CI and e2e; reference inventory.
- **Every PR:** CI `Verify` plus `E2E (Playwright)` green. No telemetry (ADR-0028).

## Screenshots

**Required:** No

- Reason: no UI change (hosting and relay runtime only).

## References

- Spec: `docs/specs/cloudflare-hosting.md`
- ADR-0051 (Proposed), ADR-0029, ADR-0012, ADR-0001, ADR-0008, ADR-0009, ADR-0016, ADR-0017, ADR-0024, ADR-0027, ADR-0035, ADR-0049, ADR-0050
- Prototype (throwaway, never merge): branch `prototype/cloudflare-relay`
- Research digest, G0 result and plan critique, 2026-10-28 (orchestrator job notes)
- Today's deploy: `docs/deployment.md`, `infra/README.md`, `infra/Caddyfile`, `.github/workflows/deploy-relay.yml`, `.github/workflows/deploy-client.yml`
- Cloudflare docs: [Workers routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
