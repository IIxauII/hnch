# Deployment

Production deployment for hnch: Cloudflare Workers and Durable Objects ([ADR-0051](../adr/0051-cloudflare-hosting.md); design history in #544 and #549). `hnch.dev` has been served by Cloudflare since the switch on 2026-10-29 (#549). The IONOS VPS that served it before (ADR-0029) is shut down and deleted ([ADR-0054](../adr/0054-vps-decommission.md)); there is no VPS to fall back to.

## Topology

| Surface | Where it lives | How it gets there |
|---|---|---|
| Relay (`@hnch/relay`) | Cloudflare Worker `hnch-relay` + Durable Objects (EU), on routes `hnch.dev/health*`, `/rooms*`, `/ws/*` | `deploy-relay.yml` on `relay-v*` tags → `wrangler deploy` |
| PWA static (`@hnch/client`) | Cloudflare Worker `hnch-web` (Workers Static Assets, assets-only), on route `hnch.dev/*` | `deploy-client.yml` on `client-v*` tags → `wrangler deploy` |
| CLI (`@xauyxau/hnch`) | npm registry | `release.yml` runs semantic-release; `cli-v*` tags trigger npm publish via `@semantic-release/npm` (configured in `packages/cli/release.config.mjs`) |

All three surfaces speak to the same relay at `wss://hnch.dev/ws/:uuid` and `https://hnch.dev/rooms/:code`. The PWA is same-origin, so it needs no CORS. Native apps (`capacitor://localhost`, `https://localhost`) preflight `POST /rooms`; the relay answers `204` with `Access-Control-Allow-Origin: *`.

**Routes.** Workers routes only run on proxied hostnames, so both Workers deployed with their routes from their first release and stayed inert until the apex records were proxied at the switch. The relay's routes are more specific than `hnch.dev/*`, so they win over `hnch-web`'s.

## DNS and edge

Zone `hnch.dev` on Cloudflare (Free plan). The registration stays at IONOS, with its NS delegation pointing at Cloudflare.

| Record | Origin | Proxy | Serves |
|---|---|---|---|
| `hnch.dev` A / AAAA | `192.0.2.1` / `100::` (placeholder) | proxied, TTL Auto | Workers `hnch-web` and `hnch-relay` |
| `www.hnch.dev` A / AAAA | `192.0.2.1` / `100::` (placeholder) | proxied, TTL Auto | `301` to the apex (redirect rule below) |
| `hnch.dev` TXT, `_dmarc` TXT | n/a | DNS-only | `v=spf1 -all` and `p=reject`: the domain sends no mail |

- **Placeholder origin.** Every request is answered by a Worker or a rule, never by an origin (unless a route fails open, see [Free-plan budget and alerts](#free-plan-budget-and-alerts)). `192.0.2.1` and `100::` are reserved addresses that reach nothing, so a reassigned VPS IP can never serve `hnch.dev`. Don't set a record to DNS-only: it would point browsers at the placeholder.
- **Zone settings:** SSL/TLS Full (strict), minimum TLS 1.2, Always Use HTTPS (`http://` → `301` to `https://`), Rocket Loader and Email Obfuscation off, Browser Integrity Check on, Bot Fight Mode off.
- **`www` redirect:** Single Redirect `http.host eq "www.hnch.dev"` → `concat("https://hnch.dev", http.request.uri.path)`, `301`, query string kept.
- **Rate limit** "hnch: limit room creation", the one rule Free allows: `http.request.uri.path eq "/rooms"`, 10 requests per 10 s per IP (`ip.src` plus the mandatory `cf.colo.id`), block for 10 s with `429`.
  - Free can't match on method, so native `OPTIONS /rooms` preflights count too.
  - It is a speed bump against one IP, not quota protection.
  - Cloudflare counts approximately: measured 2026-10-29, a burst of 12 `OPTIONS /rooms` got `429` from the 10th request on. `GET /rooms/:code` and `/health` kept answering during the block.
  - `/ws/*` and `GET /rooms/:code` are never limited (ADR-0051): a `429` on the upgrade makes y-websocket retry forever.

## Production URL

`https://hnch.dev` — single origin for everything.

| Path | Handled by |
|---|---|
| `GET /health` | relay (liveness probe + smoke test) |
| `POST /rooms`, `GET /rooms/:code`, `PATCH /rooms/:uuid/access` | relay (per ADR-0016 / ADR-0017) |
| `WS /ws/:uuid` | relay (y-websocket sync) |
| Everything else | static PWA, with SPA fallback to `/index.html` |

## The switch and rollback

- **Switched 2026-10-29, about 14:55 UTC** (#549): the apex A and AAAA records were proxied, the repo variable `HNCH_LIVE` set to `true`, and both deploys re-dispatched (relay at `relay-v1.3.1`, client at `main`) to run their `hnch.dev` smokes.
- **The VPS went first.** It was shut down and deleted before the switch, not after it as ADR-0054 planned, so `hnch.dev` was down between the shutdown and the switch.
- **VPS rooms were dropped** with the VPS, with no migration (4 snapshotted, 0 active at the cutover review on 2026-10-29). Their codes answer `404` on Cloudflare, which clients treat as an ended session: a "That session isn't active anymore" toast, and the entry leaves the recent-rooms list.
- **Rollback is Cloudflare-side only:** `wrangler rollback` of `hnch-relay` or `hnch-web` (see the release rules below), or fix forward with a release. There is no VPS rollback and no DNS-only rollback; a DNS-only record points at the placeholder origin.
- **A rollback doesn't heal a missing-chunk hit.** A tab still on the old build that requests a chunk the new deploy removed gets `index.html` cached as `immutable` under that chunk's URL. Rolling back to the old build doesn't clear it; that user needs a hard reload.

## Release gate

A red `main` releases and so deploys nothing. `release.yml` starts only from a green `ci.yml` push run on `main` (a `workflow_run` trigger) and releases the commit that run tested. A red or cancelled merge releases with the next green run; a green run whose commit `main` has already moved past (a newer merge) releases nothing and leaves it to that merge's run. The deploys below are dispatched only by a release, so they inherit the gate. Details and recovery: [release.md › When a release runs](release.md#when-a-release-runs). A manual `deploy-*.yml` dispatch bypasses it.

## Relay release-to-deploy pipeline

```
commit on main (feat(relay): / fix(relay): / etc)
        │
        ▼
ci.yml push run on main goes green (red or cancelled: wait for the next green run)
        │
        ▼
release.yml — semantic-release per package on the commit that run tested,
              tags relay-vX.Y.Z
        │
        ▼
deploy-relay.yml — dispatched with --ref relay-vX.Y.Z
        │
        ├── cold pnpm install on a fresh hosted runner (no cache restored)
        │   → build @hnch/shared (bundled into the Worker)
        ├── deploy-guard.mjs config   ADR-0027 test vars absent, JURISDICTION "eu",
        │                             every route on hnch.dev with a zone_id
        ├── deploy-guard.mjs live     no live hnch-relay route removed (unless the
        │                             allow_route_removal input), no older version
        ├── wrangler deploy --tag relay-vX.Y.Z
        ├── deploy-guard.mjs verify   the live deployment carries that tag
        └── if HNCH_LIVE == 'true':   /health answers X.Y.Z (retried up to 60 s),
                                      GET /rooms/000000 → 404 unknown-room
```

`wrangler deploy` deletes any route of the Worker that is missing from `wrangler.jsonc`, which would send relay paths to the SPA. The guard refuses that; only a manual dispatch with `allow_route_removal` lets a route go.

## Relay release rules

These keep a relay release safe while old and new code run side by side.

- **Deploy coexistence.** Durable Object code rolls out gradually. In G0 (2026-10-28) a busy room kept running the old code for 3–5 min after a deploy, then all its sockets closed `1006` together and resynced on the new code in about 0.4 s, state kept. Hibernated rooms woke on the new code. Old and new code must work together for **at least 5 minutes** after every deploy: a new Worker calling an old Durable Object, old and new objects calling each other, and old code reading rows new code wrote.
- **Additive only.** RPC methods and `meta` fields are added, never renamed or removed in one release.
- **Expand/contract.** A format change ships as two releases at least 10 minutes apart: first read both formats, then write the new one (and drop the old later).
- **Classes.** Renaming or deleting a Durable Object class needs a new migration in `wrangler.jsonc`, and `wrangler rollback` cannot cross a migration.
- **Rollback is `wrangler rollback`.** Never re-dispatch an old tag. A dispatch runs the workflow at that tag: from `relay-v1.3.0` on, the guard refuses a version older than the live one. **A tag at or before `relay-v1.2.1` carries the pre-1b workflow, with no guard and an SSH deploy to the VPS.** With the `VPS_*` secrets deleted ([ADR-0054](../adr/0054-vps-decommission.md)) it fails at that step and deploys nothing; don't dispatch one. Roll back from a machine with the deploy token:

  ```sh
  pnpm --filter @hnch/relay exec wrangler deployments list
  pnpm --filter @hnch/relay exec wrangler rollback <version-id> --message "<why>"
  ```

- **Smokes after the switch** retry `/health` for up to 60 s, since old code may still answer.

## PWA release-to-deploy pipeline

```
commit on main (feat(client): / fix(client): / etc)
        │
        ▼
ci.yml push run on main goes green (red or cancelled: wait for the next green run)
        │
        ▼
release.yml — semantic-release per package on the commit that run tested,
              tags client-vX.Y.Z
        │
        ▼
deploy-client.yml — dispatched with --ref client-vX.Y.Z
        │
        ├── build   cold install (fresh store, client + shared, no install scripts)
        │           ├── deploy-guard.mjs config  assets-only from ./www, SPA fallback, no
        │           │                            run_worker_first, no workers.dev or preview
        │           │                            URLs, every route on hnch.dev with a zone_id
        │           ├── ng build (production), once
        │           ├── deploy-guard.mjs www     _headers at the root of www, every .js and
        │           │                            .css named <name>.<16 lowercase hex>.js|css
        │           └── upload www (artifact kept 7 days, so a failed job can be re-run)
        │
        └── web     cold install (fresh store, client only, no install scripts);
                    │   fresh www from the build; deploy-guard.mjs config and www again
                    ├── deploy-guard.mjs live    no live hnch-web route removed (unless the
                    │                            allow_route_removal input)
                    ├── wrangler deploy --message "<tag or untagged> (<sha>)"
                    │                  [--tag client-vX.Y.Z, only on that release's commit]
                    ├── deploy-guard.mjs verify  the version this run uploaded serves 100 %,
                    │                            names the commit, carries the tag (or none);
                    │                            hnch.dev/* is live for hnch-web
                    └── if HNCH_LIVE == 'true':  https://hnch.dev/ serves this build (retried
                                                 up to 60 s), from Cloudflare, with exactly one
                                                 Cache-Control on /, /lobby/x, the licenses, the
                                                 hashed main.js and /_headers (the SPA, not the
                                                 file)
```

`web` deploys exactly the `www` that `build` uploaded, so a failed `web` job can be re-run without a rebuild. The guards live in `packages/client/scripts/deploy-guard.mjs`; the route, version and Cloudflare API helpers are shared with the relay's guard through `scripts/cloudflare/worker-guard.mjs`.

## PWA release rules

- **Cache headers come from `packages/client/src/_headers`**, which `angular.json` copies to the root of `www`. `hnch-web` applies it; wrangler does not serve the file itself. Each response carries exactly one `Cache-Control`:
  - `/*.js` and `/*.css`: `public, max-age=31536000, immutable`;
  - everything else (`index.html`, SPA deep links such as `/lobby/x`, `/svg/*`, `/assets/*`, `favicon.ico`, `3rdpartylicenses.txt`): `no-cache, must-revalidate`;
  - a missing `/x.<hash>.js` falls back to `index.html` with `immutable`.

  Because `/*.js` and `/*.css` are immutable for a year, every one of them must be content-hashed (`outputHashing: all`). The hash guard (`deploy-guard.mjs www`) fails the build unless each matches `\.[0-9a-f]{16}\.(js|css)$`, the webpack builder's exact hash form; a builder change that alters it fails the deploy rather than slipping through.
- **SPA fallback.** Any path without a file answers `index.html` with `200`. `/index.html` itself redirects (`307`) to `/`.
- **No service worker.** Plain SPA: no offline shell, no install prompt (deferred from v1). Adding one needs a re-read of the cache headers above against the service-worker lifecycle.
- **Tags and messages.** The `hnch-web` version is tagged `client-vX.Y.Z` only when the deployed commit is that release tag's commit; any other commit deploys untagged. Every version's message names the full commit SHA, and `verify` checks the version id `wrangler deploy` just uploaded (from `WRANGLER_OUTPUT_FILE_PATH`) is the one serving, so a re-dispatch can't pass on an earlier upload.
- **Cold installs.** The `build` and `web` jobs run on GitHub-hosted `ubuntu-24.04-arm` ([ADR-0056](../adr/0056-github-hosted-runners.md)) and restore no Actions cache. Each runs `pnpm install --frozen-lockfile --ignore-scripts` into the fresh runner's empty store, so pnpm checks every package against the lockfile; `build` filters to `@hnch/client...`, `web` to `@hnch/client` (pnpm still installs the workspace root's packages). Node 22 comes from `actions/setup-node`, and pnpm's version from `packageManager` through Corepack.
- **A client release never touches the relay.** In G0 (2026-10-28) relay sockets held for 300 s across a web redeploy with 0 closes.
- **Rollback.** `wrangler rollback` (instant, no rebuild; `hnch-web` has no Durable Objects). A dispatch of an older `client-v*` tag also works, but only for a tag cut after the deploy job named its environment (later than `client-v1.47.0`, see [Environments](#environments)). **Never re-dispatch a pre-ADR-0054 tag (≤ `client-v1.46.0`):** a dispatch runs the workflow at that tag, which ships only to the VPS. With the `VPS_*` secrets deleted it fails at its SSH step, and it never reaches `hnch-web`.

  ```sh
  pnpm --filter @hnch/client exec wrangler deployments list
  pnpm --filter @hnch/client exec wrangler rollback <version-id> --message "<why>"
  ```

## Required GitHub secrets and variables

| Name | Kind | Lives in | Value | Where used |
|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | environment `cloudflare` | token `hnch-ci-deploy` (below) | `deploy-relay.yml` and the `web` job of `deploy-client.yml` only |
| `CLOUDFLARE_ACCOUNT_ID` | secret | environment `cloudflare` | the Cloudflare account ID | `deploy-relay.yml` and the `web` job of `deploy-client.yml` only |
| `RELEASE_TOKEN` | secret | environment `release` | fine-grained PAT (also needs actions: write, for the deploy dispatch) | `release.yml`: semantic-release's release commits, tags and GitHub Releases, and the `gh workflow run deploy-*.yml` dispatch |
| `CODECOV_TOKEN` | secret | repo | Codecov upload token | the coverage upload in `ci.yml` |
| `HNCH_LIVE` | variable | repo | `true` since the switch (2026-10-29; `false` before) | gates the hnch.dev smokes of both deploys |
| `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` | secret | — | VPS SSH target, user, CI key | nothing; deleted when ADR-0054 merged, so an old-tag dispatch fails instead of deploying to the VPS |
| `NPM_TOKEN` | secret | — | — | nothing; deleted, the CLI publishes through npm trusted publishing (OIDC) |

**Token scope (`hnch-ci-deploy`):** Account › Workers Admin (formerly Workers Scripts: Edit; account-wide, so it also covers the account's other Workers, and lets the first deploy create `hnch-web`) and Zone `hnch.dev` › Workers Routes: Write. No DNS permission and no Zone: Read, which is why every route in `wrangler.jsonc` carries `zone_id`. If a deploy fails with an authentication error, add the missing permission to the token in the dashboard (tokens can be edited in place). It is referenced only by the two deploy jobs, and is CI's only long-lived deploy credential.

Set with:

```sh
gh secret set CLOUDFLARE_API_TOKEN --env cloudflare
gh secret set CLOUDFLARE_ACCOUNT_ID --env cloudflare
gh secret set RELEASE_TOKEN --env release
gh secret set CODECOV_TOKEN
gh variable set HNCH_LIVE --body true
```

### Environments

A job sees an environment's secrets only if it names the environment and the run's ref (`github.ref`) passes the environment's deployment rule:

- `release`: branch `main`. The Release job runs on `main` only, for both of its triggers.
- `cloudflare`: branch `main` and tags `client-v*` and `relay-v*`. semantic-release's `publishCmd` (`scripts/release/build-releaserc.mjs`) dispatches each deploy with `--ref <package>-vX.Y.Z`, so the deploy runs on the tag ref, not on `main`.

The rule checks the ref the workflow runs from, not the code it deploys: both deploys check out `inputs.ref` when it is set, so a dispatch from `main` can deploy any ref. Only someone with write access can dispatch, so this gap is accepted.

A tag cut before the deploy jobs named `cloudflare` (`client-v1.47.0`, `relay-v1.4.0` and older) runs a workflow without it, so with the Cloudflare secrets off repo level a dispatch of one gets none and fails. Roll back with `wrangler rollback`, as the release rules above say.

A PR names neither environment. A branch PR's run gets `CODECOV_TOKEN` and no other secret; a fork's or Dependabot's gets no secrets.

## Local relay

`pnpm dev:relay` (or `pnpm --filter @hnch/relay dev`) runs the Worker on local workerd through `packages/relay/scripts/dev.mjs`: `PORT` → `--port`, the ADR-0027 vars → `--var` (only when set), always `JURISDICTION:none` (local workerd has no jurisdictions). With a test var set it starts from empty state in a temporary directory; otherwise state persists under `packages/relay/.wrangler/state`. `pnpm --filter @hnch/relay smoke <mode>` (with `BASE=`) runs `scripts/smoke.mjs` against any relay.

## Local PWA on workerd

To check `_headers` and the SPA fallback as `hnch-web` serves them, build production and serve `www` on local workerd:

```sh
pnpm --filter @hnch/shared build
pnpm --filter @hnch/client build
pnpm --filter @hnch/client exec wrangler dev --port 8788
pnpm --filter @hnch/client exec wrangler deploy --dry-run
```

`curl -sI http://localhost:8788/lobby/x` should show `200`, `text/html` and one `Cache-Control: no-cache, must-revalidate`. `pnpm dev:client` (the Angular dev server) does not apply `_headers`.

## Free-plan budget and alerts

Everything runs on the Workers Free plan. Its limits are **per account**, daily, and reset at 00:00 UTC; the account's other Workers draw from the same budget. Reference session: 8 peers for 1 h, 20 rounds, about 300 doc updates. Usage at the switch was about 0. Assumed, not verified (ADR-0051): inbound WebSocket messages count 1:1 against the request limits, and static asset requests are free without `run_worker_first`.

| Daily limit (Free) | Per reference session | Fits per day | Notes |
|---|---|---|---|
| DO duration 13,000 GB-s (128 MB billed per awake DO) | 450 GB-s | **≈ 29 occupied room-hours (binding)** | With 2 or more visible peers the DO never hibernates (inferred). One room with two unthrottled tabs open all day uses about 83 % of the daily budget. |
| DO requests 100k | ≈ 2,300 | ≈ 43 sessions | Hidden-tab reconnect churn adds about 240 per hidden peer-hour; the 04:00 UTC sweep adds about 30 a day, plus one per listed room it checks and one per room it moves. |
| Rows written 100k | ≈ 200 | ≈ 500 sessions | Coalescing caps a room at 12 flushes per minute or fewer. |
| Rows read 5M | ≈ 750 | ≈ 6,600 sessions | Lazy doc load keeps this low. |
| Storage 5 GB per account, 1 GB per DO | KBs (stress room: 1 MB) | n/a | Not binding at expected size. |
| Workers requests 100k | ≈ 30 | ≈ 3,000 sessions | Static assets are assumed free (no `run_worker_first`). |
| Workers Logs 200k events, 3-day retention (0.5 GB and 7 days from 2026-12-01) | small | n/a | Hitting it stops logging, not the relay. |

- **Duration is the binding limit.** No usage gate exists; growth is checked by hand (below).
- **Abuse exposure (stated, not mitigated; owner accepted, Free plan only):** anyone can take the relay down until 00:00 UTC by holding about 29 rooms open for an hour, sending about 100k cheap requests, or spamming room creation. The rate-limit rule only slows one IP down. Past a limit there is no fallback host. One bound is in the relay: a room holds at most 64 refused sockets (wrong password, room full) whose clients never answer the close; past that a refusal is a plain `503` with `Retry-After`, so a flood can't fill the Durable Object's WebSocket limit for legitimate joins (#566).
- **Route fail mode at the Workers request limit: unverified.** On Free, each route either fails open (requests bypass the Worker and go to the origin) or fails closed (error `1027`) once the account's 100k requests are used, and the docs don't say which is the default. Not recorded yet. With the placeholder origin, fail open should end in a Cloudflare origin error rather than another backend (inferred), so either way the relay is down until 00:00 UTC. Read it in the dashboard (Workers Routes) and record it here.
- **No usage alerts.** Free has no Workers or Durable Objects usage alerts (the usage alert type needs Pro and pay-as-you-go), so nothing warns before a daily limit. Check usage by hand in the dashboard.
- **Account alerts on, by email:** Universal SSL, HTTP DDoS attack, Trust & Safety block, abuse report, major or critical incidents on Workers, Durable Objects or Workers Assets, and Workers real-time issues.

## Day-2 operations

- **Relay logs:** Workers Logs in the Cloudflare dashboard (`hnch-relay` › Observability). Invocation logs are off, so only the relay's own content-free `console` lines appear (event names, error classes; never a room UUID, code or URL).
- **Don't tail production, and don't add rules on `/ws/*`.** WebSocket URLs carry the room password hash as `?pw=`. `wrangler tail` and the dashboard's real-time logs show request URLs whatever `invocation_logs` says, and a WAF or rate-limit rule matching `/ws/*` would record the full URI in Security Events.
- **Relay deployments:** `pnpm --filter @hnch/relay exec wrangler deployments list`.
- **PWA deployments:** `pnpm --filter @hnch/client exec wrangler deployments list`. `hnch-web` runs no Worker code, so it has no logs.
- **Usage:** checked by hand in the dashboard; see [Free-plan budget and alerts](#free-plan-budget-and-alerts).
- **VPS:** gone ([ADR-0054](../adr/0054-vps-decommission.md)). Still open on the owner's side: before cancelling the IONOS contract, check that the `hnch.dev` registration isn't bundled with it.

## Known limitations

- **Deploys still drop sockets.** A relay deploy closes a busy room's sockets once (`1006`), 3–5 min after the deploy; clients resync in about 0.4 s (ADR-0025, ADR-0050).
- **Shared daily caps.** Free-plan limits are per account (ADR-0051); hitting one takes the relay down until 00:00 UTC, with no fallback host.
- **No metrics or alerting.** `GET /health` is shallow (`{status, version}`).
- **Single domain.** No staging environment.

## Out of scope (future work)

- Observability: structured metrics, alerting.
