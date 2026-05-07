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

1. VPS reachable over SSH as `xau` (already configured — see `~/.ssh/config` host `<vps-ssh-alias>`).
2. DNS A record `hnch.dev` → VPS IP set in the IONOS DNS panel. Without this, Caddy cannot fetch a Let's Encrypt cert.
3. CI deploy keypair generated and `infra/deploy.pub` committed. See **Generating the deploy key** below.

Steps:

```sh
# from your laptop
scp infra/bootstrap-vps.sh infra/Caddyfile infra/hnch-relay.service infra/deploy.pub <vps-ssh-alias>:/tmp/
ssh <vps-ssh-alias>
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
gh secret set VPS_HOST --body '<vps-ip>'   # or 'hnch.dev' once DNS is live
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
ssh <vps-ssh-alias>
ls -1 /opt/hnch-relay/releases/   # release-2026-04-27T12-00-00Z, release-2026-04-26T08-15-00Z, ...
ln -sfn /opt/hnch-relay/releases/release-2026-04-26T08-15-00Z /opt/hnch-relay/current   # as deploy user
sudo systemctl restart hnch-relay
curl -fsS https://hnch.dev/health
```

If a bad release got tagged via semantic-release, also revert the offending commit on `main` so the next deploy doesn't re-publish the broken artifact.

## Nuke and pave

If the VPS is destroyed or you migrate to a new one:

1. Provision a fresh Debian/Ubuntu box with SSH access for `xau`.
2. Update `~/.ssh/config` host `<vps-ssh-alias>` to point at the new IP.
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

## Self-hosted runner pool

All `ci.yml` jobs run on a pool of 4 ephemeral arm64 Podman containers on a Mac mini M4: the `verify` matrix, `e2e`, and the small support jobs (`detect-changes`, `version-audit`, `pr-title-lint`, `verify-summary`). `release.yml` and `deploy-*.yml` are next to flip per [ADR-0037](../adr/0037-self-hosted-runner-pool-covers-all-non-health-jobs.md). `runner-health.yml` stays on `ubuntu-latest` permanently — it is the dead-man's-switch that fires when the pool is dead, so it cannot run on the pool. Dependabot stays on the GitHub-managed runner.

See [ADR-0032](../adr/0032-self-hosted-github-actions-runner.md) for the original architectural rationale and [ADR-0037](../adr/0037-self-hosted-runner-pool-covers-all-non-health-jobs.md) for the scope expansion. Source plans: `plans/plan-self-hosted-runner.md` (original) and `plans/plan-runner-pool-expansion.md` (expansion — to be written when Phase 2 lands).

### Architecture

```
GitHub Actions
   │
   ▼ register/run
hnch-podman label → 4 ephemeral containers on M4
   │
   ├── built from infra/runner/Dockerfile (debian:bookworm-slim + official actions/runner tarball + Node 22 + pnpm + Playwright libs)
   ├── one job per container, --rm, EPHEMERAL=true (deregisters and exits after the job)
   ├── arm64 native, rootless top-to-bottom, --userns=keep-id
   └── supervised by infra/runner/supervisor.sh under launchd (dev.hnch.runner.plist)
```

Runners are repo-scoped and labelled `self-hosted,linux,arm64,hnch-podman`. The pool size matches the verify matrix (4 lanes: `shared`, `relay`, `client`, `cli`).

### Files

| File | Purpose |
|---|---|
| `infra/runner/Dockerfile` | Runner container image (digest-pinned base + Node 22 + pnpm + Playwright deps) |
| `infra/runner/supervisor.sh` | Pool maintainer: fetches 1-hour registration tokens on host, spawns containers, crashloop backoff |
| `infra/runner/dev.hnch.runner.plist` | LaunchAgent for the supervisor (RunAtLoad, KeepAlive, ThrottleInterval=30) |
| `infra/runner/prune.sh` | Weekly cache eviction script (per-runner pnpm stores, image prune, log truncation, disk-low alarm) |
| `infra/runner/dev.hnch.runner-prune.plist` | LaunchAgent that fires `prune.sh` Sunday 04:00 |
| `.github/workflows/runner-health.yml` | Hourly `ubuntu-latest` cron — fails if ≥1 `hnch-podman` runner is not online |

### Worktree-independent install location

The plists reference `~/.local/bin/hnch-runner-{supervisor,prune}.sh`, not the in-repo path. This is forced by macOS TCC (launchd cannot execute scripts under `~/Documents`) and has the side effect of decoupling the LaunchAgent from any specific worktree — switching branches in the primary repo or in linked worktrees does not change which script the LaunchAgent runs.

The trade-off: edits to `supervisor.sh` or `prune.sh` in the repo do not take effect until `bash infra/runner/install.sh` is re-run from the worktree containing the edits.

### One-time host setup (run on the Mac mini)

```sh
brew install podman
podman machine init --cpus 8 --memory 10240 --disk-size 80 hnch-runner
podman machine start hnch-runner

mkdir -p ~/runner-cache/{playwright,state}
for i in 1 2 3 4; do
  mkdir -p ~/runner-cache/pnpm-store-$i ~/runner-cache/work-$i
done

sudo pmset -a sleep 0 disksleep 0 displaysleep 15 womp 1 powernap 0
```

**UID-mapping smoke test** (must pass before continuing):

```sh
podman run --rm --userns=keep-id -v ~/runner-cache/pnpm-store-1:/cache \
  alpine sh -c 'touch /cache/from-container && ls -ln /cache/'
ls -ln ~/runner-cache/pnpm-store-1/from-container
touch ~/runner-cache/pnpm-store-1/from-host
podman run --rm --userns=keep-id -v ~/runner-cache/pnpm-store-1:/cache \
  alpine sh -c 'cat /cache/from-host && rm /cache/from-*'
```

If any step fails, drop `--userns=keep-id` from `supervisor.sh` and re-test with default mapping.

### Build the runner image

The Dockerfile builds from `debian:bookworm-slim` and downloads the official `actions/runner` tarball, sha256-verified at build time. Default version is pinned at the top of the Dockerfile (`RUNNER_VERSION` + `RUNNER_SHA256` ARGs). To build:

    cd ~/Documents/projects/hnch
    podman build --platform linux/arm64 -t hnch-runner:latest infra/runner/

Smoke test the image:

    podman run --rm --userns=keep-id hnch-runner:latest \
      bash -c 'which git node pnpm jq gh ssh ssh-keyscan && node --version && pnpm --version && gh --version'

Note: the entrypoint requires registration env vars (`RUNNER_NAME`, `REPO_URL`, `RUNNER_TOKEN`, `LABELS`) — `podman run` without them will exit immediately with a missing-var error. The supervisor supplies them when spawning a real runner. To smoke-test the entrypoint surface only, override it: append `--entrypoint /bin/bash` to the `podman run` above.

### Provision the PAT

Issue a **fine-grained PAT** scoped to `IIxauII/hnch` only, permission `Administration: Read and write` (required by `POST /repos/.../actions/runners/registration-token` — NOT classic `repo` scope). Store in macOS Keychain — supervisor and prune scripts both read it from there at runtime, so reboot survival is automatic.

```sh
security add-generic-password -a "$USER" -s hnch-runner-pat -w
```
(prompts twice; paste the PAT — never appears in shell history)

### Install scripts and LaunchAgents

macOS TCC blocks launchd from executing scripts under `~/Documents` (and other protected locations). The plists therefore reference `~/.local/bin/`. The install script copies the supervisor and prune scripts there and drops the plists into `~/Library/LaunchAgents/`. Idempotent — re-run safe.

```sh
bash infra/runner/install.sh
```

Then load:

```sh
launchctl load ~/Library/LaunchAgents/dev.hnch.runner.plist
launchctl load ~/Library/LaunchAgents/dev.hnch.runner-prune.plist
```

Within ~30 s, `gh api /repos/IIxauII/hnch/actions/runners | jq '.runners[].labels'` should show 4 idle runners labelled `hnch-podman`.

After editing `supervisor.sh` or `prune.sh` in the repo, re-run `bash infra/runner/install.sh` to copy the changes into `~/.local/bin/`, then `launchctl kickstart -k gui/$(id -u)/dev.hnch.runner` to force fresh containers on the next spawn cycle.

### Flip workflows over

```sh
gh variable set LINUX_RUNNER --body '["self-hosted","linux","arm64","hnch-podman"]'
```

### Rollback (instant, no PR)

```sh
gh variable set LINUX_RUNNER --body '["ubuntu-latest"]'
```

This flips every `verify` and `e2e` job back to GitHub-hosted on the next workflow run. Use for home-network outages, Mac-mini reboots, or any time the pool misbehaves.

### Bumping the runner base image

The Dockerfile pins both the runner version and the tarball sha256. Bumping is two ARG edits:

1. Look up the latest release:

       gh release view --repo actions/runner --json tagName --jq .tagName

2. Look up the arm64 sha256 from the release body:

       gh release view --repo actions/runner v<VERSION> --json body \
         --jq .body | grep -A1 "linux.*arm64"

   The sha256 is wrapped in `<!-- BEGIN SHA linux-arm64 -->...<!-- END SHA linux-arm64 -->` markers.

3. Update both ARGs in `infra/runner/Dockerfile`, rebuild, and force a fresh spawn:

       podman build --platform linux/arm64 -t hnch-runner:latest infra/runner/
       launchctl kickstart -k gui/$(id -u)/dev.hnch.runner

Bump cadence: monthly, or sooner if a security advisory is published.

There is no separate base-image bump — `debian:bookworm-slim` is intentionally pinned by tag (not digest) because it gets regular security patches and rebuilding picks them up. Inspect `podman image inspect debian:bookworm-slim` after a bump if you want to record the pulled digest for audit.

### Rotating the PAT

```sh
security add-generic-password -U -a "$USER" -s hnch-runner-pat -w
launchctl kickstart -k gui/$(id -u)/dev.hnch.runner
```
The `-U` flag updates the existing Keychain entry in place. Supervisor re-reads the PAT on next supervisor startup, so `kickstart -k` is enough — no unload/load cycle needed.

### Logs

- Supervisor stdout/stderr: `~/Library/Logs/hnch-runner.{out,err}.log`.
- Prune stdout/stderr: `~/Library/Logs/hnch-runner-prune.{out,err}.log`.
- Per-container: `podman logs <container-name>` (containers are named `hnch-runner-<idx>-<epoch>`).

### Cache poisoning runbook

If a job leaves a corrupted pnpm store or Playwright browser cache:

```sh
launchctl unload ~/Library/LaunchAgents/dev.hnch.runner.plist
podman ps -q --filter name=hnch-runner- | xargs -r podman rm -f
rm -rf ~/runner-cache/pnpm-store-* ~/runner-cache/playwright
mkdir -p ~/runner-cache/playwright
for i in 1 2 3 4; do mkdir -p ~/runner-cache/pnpm-store-$i; done
launchctl load ~/Library/LaunchAgents/dev.hnch.runner.plist
```

The supervisor reseeds caches lazily on the next job per runner.

### Pre-Phase-9 RAM gate

Before adding a Tart-based macOS runner (Phase 9, gated on Phase 6b iOS), measure 4-day p95 committed RAM with the four-runner pool steady-state. The M4's RAM is **soldered**; if p95 > 10 GB, order a higher-RAM mini *before* starting Tart work.

```sh
# crontab -e
* * * * * vm_stat | awk '/Pages active/{a=$3+0}/Pages wired/{w=$4+0} END {printf "%d %d\n", systime(), (a+w)*4/1024}' >> ~/ram.log
# After 4 days:
awk '{p[NR]=$2} END {n=asort(p); print "p95 MB =", p[int(n*0.95)]}' ~/ram.log
```

Record the result here for posterity:

| Date | p95 (MB) | Decision |
|---|---|---|
| (pending first measurement) | | |

### Health check

`.github/workflows/runner-health.yml` runs hourly on `ubuntu-latest` (~24 min/mo billable). It calls `gh api /repos/.../actions/runners` and fails if zero runners with the `hnch-podman` label are online. Failure → GitHub email notification. Manual trigger: `gh workflow run runner-health.yml`.

The workflow needs `Administration: read` to list runners. The default `GITHUB_TOKEN` cannot be granted that scope (GitHub caps `GITHUB_TOKEN` permissions and the `permissions:` block cannot escalate beyond the cap). Therefore the workflow uses a separate fine-grained PAT stored as the repo secret `RUNNER_HEALTH_PAT`. If the secret is missing, the workflow logs a warning and exits 0 — never fails the run, never spams email.

**Setup:**

1. Create a second fine-grained PAT (separate from the supervisor's runner-registration PAT, which has `Administration: read+write` — this one only needs read):
   - Resource owner: your account
   - Repository access: only `IIxauII/hnch`
   - Permissions: **Administration: Read-only**
   - Expiration: 90 days (calendar-reminder rotation)
2. Store as repo secret:
   ```sh
   gh secret set RUNNER_HEALTH_PAT --body 'github_pat_...'
   ```
3. Trigger once to verify: `gh workflow run runner-health.yml`. Should pass within a minute.

**Rotation:**

```sh
gh secret set RUNNER_HEALTH_PAT --body 'github_pat_<new-token>'
```

No workflow change required.
