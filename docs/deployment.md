# Deployment

Production deployment for hnch. hnch.dev is moving from the IONOS VPS to Cloudflare ([ADR-0051](../adr/0051-cloudflare-hosting.md), plan [`docs/plans/cloudflare-hosting.md`](plans/cloudflare-hosting.md)). Until the switch (Phase 3) the VPS still serves `hnch.dev`; see [ADR-0029](../adr/0029-relay-deployment.md) and [`infra/README.md`](../infra/README.md) for it.

## Topology

| Surface | Where it lives | How it gets there |
|---|---|---|
| Relay (`@hnch/relay`) | Cloudflare Worker `hnch-relay` + Durable Objects (EU), on routes `hnch.dev/health*`, `/rooms*`, `/ws/*` | `deploy-relay.yml` on `relay-v*` tags → `wrangler deploy` |
| Relay, until the switch | `hnch-vps` (IONOS), relay frozen at `relay-v1.2.1` | no longer deployed |
| PWA static (`@hnch/client`) | same VPS, `/var/www/hnch-client` | `deploy-client.yml` workflow on `client-v*` tags → rsync → atomic symlink swap |
| CLI (`@xauyxau/hnch`) | npm registry | `release.yml` runs semantic-release; `cli-v*` tags trigger npm publish via `@semantic-release/npm` (configured in `packages/cli/release.config.mjs`) |

All three surfaces speak to the same relay at `wss://hnch.dev/ws/:uuid` and `https://hnch.dev/rooms/:code`. Single origin, no CORS.

**Routes are inert until the switch.** Workers routes only run on proxied hostnames, and the `hnch.dev` apex stays DNS-only (pointing at the VPS) until Phase 3. So `hnch-relay` deploys with its routes from the first release, and `https://hnch.dev/health` keeps answering from the VPS (`1.2.1`) until the apex records are proxied.

## Production URL

`https://hnch.dev` — single origin for everything.

| Path | Handled by |
|---|---|
| `GET /health` | relay (liveness probe + smoke test) |
| `POST /rooms`, `GET /rooms/:code`, `PATCH /rooms/:uuid/access` | relay (per ADR-0016 / ADR-0017) |
| `WS /ws/:uuid` | relay (y-websocket sync) |
| Everything else | static PWA, with SPA fallback to `/index.html` |

## Relay release-to-deploy pipeline

```
commit on main (feat(relay): / fix(relay): / etc)
        │
        ▼
release.yml — semantic-release per package, tags relay-vX.Y.Z
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
- **Rollback is `wrangler rollback`.** Never re-dispatch an old tag: the guard refuses a version older than the live one. Roll back from a machine with the deploy token:

  ```sh
  pnpm --filter @hnch/relay exec wrangler deployments list
  pnpm --filter @hnch/relay exec wrangler rollback <version-id> --message "<why>"
  ```

- **Smokes after the switch** retry `/health` for up to 60 s, since old code may still answer.

## Required GitHub secrets and variables

| Name | Kind | Value | Where used |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | token `hnch-ci-deploy` (below) | `deploy-relay.yml` only |
| `CLOUDFLARE_ACCOUNT_ID` | secret | the Cloudflare account ID | `deploy-relay.yml` only |
| `HNCH_LIVE` | variable | `false` until the switch, then `true` | gates the hnch.dev smoke |
| `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` | secret | VPS SSH target, user, CI key | `deploy-client.yml` (the VPS PWA ship) |
| `GITHUB_TOKEN` | provided by Actions | | semantic-release tag + release |

**Token scope (`hnch-ci-deploy`):** Account › Workers Admin (formerly Workers Scripts: Edit; account-wide, so it also covers the account's other Workers) and Zone `hnch.dev` › Workers Routes: Write. No DNS permission and no Zone: Read, which is why every route in `wrangler.jsonc` carries `zone_id`. If a deploy fails with an authentication error, add the missing permission to the token in the dashboard (tokens can be edited in place). The token is a repo secret (no environment secrets on GitHub Free private repos), referenced only by the deploy job, and is the runner pool's only long-lived deploy credential. Fork PRs get no secrets.

Set with:

```sh
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh variable set HNCH_LIVE --body false
```

## Local relay

`pnpm dev:relay` (or `pnpm --filter @hnch/relay dev`) runs the Worker on local workerd through `packages/relay/scripts/dev.mjs`: `PORT` → `--port`, the ADR-0027 vars → `--var` (only when set), always `JURISDICTION:none` (local workerd has no jurisdictions). With a test var set it starts from empty state in a temporary directory; otherwise state persists under `packages/relay/.wrangler/state`. `pnpm --filter @hnch/relay smoke <mode>` (with `BASE=`) runs `scripts/smoke.mjs` against any relay.

## Day-2 operations

- **Relay logs:** Workers Logs in the Cloudflare dashboard (`hnch-relay` › Observability). Invocation logs are off, so only the relay's own content-free `console` lines appear (event names, error classes; never a room UUID, code or URL).
- **Don't tail production, and don't add rules on `/ws/*`.** WebSocket URLs carry the room password hash as `?pw=`. `wrangler tail` and the dashboard's real-time logs show request URLs whatever `invocation_logs` says, and a WAF or rate-limit rule matching `/ws/*` would record the full URI in Security Events.
- **Relay deployments:** `pnpm --filter @hnch/relay exec wrangler deployments list`.
- **VPS (PWA, and the frozen relay until the switch):** `ssh hnch-vps 'journalctl -u caddy -f'` (TLS, routing); rollback of the PWA per `infra/README.md`.
- **Cert troubleshooting (VPS):** Caddy keeps state under `/var/lib/caddy/`. If TLS fails, check `journalctl -u caddy --since '1h ago' | grep -i acme`.

## Known limitations

- **Deploys still drop sockets.** A relay deploy closes a busy room's sockets once (`1006`), 3–5 min after the deploy; clients resync in about 0.4 s (ADR-0025, ADR-0050).
- **Shared daily caps.** Free-plan limits are per account (ADR-0051); hitting one takes the relay down until 00:00 UTC.
- **No metrics or alerting.** `GET /health` is shallow (`{status, version}`).
- **Single domain.** No staging environment.

## Out of scope (future work)

- Observability: structured metrics, alerting.
- Decommissioning the VPS (owner decision, 2026-10-28).
