# `screenshots` branch — machine-managed

Do not hand-edit. Do not merge into `main`. Two publishers write here, never with a force push:

- `scripts/screenshot-publish.mjs` on `main` (the `lefthook` pre-push hook and `pnpm screenshots:publish`): a PR's capture, under `sha-<short>/` of the PR head.
- `scripts/ci/screenshots-reference.mjs` on `main` (the `screenshots-reference` job of `ci.yml`, after the e2e job of a `main` push with UI changes): main's reference set, under `sha-<short>/` of the `main` commit, copied to `latest/`, and this README.

## Layout

```
sha-<short>/<topic>/<scene>.png   every capture: PR pushes and main alike
latest/<topic>/<scene>.png        main's newest reference set (a copy, not a symlink: GitHub serves nothing through a symlinked path)
latest.json                       { set, commit, run }: which sha-<short>/ latest/ is, the main commit it shows, the run that captured it
```

Embed or open an image with the one URL pattern that renders on GitHub mobile and desktop:

```
https://github.com/IIxauII/hnch/blob/screenshots/latest/<topic>/<scene>.png?raw=true
https://github.com/IIxauII/hnch/blob/screenshots/sha-<short>/<topic>/<scene>.png?raw=true
```

## Retention

Uncapped. PNGs are small (about 80 kB each, about 150 per capture), and identical images share one blob. Revisit if the branch exceeds, say, 10 GB.

## Concurrency

Both publishers fetch and reset to `origin/screenshots` before each commit and retry on a rejected (non-fast-forward) push. `latest/` only moves to a set whose `main` commit is at or past the one it shows.

## Cross-references

- Flow and troubleshooting: `docs/release.md` › Screenshots, on `main`.
- Harness: `packages/e2e/README.md` › Screenshot harness, on `main`.
