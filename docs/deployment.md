# Deployment

Production deployment for hnch: Cloudflare Workers and Durable Objects ([ADR-0051](../adr/0051-cloudflare-hosting.md), plan [`docs/plans/cloudflare-hosting.md`](plans/cloudflare-hosting.md)). Until the switch (Phase 3, #549) `hnch.dev` still resolves to the IONOS VPS, which gets no deploys and serves a frozen build; after the switch it is shut down ([ADR-0054](../adr/0054-vps-decommission.md)).

## Topology

| Surface | Where it lives | How it gets there |
|---|---|---|
| Relay (`@hnch/relay`) | Cloudflare Worker `hnch-relay` + Durable Objects (EU), on routes `hnch.dev/health*`, `/rooms*`, `/ws/*` | `deploy-relay.yml` on `relay-v*` tags → `wrangler deploy` |
| Relay, until the switch | `<vps-ssh-alias>` (IONOS), relay frozen at `relay-v1.2.1` | no longer deployed |
| PWA static (`@hnch/client`) | Cloudflare Worker `hnch-web` (Workers Static Assets, assets-only), on route `hnch.dev/*` | `deploy-client.yml` on `client-v*` tags → `wrangler deploy` |
| PWA static, until the switch | same VPS, PWA frozen at `client-v1.46.0` | no longer deployed (ADR-0054) |
| CLI (`@xauyxau/hnch`) | npm registry | `release.yml` runs semantic-release; `cli-v*` tags trigger npm publish via `@semantic-release/npm` (configured in `packages/cli/release.config.mjs`) |

All three surfaces speak to the same relay at `wss://hnch.dev/ws/:uuid` and `https://hnch.dev/rooms/:code`. Single origin, no CORS.

**Routes are inert until the switch.** Workers routes only run on proxied hostnames, and the `hnch.dev` apex stays DNS-only (pointing at the VPS) until Phase 3. So `hnch-relay` and `hnch-web` deploy with their routes from the first release, and `https://hnch.dev` keeps answering from the VPS (relay `1.2.1`, PWA as last shipped) until the apex records are proxied. The relay's routes are more specific than `hnch.dev/*`, so they win over `hnch-web`'s.

## Production URL

`https://hnch.dev` — single origin for everything.

| Path | Handled by |
|---|---|
| `GET /health` | relay (liveness probe + smoke test) |
| `POST /rooms`, `GET /rooms/:code`, `PATCH /rooms/:uuid/access` | relay (per ADR-0016 / ADR-0017) |
| `WS /ws/:uuid` | relay (y-websocket sync) |
| Everything else | static PWA, with SPA fallback to `/index.html` |

## Release gate

A red `main` releases and so deploys nothing. `release.yml` starts only from a green `ci.yml` push run on `main` (a `workflow_run` trigger) and releases the commit that run tested. A red or cancelled merge releases with the next green run; a green run whose commit `main` has already moved past (a newer merge) releases nothing and leaves it to that merge's run. The deploys below are dispatched only by a release, so they inherit the gate. Details and recovery: [CONTRIBUTING.md › When a release runs](../CONTRIBUTING.md#when-a-release-runs). A manual `deploy-*.yml` dispatch bypasses it.

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
        ├── cold pnpm install from a fresh store (not the /cache snapshots or
        │   store PR CI can write) → build @hnch/shared (bundled into the Worker)
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
- **Cold installs.** The `build` and `web` jobs don't use the runner pool's shared caches (the pnpm store and `node_modules` snapshots under `/cache`), which PR CI can write. Each runs `pnpm install --frozen-lockfile --ignore-scripts --store-dir "${RUNNER_TEMP}/pnpm-store"` into a fresh store, so pnpm checks every package against the lockfile; `build` filters to `@hnch/client...`, `web` to `@hnch/client` (pnpm still installs the workspace root's packages). Node is the runner image's, and pnpm's version comes from `packageManager` through Corepack.
- **A client release never touches the relay.** In G0 (2026-10-28) relay sockets held for 300 s across a web redeploy with 0 closes.
- **Rollback.** `wrangler rollback` (instant, no rebuild; `hnch-web` has no Durable Objects). A dispatch of an older `client-v*` tag also works, but only for a tag cut after [ADR-0054](../adr/0054-vps-decommission.md). **Never re-dispatch a pre-ADR-0054 tag (≤ `client-v1.46.0`):** a dispatch runs the workflow at that tag, which ships only to the VPS. With the `VPS_*` secrets deleted it fails at its SSH step, and it never reaches `hnch-web`.

  ```sh
  pnpm --filter @hnch/client exec wrangler deployments list
  pnpm --filter @hnch/client exec wrangler rollback <version-id> --message "<why>"
  ```

## Required GitHub secrets and variables

| Name | Kind | Value | Where used |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | token `hnch-ci-deploy` (below) | `deploy-relay.yml` and the `web` job of `deploy-client.yml` only |
| `CLOUDFLARE_ACCOUNT_ID` | secret | the Cloudflare account ID | `deploy-relay.yml` and the `web` job of `deploy-client.yml` only |
| `HNCH_LIVE` | variable | `false` until the switch, then `true` | gates the hnch.dev smokes of both deploys |
| `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` | secret | VPS SSH target, user, CI key | nothing; deleted when ADR-0054 merged, so an old-tag dispatch fails instead of deploying to the VPS |
| `RELEASE_TOKEN` | secret | fine-grained PAT (also needs actions: write, for the deploy dispatch) | `release.yml`: semantic-release's release commits, tags and GitHub Releases, and the `gh workflow run deploy-*.yml` dispatch |

**Token scope (`hnch-ci-deploy`):** Account › Workers Admin (formerly Workers Scripts: Edit; account-wide, so it also covers the account's other Workers, and lets the first deploy create `hnch-web`) and Zone `hnch.dev` › Workers Routes: Write. No DNS permission and no Zone: Read, which is why every route in `wrangler.jsonc` carries `zone_id`. If a deploy fails with an authentication error, add the missing permission to the token in the dashboard (tokens can be edited in place). The token is a repo secret (no environment secrets on GitHub Free private repos), referenced only by the two deploy jobs, and is the runner pool's only long-lived deploy credential. Fork PRs get no secrets.

Set with:

```sh
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh variable set HNCH_LIVE --body false
```

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

## Day-2 operations

- **Relay logs:** Workers Logs in the Cloudflare dashboard (`hnch-relay` › Observability). Invocation logs are off, so only the relay's own content-free `console` lines appear (event names, error classes; never a room UUID, code or URL).
- **Don't tail production, and don't add rules on `/ws/*`.** WebSocket URLs carry the room password hash as `?pw=`. `wrangler tail` and the dashboard's real-time logs show request URLs whatever `invocation_logs` says, and a WAF or rate-limit rule matching `/ws/*` would record the full URI in Security Events.
- **Relay deployments:** `pnpm --filter @hnch/relay exec wrangler deployments list`.
- **PWA deployments:** `pnpm --filter @hnch/client exec wrangler deployments list`. `hnch-web` runs no Worker code, so it has no logs.
- **VPS until the switch:** frozen (PWA `client-v1.46.0`, relay `1.2.1`) and never deployed to. A fix reaches users only through the switch. It still runs production:
  - relay: `ssh <vps-ssh-alias> 'journalctl -u hnch-relay -f'`; restart with `ssh <vps-ssh-alias> 'sudo systemctl restart hnch-relay'` (drops every room, RAM only). The unit sets `MemoryMax=700M`; if the relay is OOM-killed, check connection counts in the journal.
  - Caddy (TLS, routing): `ssh <vps-ssh-alias> 'journalctl -u caddy -f'`; cert issues: `journalctl -u caddy --since '1h ago' | grep -i acme`, certs under `/var/lib/caddy/.local/share/caddy/certificates/`.
- **VPS after the switch:** decommissioned per the post-switch checklist in the plan's [Phase 3](plans/cloudflare-hosting.md#phase-3-cutover-owner-switch--docs-pr) ([ADR-0054](../adr/0054-vps-decommission.md)).

## Known limitations

- **Deploys still drop sockets.** A relay deploy closes a busy room's sockets once (`1006`), 3–5 min after the deploy; clients resync in about 0.4 s (ADR-0025, ADR-0050).
- **Shared daily caps.** Free-plan limits are per account (ADR-0051); hitting one takes the relay down until 00:00 UTC.
- **No metrics or alerting.** `GET /health` is shallow (`{status, version}`).
- **Single domain.** No staging environment.

## Out of scope (future work)

- Observability: structured metrics, alerting.
