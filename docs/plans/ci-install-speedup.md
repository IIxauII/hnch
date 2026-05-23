# CI install speedup — sub-10s target

## Problem

`pnpm install --frozen-lockfile` in CI runs 22–48s per job. Measured on recent CI runs (workflow `ci.yml`, runs 25785514396 / 25794868991):

| Job                  | Install time |
| -------------------- | ------------ |
| Verify (client)      | 48.1s        |
| Version audit        | 35.3s        |
| E2E (Playwright)     | 22.1s        |

Pnpm store at `/cache/pnpm-store-${idx}` (per-runner bind mount) → `downloaded 0, reused 1343`. No network. Time breakdown of warm 22s case:

- Resolve + lockfile parse: ~0.5s
- Hardlink 1343 pkgs store → node_modules: ~15s **(bottleneck)**
- `msgpackr-extract` postinstall (node-gyp-build): ~6s
- `packages/client` postinstall (`generate-version.mjs`): ~0.3s

Across one PR: install fires 3+ times (verify lane(s) + version-audit + e2e).

## Target

Sub-10s install on every CI lane (all self-hosted; ubuntu-latest fallback stays untouched).

## Approach — 3 layers, 1 PR, atomic commits

Single PR. Three layers behind one composite action; commits inside the PR stay atomic so each step is bisectable and reversible. Commit sequence:

1. `ci(ci): gate setup-node + corepack on github-hosted only` — layer 2 alone, no infra changes. Drop-in 3s saving, low-risk smoke.
2. `ci(ci): add --ignore-scripts to verify + version-audit lanes` — layer 3 alone. Independent ~6s saving on cold-miss path; no infra dep.
3. `infra(runner): add zstd + nm-snapshots bind mount` — Dockerfile + supervisor.sh + install.sh + prune.sh. Image rebuild required. No `ci.yml` consumer yet → no behavior change in CI until commit 5.
4. `ci(ci): add pnpm-install composite action` — composite under `.github/actions/pnpm-install/`. Not yet referenced. Safe to land independently.
5. `ci(ci): wire ci.yml install steps to composite action` — final swap. Only this commit changes CI lane behavior. Revertable in isolation if hit rate or correctness regresses.

Each commit compiles, passes CI on its own, and can be reverted without disturbing later commits' diffs. PR title (Conventional Commits, scope from allowlist): `ci(ci): cache node_modules snapshots, gate setup-node, ignore-scripts`.

### Layer 1 — lockfile-hashed node_modules snapshot (primary win)

Bind-mount `/cache/nm-snapshots/` (shared across the 4 podman runners; tar archives are append-once, read-many — no write race).

```bash
HASH=$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)
SNAP=/cache/nm-snapshots/${HASH}.tar.zst
if [[ -f "$SNAP" ]]; then
  zstd -dc "$SNAP" | tar -xf - -C .
else
  pnpm install --frozen-lockfile
  TMP=$(mktemp -u "${SNAP}.XXXXX")
  tar --zstd -cf "$TMP" node_modules packages/*/node_modules
  mv "$TMP" "$SNAP"   # atomic publish
fi
```

Restore cost: ~3–5s for 1343 pkgs from local SSD. Cache key = lockfile hash → invalidates on any dep change. Survives across PRs sharing lockfile.

Storage: ~200–400 MB per snapshot. With weekly prune of stale snapshots (mtime > 14d) the dir stays bounded.

### Layer 2 — gate setup-node + corepack enable on hosted only

Both are no-ops on the self-hosted image (Node 22 + pnpm 9.15.0 baked in). Each adds 2–3s.

```yaml
- name: Enable Corepack
  if: runner.environment == 'github-hosted'
  run: corepack enable

- uses: actions/setup-node@v4
  if: runner.environment == 'github-hosted'
  with:
    node-version: 22
```

Applies to every job in `ci.yml` (verify, version-audit, e2e). Saves ~3s × N jobs per run.

### Layer 3 — `--ignore-scripts` on lanes that don't need native builds

`msgpackr-extract` is only consumed at runtime by relay/e2e/client. Lint/typecheck/format-check/unit-tests don't need the native binary.

- **Verify matrix**: `pnpm install --frozen-lockfile --ignore-scripts` → save ~6s.
- **Version audit**: `--ignore-scripts` (only reads package.jsons) → save ~6s.
- **E2E**: keep scripts (runtime needs the build).

Note: snapshot tar from layer 1 captures the post-script state, so cache restore implicitly includes built binaries. `--ignore-scripts` only matters on the cold-miss path. Still worth setting for the miss case + correctness on dep churn.

## Composite action

New file: `.github/actions/pnpm-install/action.yml`.

```yaml
name: pnpm install (snapshot-cached)
inputs:
  ignore-scripts:
    default: 'false'
runs:
  using: composite
  steps:
    - shell: bash
      run: corepack enable
      if: runner.environment == 'github-hosted'
    - uses: actions/setup-node@v4
      if: runner.environment == 'github-hosted'
      with: { node-version: 22 }
    - shell: bash
      env:
        IGNORE_SCRIPTS: ${{ inputs.ignore-scripts }}
      run: |
        set -euo pipefail
        HASH=$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)
        SNAP_DIR=/cache/nm-snapshots
        SNAP="${SNAP_DIR}/${HASH}.tar.zst"
        if [[ -d "$SNAP_DIR" && -f "$SNAP" ]]; then
          echo "snapshot hit: $SNAP"
          zstd -dc "$SNAP" | tar -xf - -C .
          # Refresh mtime for prune LRU.
          touch "$SNAP" || true
          exit 0
        fi
        echo "snapshot miss — cold install"
        FLAGS="--frozen-lockfile"
        [[ "$IGNORE_SCRIPTS" == "true" ]] && FLAGS+=" --ignore-scripts"
        pnpm install $FLAGS
        if [[ -d "$SNAP_DIR" ]]; then
          TMP=$(mktemp -u "${SNAP}.XXXXX")
          tar --zstd -cf "$TMP" node_modules packages/*/node_modules || true
          mv "$TMP" "$SNAP" 2>/dev/null || rm -f "$TMP"
        fi
```

Guard: `[[ -d "$SNAP_DIR" ]]` — on hosted fallback (no bind mount) action degrades to plain `pnpm install`.

## ci.yml diff sketch

Replace each:

```yaml
- name: Enable Corepack
  run: corepack enable
- uses: actions/setup-node@v4
  with: { node-version: 22 }
- name: Install
  run: pnpm install --frozen-lockfile
```

with:

```yaml
- uses: ./.github/actions/pnpm-install
  with:
    ignore-scripts: 'true'   # only on verify + version-audit
```

E2E keeps `ignore-scripts: 'false'` (default).

## Runner infra changes

### `infra/runner/supervisor.sh`

Add bind mount for the shared snapshot dir (one entry, not per-runner — read-many is safe; writes use mktemp + atomic rename):

```diff
   -v "${HOME}/runner-cache/pnpm-store-${idx}:/cache/pnpm-store" \
   -v "${HOME}/runner-cache/playwright:/cache/playwright" \
+  -v "${HOME}/runner-cache/nm-snapshots:/cache/nm-snapshots" \
   -v "${HOME}/runner-cache/work-${idx}:/actions-runner/_work" \
```

Pre-create dir in `install.sh` and ensure perms (uid 1000 owner, matching `runner` user from Dockerfile).

### `infra/runner/prune.sh`

Extend the active-job-guarded section:

```bash
# 2b. Prune nm-snapshots — LRU by mtime, drop entries older than 14d.
SNAP_DIR="${CACHE_ROOT}/nm-snapshots"
if [[ -d "$SNAP_DIR" ]]; then
  echo "[$(date)] pruning $SNAP_DIR"
  find "$SNAP_DIR" -type f -name '*.tar.zst' -mtime +14 -print -delete
fi
```

Disk-low threshold (30 GB) already covers nm-snapshots dir since it's under `~/runner-cache`.

### `infra/runner/Dockerfile`

Add `zstd` to apt-get install list (already has `tar` via base). One-line change.

## Verification

1. Local smoke: build image with `zstd`, exec `tar --zstd ...` round-trip on a workspace checkout.
2. First push: cold miss — install completes, snapshot written. Look for `snapshot miss — cold install` in logs.
3. Second push (same lockfile): expect `snapshot hit`, install step <8s wall.
4. Dep churn push: lockfile hash changes → cold miss → new snapshot written.
5. Roll back lever: `vars.LINUX_RUNNER` already gates self-hosted vs hosted. Composite action's hosted branch is plain `pnpm install`, so flipping back is one command.

## Expected outcome

| Job           | Now  | Hit  | Miss (cold) |
| ------------- | ---- | ---- | ----------- |
| Verify        | 48s  | ~5s  | ~30s (1× per lockfile change) |
| E2E           | 22s  | ~6s  | ~22s |
| Version audit | 35s  | ~5s  | ~20s |

Wall-time saving per PR run (3 hits): ~80s → ~16s. Aggregate runner-hours saving compounds.

## Risks + mitigations

- **Snapshot corruption** — atomic mv + zstd checksum; if `tar -xf` fails, action could fall back to `pnpm install`. Add fallback in v1.1 if observed.
- **Stale build artifacts** — `generate-version.mjs` writes git-derived version; if a snapshot from another commit is restored, version may be stale. Re-run postinstall after restore? Cheaper: `generate-version.mjs` is fast — run it unconditionally post-restore.
- **Cross-host portability** — snapshots include native binaries (msgpackr-extract). All 4 runners are arm64 podman on same Mac mini; safe. If a Tart macOS runner joins later (Phase 9), it needs its own snapshot dir keyed by arch.
- **Hosted fallback breaks** — composite action's `runner.environment` guard re-introduces setup-node; snapshot block no-ops when `/cache/nm-snapshots` absent.

## Out of scope

- `pnpm config side-effects-cache` — could help further; tackle if snapshot approach falls short.
- `actions/cache` — rejected (slower than store reuse, against sub-10s goal).
- Cross-job artifact sharing — rejected (upload/download overhead).
- Reducing dep count — orthogonal cleanup.

## PR checklist (atomic commits)

- [ ] Commit 1 — `ci(ci): gate setup-node + corepack on github-hosted only`
- [ ] Commit 2 — `ci(ci): add --ignore-scripts to verify + version-audit lanes`
- [ ] Commit 3 — `infra(runner): add zstd + nm-snapshots bind mount`
  - [ ] `infra/runner/Dockerfile` adds `zstd`
  - [ ] `infra/runner/supervisor.sh` adds nm-snapshots bind mount
  - [ ] `infra/runner/install.sh` pre-creates `~/runner-cache/nm-snapshots`
  - [ ] `infra/runner/prune.sh` extended with snapshot LRU
  - [ ] Image rebuild + supervisor restart on host before commit 5 merges
- [ ] Commit 4 — `ci(ci): add pnpm-install composite action`
  - [ ] `.github/actions/pnpm-install/action.yml` created, not yet referenced
- [ ] Commit 5 — `ci(ci): wire ci.yml install steps to composite action`
  - [ ] verify, version-audit, e2e — 3 sites
  - [ ] First CI run observed cold-miss; second run observed hit <10s
- [ ] PR title: `ci(ci): cache node_modules snapshots, gate setup-node, ignore-scripts`
