# Plan: PWA static deploy to VPS (single-origin co-host with relay)

**Status:** Draft, awaiting implementation
**Date:** 2026-04-28
**Scope:** Ship the Angular/Ionic PWA build to the same VPS as the relay, served by the existing Caddy instance from `/var/www/hnch-client`. Conventional-commit-driven via `client-v*` tags.

## Context

ADR-0029 already endorses single-origin layout: relay + PWA on the same VPS, fronted by one Caddy instance, both under `hnch.dev`. Caddy is already configured to route `/health`, `/rooms*`, `/ws*` to the relay on `127.0.0.1:1234` and serve everything else from `/var/www/hnch-client` with SPA fallback (`infra/Caddyfile:24-36`). The static-host wiring on the VPS exists; the missing pieces are: (a) build pipeline, (b) atomic-swap layout, (c) prod-env URL fix, (d) bundle-hygiene gates.

No new ADR required — this is execution of an existing decision. ADR-0029 status note + `infra/README.md` will be updated to record the realized state.

## Decisions captured

- **Domain:** `hnch.dev` (Caddy site block already provisions Let's Encrypt cert).
- **Service worker / installable PWA:** out of scope for v1. Plain SPA only. Document the deferral; revisit when offline behavior becomes a felt need. Avoids SW-invalidation complexity on first deploy.
- **Atomic swap mechanism:** symlink swap, mirroring `deploy-relay.yml`. Caddy's `root` directive follows symlinks; rollback is `ln -sfn <prior-release> /var/www/hnch-client`.
- **VPS deploy user:** reuse `deploy` (relay's user). `bootstrap-vps.sh` updated to pre-create the new layout.
- **Trigger:** conventional-commit-driven only. `release.yml` cuts `client-vX.Y.Z` tag → `deploy-client.yml` fires on tag push. `workflow_dispatch` retained as escape hatch for re-deploy / hotfix replay only.
- **Concurrency:** separate `deploy-client` group; safe to run alongside `deploy-relay`.

## VPS layout

```
/var/www/
  hnch-client -> hnch-client-releases/release-<STAMP>   # symlink, atomic swap target
  hnch-client-releases/
    release-2026-04-28T12-00-00Z/   # rsynced www/ contents
    release-2026-04-29T...           # last 3 kept, older pruned
```

Caddy `root * /var/www/hnch-client` (already in Caddyfile) — no Caddy change needed for path. **However**, Caddyfile gets new cache-control rules (see Phase 3).

## Phase breakdown

### Phase 1 — Client build hygiene (packages/client + shared)

**Goal:** Production build is small, source-map-free, and free of dev artifacts.

1. **Fix `packages/client/src/environments/environment.prod.ts`**
   - `relayHttpUrl: 'https://hnch.dev'`
   - `relayWsUrl: 'wss://hnch.dev'`
   - `appBaseUrl: 'https://hnch.dev'` (was `hnch.app` — stale, not owned)
   - Keep `appVersion` synced via existing release tooling (semantic-release writes `package.json` version; if `appVersion` is read from `package.json` already, leave as-is; else add a build-time replacement).

2. **Tighten `angular.json` budgets** (`packages/client/angular.json:42-50`)
   - Run `pnpm --filter @hnch/client run build` once on a clean checkout, record actual sizes, then set:
     - `initial`: warn `600kb`, error `1mb` (gzipped baseline; tune to actual + 20%).
     - `anyComponentStyle`: keep current (2kb / 4kb).
   - Do **not** set budgets blind. Measure first.

3. **Confirm prod build defaults** (audit, no change expected)
   - `optimization: true` (default on prod) ✓
   - `sourceMap: false` (default off prod) ✓
   - `extractLicenses: true` ✓
   - `outputHashing: all` ✓ (already set)
   - `namedChunks: false` ✓ (default off prod)

4. **Ionic standalone-imports invariant**
   - Add a CI check (lint or pre-build script) that fails if any source file imports from `@ionic/angular` instead of `@ionic/angular/standalone`. Wildcard `IonicModule` imports balloon the bundle and bypass tree-shaking.
   - Pattern: `grep -rn "from '@ionic/angular'" packages/client/src | grep -v "from '@ionic/angular/standalone'"` must be empty.

**Exit bar:** prod build under tightened budgets, no `*.map` in `www/`, no `IonicModule` non-standalone imports, build reproducible with `pnpm --filter @hnch/client run build`.

### Phase 2 — Bootstrap script + VPS layout

**Goal:** VPS is ready to receive PWA tarballs idempotently.

1. **Update `infra/bootstrap-vps.sh`**
   - Add idempotent block (similar to relay `/opt/hnch-relay` setup):
     ```bash
     install -d -o deploy -g deploy /var/www/hnch-client-releases
     # Initial empty release so Caddy doesn't 404 before first deploy
     install -d -o deploy -g deploy /var/www/hnch-client-releases/release-bootstrap
     test -e /var/www/hnch-client || ln -sfn /var/www/hnch-client-releases/release-bootstrap /var/www/hnch-client
     # If /var/www/hnch-client already exists as a real dir (current state),
     # rename it to release-bootstrap and re-create as symlink.
     ```
   - Handle migration from current state: if `/var/www/hnch-client` is a directory (not symlink), move contents into `release-bootstrap` then replace with symlink.

2. **One-time manual run on existing VPS**
   - SSH as `deploy`, run the new bootstrap block (or re-run the full script — it's idempotent).
   - Verify `/var/www/hnch-client` is now a symlink with `ls -la /var/www/`.

3. **Sudoers / systemd note**
   - Caddy reload not needed for symlink swap (Caddy follows symlink at request time). No sudoers change required for the client deploy.

**Exit bar:** `/var/www/hnch-client` is a symlink, releases dir owned by `deploy`, Caddy still serves the existing content (or initial placeholder) over HTTPS.

### Phase 3 — Caddyfile cache headers

**Goal:** `index.html` always fresh; hashed assets immutable.

Edit `infra/Caddyfile` static-handle block:

```caddy
handle {
    root * /var/www/hnch-client
    try_files {path} /index.html

    # Cache-Control:
    # - hashed JS/CSS/woff2 (Angular outputHashing=all): immutable, 1 year
    # - index.html + manifest + sw stubs: must-revalidate
    @hashed path_regexp \.[a-f0-9]{8,}\.(js|css|woff2|woff|ttf|svg|png|jpg|webp|avif)$
    header @hashed Cache-Control "public, max-age=31536000, immutable"

    @html path *.html /
    header @html Cache-Control "no-cache, must-revalidate"

    file_server
}
```

Ship Caddyfile change to VPS as part of bootstrap update, or via separate one-off deploy step (manual `scp` + `systemctl reload caddy`). Add a note to `infra/README.md`.

**Exit bar:** `curl -I https://hnch.dev/` shows `Cache-Control: no-cache`; `curl -I https://hnch.dev/<hashed-asset>` shows `immutable`.

### Phase 4 — Deploy workflow

**Goal:** Tag `client-vX.Y.Z` → workflow builds + ships PWA to VPS.

Create `.github/workflows/deploy-client.yml`, mirroring `deploy-relay.yml`:

```yaml
name: Deploy client (PWA)

on:
  push:
    tags:
      - 'client-v*'
  workflow_dispatch:
    inputs:
      ref:
        description: 'Git ref to deploy (defaults to current ref)'
        required: false

concurrency:
  group: deploy-client
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  deploy:
    name: Build + ship PWA
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref || github.ref }}

      - name: Enable Corepack
        run: corepack enable

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install workspace deps
        run: pnpm install --frozen-lockfile

      - name: Build @hnch/shared (consumed by client)
        run: pnpm --filter @hnch/shared run build

      - name: Build @hnch/client (production)
        env:
          NODE_ENV: production
        run: pnpm --filter @hnch/client run build

      - name: Post-build hygiene asserts
        run: |
          set -euo pipefail
          # No source maps in production bundle
          if find packages/client/www -name '*.map' | grep -q .; then
            echo "ERROR: source maps leaked into production bundle" >&2
            find packages/client/www -name '*.map' >&2
            exit 1
          fi
          # No surviving console.log (terser strips by default; this catches misconfig)
          if grep -rIln 'console\.log' packages/client/www --include='*.js' | head -1 | grep -q .; then
            echo "WARNING: console.log calls survived minification" >&2
            # Soft-fail for now; flip to hard-fail once verified clean
          fi
          # No non-standalone Ionic imports survived (sanity, dist is minified so this is best-effort)
          # Real check is in Phase 1 lint, this is just a smoke check on size
          du -sh packages/client/www
          find packages/client/www -name '*.js' -size +500k

      - name: Pack tarball
        id: pack
        run: |
          STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
          TARBALL="hnch-client-${STAMP}.tar.gz"
          tar -C packages/client -czf "${TARBALL}" www
          echo "tarball=${TARBALL}" >> "$GITHUB_OUTPUT"
          echo "stamp=${STAMP}" >> "$GITHUB_OUTPUT"

      - name: Configure SSH
        env:
          VPS_SSH_KEY: ${{ secrets.VPS_SSH_KEY }}
          VPS_HOST: ${{ secrets.VPS_HOST }}
        run: |
          mkdir -p ~/.ssh
          echo "${VPS_SSH_KEY}" > ~/.ssh/id_ed25519
          chmod 0600 ~/.ssh/id_ed25519
          ssh-keyscan -t ed25519 -H "${VPS_HOST}" >> ~/.ssh/known_hosts

      - name: Ship tarball
        env:
          VPS_HOST: ${{ secrets.VPS_HOST }}
          VPS_USER: ${{ secrets.VPS_USER }}
          TARBALL: ${{ steps.pack.outputs.tarball }}
        run: |
          scp -o StrictHostKeyChecking=yes "${TARBALL}" "${VPS_USER}@${VPS_HOST}:/tmp/${TARBALL}"

      - name: Activate release on VPS
        env:
          VPS_HOST: ${{ secrets.VPS_HOST }}
          VPS_USER: ${{ secrets.VPS_USER }}
          TARBALL: ${{ steps.pack.outputs.tarball }}
          STAMP: ${{ steps.pack.outputs.stamp }}
        run: |
          ssh -o StrictHostKeyChecking=yes "${VPS_USER}@${VPS_HOST}" bash -se <<EOF
          set -euo pipefail
          BASE=/var/www
          RELEASES="\${BASE}/hnch-client-releases"
          TARGET="\${RELEASES}/release-${STAMP}"
          mkdir -p "\${TARGET}"
          tar -C "\${TARGET}" --strip-components=1 -xzf /tmp/${TARBALL}
          rm /tmp/${TARBALL}
          ln -sfn "\${TARGET}" "\${BASE}/hnch-client"
          # Caddy follows the symlink on next request — no reload needed.
          # Keep last 3 releases, prune older.
          ls -1dt \${RELEASES}/release-* | tail -n +4 | xargs -r rm -rf
          EOF

      - name: Smoke test
        run: |
          for attempt in 1 2 3 4 5; do
            if curl -fsS --max-time 5 https://hnch.dev/ | grep -q '<app-root'; then
              echo "PWA index.html OK on attempt ${attempt}"
              exit 0
            fi
            sleep 2
          done
          echo "PWA smoke test failed after 5 attempts" >&2
          exit 1
```

**Exit bar:** workflow YAML lints clean; dry-run via `workflow_dispatch` against a non-tag ref succeeds end-to-end; smoke test passes.

### Phase 5 — Wire semantic-release to no-op publishCmd

**Goal:** `client-v*` tags get cut on conventional-commit merges; tag push triggers deploy. No direct-invoke path.

Edit `packages/client/.releaserc.json:33-37`:

```json
[
  "@semantic-release/exec",
  {
    "publishCmd": "echo 'client-v${nextRelease.version} tagged — deploy-client.yml will fire on tag push'"
  }
]
```

(Same shape as today, just an honest message instead of TODO.)

Verify tag push from `release.yml` actually triggers `deploy-client.yml`. Note: GitHub Actions skips workflow triggers when a tag is pushed by the default `GITHUB_TOKEN`. The relay deploy already works around this — confirm `release.yml` uses a PAT or app token for the tag push (`SEMANTIC_RELEASE_TOKEN` or similar). If relay deploy fires today, client deploy will too.

**Exit bar:** local `release:dry` (root `package.json:22`) shows planned `client-vX.Y.Z`; actual tag push (test branch) fires `deploy-client.yml`.

### Phase 6 — Documentation

1. **`infra/README.md`** — add a "PWA static host" section: layout, swap mechanism, rollback procedure, Caddy cache rules.
2. **`adr/0029-relay-deployment.md`** — append a status note (not a body edit; ADRs are immutable). Either:
   - Add a new short ADR (e.g. ADR-0030) recording the realized PWA static-host wiring, OR
   - Add a single status-line addendum to ADR-0029 of the form "Realized PWA static host on the same VPS per Consequences §X — see plans/plan-pwa-deploy.md and infra/README.md."
   - User said no new ADR — go with the addendum approach.
3. **`CLAUDE.md`** — bump the "Deployment" line under "Current decisions at a glance" to mention "PWA + relay served from a single origin" is now realized (not planned).

**Exit bar:** docs reflect deployed reality; future contributors can rebuild the setup from `infra/README.md` alone.

## Build sequence (dependency-ordered)

1. Phase 1 (env URL fix + budgets + Ionic-import lint) — independent, ship as one PR. `feat(client)` if it includes the URL change since that's user-visible behavior; `chore(client)` if pure tooling.
2. Phase 2 (bootstrap script + manual VPS migration) — independent of Phase 1; ship as `chore(infra)` PR. Migration step is manual SSH, document in PR body.
3. Phase 3 (Caddyfile cache headers) — independent; can land with Phase 2 or separately. `chore(infra)`.
4. Phase 4 (deploy workflow) — depends on Phase 2 (VPS layout exists). `chore(infra)`.
5. Phase 5 (semantic-release publishCmd cleanup) — independent of all above; trivial. `chore(client)`.
6. Phase 6 (docs) — last, after Phase 4 has fired at least once. `docs`.

First real client tag (`client-v1.0.0`) gets cut by the next `feat(client)` / `fix(client)` merge after Phase 5 lands.

## Risks + mitigations

- **Tag-push doesn't fire workflow.** Default `GITHUB_TOKEN` cannot trigger downstream workflows. Mitigation: confirm `release.yml` uses PAT/app token (relay already works, so this is likely fine). Fallback: `workflow_dispatch` manual trigger.
- **Symlink swap race.** Caddy reads `root` per-request and follows symlinks at filesystem level. Atomic on Linux (`ln -sfn` is `rename(2)`-equivalent). No race in practice.
- **First deploy before initial release.** Bootstrap creates `release-bootstrap` placeholder so Caddy serves *something* (even an empty 404 page is fine; Caddy's `try_files` falls back to a missing `index.html` → 404, which is acceptable until first real deploy).
- **Bundle bloats over time.** Mitigation: tightened `angular.json` budgets fail the build. Re-tune budgets when intentional growth lands (e.g. new feature with large deps).
- **Source maps for production debugging.** Trade-off: no maps → harder prod debugging, but smaller bundle + no leaked source. If real prod debugging need arises, generate maps but keep them out of the deployed bundle (separate artifact).
- **Service worker absence noticed by users.** Document the SW deferral in `infra/README.md` so the question "where's offline mode?" has a written answer. Revisit if user feedback demands.
- **Existing `/var/www/hnch-client` directory contents.** Bootstrap migration must handle the case where it's already a real directory. The migration block above does; verify on the actual VPS state before running.

## Testing strategy

- **Local prod-build smoke:** `pnpm --filter @hnch/client run build && du -sh packages/client/www && find packages/client/www -name '*.map'` — manual until Phase 4 wires it into CI.
- **Workflow dry-run:** trigger via `workflow_dispatch` against a feature branch ref; verify all steps succeed, smoke test passes.
- **First real deploy:** merge a `feat(client): wire prod relay URL` PR (Phase 1), watch `release.yml` cut `client-v1.0.0`, watch `deploy-client.yml` fire, verify `https://hnch.dev/` serves the new bundle, verify a real session connects to `wss://hnch.dev`.
- **Rollback drill:** SSH to VPS, `ln -sfn /var/www/hnch-client-releases/release-<prior-stamp> /var/www/hnch-client`, verify served content reverts. Document this in `infra/README.md`.

## Out of scope

- Service worker / installable PWA / offline shell.
- CDN in front of Caddy (single-VPS layout per ADR-0029).
- Separate `app.hnch.dev` subdomain (single-origin per ADR-0029).
- Source-map artifact retention for prod debugging.
- Lighthouse / PWA-audit gates in CI.
- Native iOS / TestFlight (Phase 6b in `roadmap.md`).
