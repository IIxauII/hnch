# `screenshots` branch — machine-managed

Do not hand-edit. Do not merge into `main`. This branch is published to by the `lefthook` pre-push hook (`scripts/screenshot-publish.mjs`) on contributor pushes.

## Layout

```
sha-<short>/
  <topic>/
    <scene>.png
```

Each `sha-<short>/` directory corresponds to one PR push. PR sticky comments embed images via:

```
https://github.com/IIxauII/hnch/blob/screenshots/sha-<short>/<topic>/<file>.png?raw=true
```

## Retention

**Uncapped.** PNGs are small (~80 kB each, ~30/PR ≈ 2.4 MB/PR). The branch is PR-scoped and transient — no pruning runs here. The cap-to-last-10 retention applies only to `docs/screenshots/<sha>/` on `main` (maintained by `.github/workflows/screenshots-main.yml`).

Revisit if branch exceeds, e.g., 10 GB.

## Concurrency

The publisher uses `git fetch + reset --hard origin/screenshots` before each commit and retries on non-fast-forward push rejection. Force pushes are not used.

## Cross-references

- Plan: `docs/plans/e2e-screenshot-coverage-expansion.md` on `main`.
- Hook: `lefthook.yml` `pre-push.commands.screenshots` on `main`.
- Publisher script: `scripts/screenshot-publish.mjs` on `main`.
- Main-CI counterpart: `.github/workflows/screenshots-main.yml` on `main` → writes to `docs/screenshots/<sha>/` on `main`, not here.
