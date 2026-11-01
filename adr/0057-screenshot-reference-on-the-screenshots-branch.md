# ADR-0057: Screenshot reference set — captured in main's e2e run, stored on the `screenshots` branch

**Status:** Accepted
**Date:** 2026-10-31

**Caveat (2026-11-01, #598):** a verified-skip run (ADR-0055) with UI changes first tries to promote the verifying PR run's own set: its `screenshots-capture` artifact (layout: docs/release.md › Main reference set), taken only when complete, from main's commit's tree and, when both sides know it, the same hosted runner image. Promoted: no e2e job, the publish job pushes that set as `sha-<short>/` of the main commit, `latest.json` gains `capturedIn` (the PR run). Missing, expired, partial, another tree, or any error: the capture-only run below, as before. PR runs upload no such artifact until #596; the publisher and the layout are unchanged.

Changes where main's "what the app looks like now" reference lives and how it is made; [ADR-0055](0055-verified-skip-main-push-run.md) (verified-skip) gains a capture-only run, its decision unchanged. Issue: #597 (under #589).

## Context

- Reference set = full screenshot suite (`packages/e2e/tests/_screenshots/`, 21 specs, ~150 PNGs) captured at a `main` commit. Consumers: `/plan`, `/spec`, `/critique` commands, the PR diff comment (#596), docs.
- Until now: `screenshots-main.yml` ran Playwright a second time per UI merge (median 6.7 min, up to 27) and committed the PNGs to `main` under `docs/screenshots/sha-<short>/` plus a `latest` symlink, pruned to 10 sets. 11 bot commits for 24 human merges in 30 days; every full clone of `main` paid for the PNG history (detect-changes, release, version audit).
- GitHub serves no file through a symlinked path: `blob/main/docs/screenshots/latest/<topic>/<scene>.png?raw=true` returned 404 (measured 2026-10-31, contents API and raw). The documented discovery URL never worked.
- PR captures already go to the orphan `screenshots` branch (`sha-<short>/` per PR head), pushed by the pre-push hook with fetch + reset + retry, uncapped.
- Verified-skip (ADR-0055) runs no e2e on a clean squash merge, so a main run alone would leave UI merges without a fresh reference until #598 promotes the PR run's set.
- Git stores one blob per distinct content: a second directory holding the same PNGs costs no space.

## Decision

Main's reference set is captured inside the e2e job of the `main` push run, in the same Playwright session as the app tests (`SCREENSHOT_CAPTURE=1`), and published by a follow-up job to the `screenshots` branch: `sha-<short>/` of the `main` commit, a copy as `latest/`, and `latest.json` (`{ set, commit, run }`). `main` receives no PNGs; `screenshots-main.yml` retires.

- Trigger: `detect-changes` output `screenshots`, true when the diff touched `packages/{client,shared,e2e/tests/_screenshots,e2e/tests/fixtures}/` (the hook's list) or a root file (lockfile, workflows: a dependency bump can move pixels). PR runs never capture (that is #596).
- Verified-skip run with UI changes: the e2e job runs the screenshot specs alone, the whole job `continue-on-error`. A failed capture-only run, at any step, keeps `main` green; the tree was verified.
- Publish job: `contents: write`, the workflow's only write token; runs only `scripts/ci/screenshots-reference.mjs` from the pushed `main` commit, never code from a PR. Checkout of the branch: depth 1, `blob:none`, sparse cone `latest/`. `continue-on-error`: a failed publish leaves the previous `latest/` and the run green; `::error::` plus the step summary show it.
- `latest/` moves forward only: a set whose `main` commit is behind the one `latest.json` names (a re-run of an older run's failed publish) is added as `sha-<short>/` and leaves `latest/` alone. Checked against main's history (treeless checkout), no API.
- Discovery URL: `https://github.com/IIxauII/hnch/blob/screenshots/latest/<topic>/<scene>.png?raw=true`. A directory, not a symlink.
- Retention on the branch: uncapped, as for PR captures. `docs/screenshots/` on `main` is gitignored; old sets stay in history, no rewrite.

## Trade-offs

- `main`'s e2e run has tests PR runs lack (the screenshot specs): a flaky screenshot spec turns `main` red where it did not before (screenshots-main failed 3 of its last 40 runs), and holds the release until a rerun. Accepted over a second Playwright run per merge.
- Capture runs with the e2e job's worker count (min(4, CPUs)), not `--workers=1` as the hook does. Pixel stability across worker counts is #595's question; main's set is the reference #596 will compare against.
- Full clones of `main` keep paying for the PNG history already there; only new growth stops.
- A `main` run cancelled by a newer push (workflow concurrency) publishes nothing; the newer run does.
- One more job per UI merge (about a minute: two sparse checkouts, an artifact download, a push).

## Consequences

- Easier: one Playwright session per UI merge; no bot commits on `main`; the latest-scene URL opens the image; #598 can promote a PR run's set by the same publisher with a different source directory.
- Harder: the reference is a branch away from the code it shows; `latest.json` is the only link back to the `main` commit.
- Revisit when: #596 fixes the PR capture's worker count and tolerance (align main's capture); #598 promotes verified PR sets (capture-only runs become the fallback); the branch nears 10 GB.
