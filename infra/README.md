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

After bootstrap, push a `relay-vX.Y.Z` tag (semantic-release will mint these on merge to `main` once the relay's `.releaserc.json` lands). The `deploy-relay.yml` workflow takes over from there.

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
3. `deploy-relay.yml` triggers on `relay-v*` tag push.
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

## Operational notes

- **Memory ceiling.** The systemd unit sets `MemoryMax=700M`. If the relay is OOM-killed, raise the limit and investigate connection counts via `journalctl -u hnch-relay`.
- **Caddy logs.** `journalctl -u caddy -f`. JSON-formatted (see `Caddyfile`); pipe through `jq` for filtering.
- **Relay logs.** `journalctl -u hnch-relay -f`.
- **Cert renewal.** Caddy handles this automatically. Verify with `caddy environ` on the VPS or check `/var/lib/caddy/.local/share/caddy/certificates/`.
- **No abuse mitigation.** Per ADR-0029, rate limiting / IP throttling is deferred. If traffic warrants, add a `rate_limit` directive in the Caddyfile and write a follow-up ADR.
