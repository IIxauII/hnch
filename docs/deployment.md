# Deployment

Production deployment for hnch. See [ADR-0029](../adr/0029-relay-deployment.md) for the architecture rationale and [`infra/README.md`](../infra/README.md) for the operational runbook (bootstrap, rollback, nuke-and-pave).

## Topology

| Surface | Where it lives | How it gets there |
|---|---|---|
| Relay (`@hnch/relay`) | `hnch-vps` (IONOS, Debian) | `deploy-relay.yml` workflow on `relay-v*` tags → tarball over SSH → systemd unit |
| PWA static (`@hnch/client`) | same VPS, `/var/www/hnch-client` | `deploy-client.yml` workflow on `client-v*` tags → rsync → atomic symlink swap |
| CLI (`@xauyxau/hnch`) | npm registry | `release.yml` runs semantic-release; `cli-v*` tags trigger npm publish via `@semantic-release/npm` (configured in `packages/cli/release.config.mjs`) |

All three surfaces speak to the same relay at `wss://hnch.dev/ws/:uuid` and `https://hnch.dev/rooms/:code`. Single origin, single Let's Encrypt cert, no CORS.

## Production URL

`https://hnch.dev` — single origin for everything.

| Path | Handled by |
|---|---|
| `GET /health` | relay (liveness probe + smoke test) |
| `POST /rooms`, `GET /rooms/:code`, `PATCH /rooms/:uuid/access` | relay (per ADR-0016 / ADR-0017) |
| `WS /ws/:uuid` | relay (y-websocket sync) |
| Everything else | static PWA, with SPA fallback to `/index.html` |

## Release-to-deploy pipeline

```
commit on main (feat(relay): / fix(relay): / etc)
        │
        ▼
release.yml — semantic-release per package, tags relay-vX.Y.Z
        │
        ▼
deploy-relay.yml — triggered on relay-v* tag push
        │
        ├── pnpm install → pnpm --filter @hnch/relay build
        ├── pnpm deploy --prod .deploy/relay     (flat, prod-only node_modules)
        ├── tar czf hnch-relay-<stamp>.tar.gz
        ├── scp → VPS:/tmp
        ├── ssh: extract under /opt/hnch-relay/releases/release-<stamp>/
        ├── ssh: ln -sfn .../release-<stamp> /opt/hnch-relay/current
        ├── ssh: sudo systemctl restart hnch-relay
        ├── ssh: prune to last 3 releases
        └── curl -fsS https://hnch.dev/health    (smoke; up to 5 attempts × 2s)
```

A failed smoke test fails the workflow but leaves the new release on disk and the symlink swapped — operator must roll back manually (see `infra/README.md`).

## Required GitHub secrets

| Secret | Value | Where used |
|---|---|---|
| `VPS_HOST` | `217.154.170.228` (or `hnch.dev` once DNS is live) | `deploy-relay.yml` SSH target |
| `VPS_USER` | `deploy` | SSH user (key-only auth, sudoers limited to `systemctl restart hnch-relay`) |
| `VPS_SSH_KEY` | ed25519 private key dedicated to CI | SSH auth; pubkey in `infra/deploy.pub` |
| `GITHUB_TOKEN` | provided by Actions automatically | semantic-release tag + release |

Set with:

```sh
gh secret set VPS_HOST --body '217.154.170.228'
gh secret set VPS_USER --body 'deploy'
gh secret set VPS_SSH_KEY < ~/.ssh/hnch_deploy_ed25519
```

## Day-2 operations

- **Tail logs:** `ssh hnch-vps 'journalctl -u hnch-relay -f'` (relay) or `journalctl -u caddy -f` (TLS, routing).
- **Check resources:** `ssh hnch-vps 'systemctl status hnch-relay'` shows RSS + CPU; `free -m` for swap pressure.
- **Manual restart:** `ssh hnch-vps 'sudo systemctl restart hnch-relay'`.
- **Rollback:** see `infra/README.md` — symlink swap to a previous `/opt/hnch-relay-releases/release-*` then restart.
- **Cert troubleshooting:** Caddy keeps state under `/var/lib/caddy/`. If TLS fails, check `journalctl -u caddy --since '1h ago' | grep -i acme`.

## Known limitations (v1)

Per ADR-0029:

- **Single instance.** ~10–30 s downtime per deploy (no blue/green on a single VPS).
- **No persistence.** Restart wipes all in-memory snapshots (consistent with ADR-0012).
- **No abuse mitigation.** Public WS endpoint has no rate limiting or IP throttling. Add Caddy `rate_limit` directives + a follow-up ADR if real traffic warrants.
- **No metrics or alerting.** Only `GET /health` is exposed. Adding Prometheus + a hosted Grafana scrape is the natural next step but is deferred.
- **Single domain.** No staging environment. To dry-run a deploy, run the workflow manually via `workflow_dispatch` against a feature branch.

## Out of scope (future work)

- Static PWA deploy job (`deploy-client.yml`) — straightforward extension once the relay path is proven.
- CLI deployment (`@hnch/cli` to npm + Homebrew tap) — resumes once a default `wss://hnch.dev` is live so the CLI can ship with a sane fallback.
- Observability: structured metrics, log shipping, alerting.
- HA / multi-region.
