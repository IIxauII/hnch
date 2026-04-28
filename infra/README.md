# infra/ — VPS provisioning + reverse proxy

Configuration that lives on the VPS, checked into the repo so a fresh box can be brought back online deterministically. See [ADR-0029](../adr/0029-relay-deployment.md) for the architecture decision and rationale.

| File | Where it lives on the VPS | Purpose |
|---|---|---|
| `bootstrap-vps.sh` | n/a (run once as root) | Idempotent provisioner: installs Node 22 + Caddy + UFW, creates `deploy` user, drops the systemd unit and Caddyfile in place, enables services. |
| `hnch-relay.service` | `/etc/systemd/system/hnch-relay.service` | systemd unit that supervises the relay process. |
| `Caddyfile` | `/etc/caddy/Caddyfile` | Caddy config — single-origin routing for `hnch.dev`, auto-TLS via Let's Encrypt. |
| `deploy.pub` | seeded into `/home/deploy/.ssh/authorized_keys` by the bootstrap script | Public half of the CI deploy keypair. The private half lives only in the GH Actions secret `VPS_SSH_KEY`. Safe to commit (public keys are not secrets). |

## First-time bootstrap

Prerequisites:

1. VPS reachable over SSH as `xau` (already configured — see `~/.ssh/config` host `hnch-vps`).
2. DNS A record `hnch.dev` → VPS IP set in the IONOS DNS panel. Without this, Caddy cannot fetch a Let's Encrypt cert.
3. CI deploy keypair generated and `infra/deploy.pub` committed. See **Generating the deploy key** below.

Steps:

```sh
# from your laptop
scp infra/bootstrap-vps.sh infra/Caddyfile infra/hnch-relay.service infra/deploy.pub hnch-vps:/tmp/
ssh hnch-vps
sudo mkdir -p /opt/hnch-bootstrap
sudo mv /tmp/{bootstrap-vps.sh,Caddyfile,hnch-relay.service,deploy.pub} /opt/hnch-bootstrap/
sudo bash /opt/hnch-bootstrap/bootstrap-vps.sh
```

Verification:

```sh
# on the VPS
systemctl status caddy        # active (running)
systemctl status hnch-relay   # enabled but inactive (dead) — expected, no binary yet
ufw status                    # 22, 80, 443 allowed
sudo -u deploy whoami         # deploy

# from your laptop
dig +short hnch.dev           # → VPS IP
curl -I https://hnch.dev/health  # 502 + valid Let's Encrypt cert  → Caddy + TLS healthy
```

After bootstrap, semantic-release mints `relay-vX.Y.Z` tags on merge to `main` and explicitly dispatches `deploy-relay.yml` via its `publishCmd` (`gh workflow run`). The deploy workflow takes over from there.

## Generating the deploy key

Run once on your laptop:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/hnch_deploy_ed25519 -C 'hnch CI deploy key' -N ''
cp ~/.ssh/hnch_deploy_ed25519.pub infra/deploy.pub
gh secret set VPS_SSH_KEY < ~/.ssh/hnch_deploy_ed25519
gh secret set VPS_HOST --body '217.154.170.228'   # or 'hnch.dev' once DNS is live
gh secret set VPS_USER --body 'deploy'
```

The private key never leaves the keypair file → GH secret. Do not commit it. The public half (`infra/deploy.pub`) is committed and is what the bootstrap script seeds into `~deploy/.ssh/authorized_keys`.

## Deploy flow

1. Merge to `main` with a `feat(relay):` / `fix(relay):` commit.
2. `release.yml` runs semantic-release per package; if relay scope changed, it cuts tag `relay-vX.Y.Z`.
3. After pushing the tag, semantic-release's `publishCmd` (`packages/relay/.releaserc.json`) runs `gh workflow run deploy-relay.yml --ref relay-vX.Y.Z` — explicitly dispatches the deploy workflow. Tag-push events from PATs are not reliably delivered to other workflows, so dispatch is explicit.
4. Build job: `pnpm install --frozen-lockfile`, `pnpm --filter @hnch/relay build`, bundle `dist/` + `package.json` + production `node_modules` into a tarball.
5. Deploy job: `scp` tarball to VPS, extract into a timestamped directory under `/opt/hnch-relay-releases/`, swap the `/opt/hnch-relay` symlink, `sudo systemctl restart hnch-relay`.
6. Smoke: `curl -fsS https://hnch.dev/health` from CI; non-200 fails the job.

## Rollback

The deploy script keeps the last 3 release directories under `/opt/hnch-relay/releases/`:

```sh
ssh hnch-vps
ls -1 /opt/hnch-relay/releases/   # release-2026-04-27T12-00-00Z, release-2026-04-26T08-15-00Z, ...
ln -sfn /opt/hnch-relay/releases/release-2026-04-26T08-15-00Z /opt/hnch-relay/current   # as deploy user
sudo systemctl restart hnch-relay
curl -fsS https://hnch.dev/health
```

If a bad release got tagged via semantic-release, also revert the offending commit on `main` so the next deploy doesn't re-publish the broken artifact.

## Nuke and pave

If the VPS is destroyed or you migrate to a new one:

1. Provision a fresh Debian/Ubuntu box with SSH access for `xau`.
2. Update `~/.ssh/config` host `hnch-vps` to point at the new IP.
3. Update IONOS DNS A record `hnch.dev` → new IP. Wait for propagation (`dig +short hnch.dev`).
4. Update GH secret `VPS_HOST` if you used the IP variant: `gh secret set VPS_HOST --body '<new-ip>'`.
5. Run the bootstrap script (above).
6. Push a no-op commit with `chore(relay): redeploy` (or re-run the most recent `deploy-relay.yml` from the GH Actions UI).

The deploy public key in `infra/deploy.pub` keeps working unchanged — the bootstrap re-seeds it on the new box.

## PWA static host

The Angular/Ionic client is served from the same Caddy instance as the relay, on the same origin (`hnch.dev`). Per ADR-0029's single-origin commitment, this avoids CORS, mixed-origin cookie quirks, and split certs.

### Layout

```
/var/www/
  hnch-client            -> hnch-client-releases/release-<STAMP>   # symlink
  hnch-client-releases/
    release-2026-04-28T12-00-00Z/   # rsynced contents of packages/client/www
    release-2026-04-29T...
    ...                              # last 3 kept, older pruned by deploy job
```

Caddy's `root * /var/www/hnch-client` (see `Caddyfile`) follows the symlink at request time, so swapping it is the entire activation step. No `caddy reload`, no `systemctl restart` — `ln -sfn` is `rename(2)`-equivalent on Linux and atomic.

The bootstrap script provisions the layout idempotently and migrates an existing real `/var/www/hnch-client` directory into `release-bootstrap` if it finds one, so first-run is safe on a box that previously hosted static content directly.

### Deploy flow

1. Merge to `main` with a `feat(client):` / `fix(client):` commit.
2. `release.yml` runs semantic-release per package; if client scope changed, it cuts tag `client-vX.Y.Z`.
3. After pushing the tag, semantic-release's `publishCmd` (`packages/client/.releaserc.json`) runs `gh workflow run deploy-client.yml --ref client-vX.Y.Z` — explicit dispatch (see relay flow note above).

> **Note:** tags `client-v1.0.0`, `client-v1.1.0`, and `client-v1.1.1` predate the explicit-dispatch wiring and were never deployed. The next dispatched release supersedes them — no retroactive deploy is needed.
4. Build job: `pnpm install --frozen-lockfile`, build `@hnch/shared` then `@hnch/client` in production mode, post-build hygiene checks (no source maps, size sanity), tar `packages/client/www` into `hnch-client-<STAMP>.tar.gz`.
5. Deploy job: `scp` tarball to VPS, extract into `/var/www/hnch-client-releases/release-<STAMP>/`, swap the `/var/www/hnch-client` symlink, prune to last 3 releases.
6. Smoke: `curl -fsS https://hnch.dev/` from CI; the response must contain `<app-root` or the job fails.

No Caddy reload at any step — the symlink swap is the activation.

### Cache rules

The Caddyfile static handler distinguishes hashed assets from the SPA shell:

- **Hashed assets** (Angular `outputHashing=all` produces names like `main.4a8f2c1b.js`) match `\.[a-f0-9]{8,}\.(js|css|woff2|woff|ttf|svg|png|jpg|webp|avif)$` and get `Cache-Control: public, max-age=31536000, immutable`.
- **HTML and the bare root** match `*.html` / `/` and get `Cache-Control: no-cache, must-revalidate`, so the SPA shell always re-validates and a deploy is visible to clients on next navigation.

Verify after a deploy:

```sh
curl -I https://hnch.dev/                                 # → no-cache, must-revalidate
curl -I https://hnch.dev/main.<somehash>.js               # → max-age=31536000, immutable
```

### Rollback

Releases live under `/var/www/hnch-client-releases/`; the deploy job keeps the last 3. To revert, swap the symlink back to a prior release:

```sh
ssh deploy@hnch.dev
ls -1dt /var/www/hnch-client-releases/release-*           # list available releases, newest first
ln -sfn /var/www/hnch-client-releases/release-<prior-stamp> /var/www/hnch-client
```

One command, no restart, no Caddy reload. The next request to `hnch.dev/` resolves the symlink to the prior release.

If a bad release got tagged via semantic-release, also revert the offending commit on `main` so the next deploy doesn't re-publish the broken artifact.

### Service worker / installable PWA — deferred

v1 ships as a plain SPA. There is no service worker, no offline shell, and no `manifest.json`-driven install prompt. This is a deliberate scope cut: SW invalidation interacts non-trivially with cache-control and atomic swaps, and at v1 traffic the offline story is not yet a felt need. We will revisit if user feedback demands it — at which point the cache headers above and the symlink-swap mechanism will need a re-read against the SW lifecycle.

## Operational notes

- **Memory ceiling.** The systemd unit sets `MemoryMax=700M`. If the relay is OOM-killed, raise the limit and investigate connection counts via `journalctl -u hnch-relay`.
- **Caddy logs.** `journalctl -u caddy -f`. JSON-formatted (see `Caddyfile`); pipe through `jq` for filtering.
- **Relay logs.** `journalctl -u hnch-relay -f`.
- **Cert renewal.** Caddy handles this automatically. Verify with `caddy environ` on the VPS or check `/var/lib/caddy/.local/share/caddy/certificates/`.
- **No abuse mitigation.** Per ADR-0029, rate limiting / IP throttling is deferred. If traffic warrants, add a `rate_limit` directive in the Caddyfile and write a follow-up ADR.
