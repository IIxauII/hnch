# ADR-0055: Verified-skip — a main push run may pass on a green PR run for the identical tree

**Status:** Accepted
**Date:** 2026-10-30

Changes what a green `ci.yml` push run on `main` means; [ADR-0049](0049-self-hosted-runner-pool-current-state-consolidation.md), [ADR-0052](0052-single-e2e-runner-slot.md) and [ADR-0053](0053-runner-pool-two-slots.md) unchanged. Issue: #593 (under #589).

## Context

- PR runs test `refs/pull/N/merge`: PR head merged into base tip. Squash merge of a PR whose base has not moved since gives a `main` commit with that exact tree, first parent = that base tip.
- `main` push run re-tested it anyway: ~10 min and the single e2e slot per merge (ADR-0052), on a 2-slot pool (ADR-0053).
- `release.yml` starts from a green `ci.yml` push run on `main` (`workflow_run`), so every merge's release waited for the re-test.
- `main` push run picks lanes from every commit since the last green `main` push run, minus the bot's `[skip ci]` commits (`BOT_SUBJECT`), so a red or cancelled merge is re-tested by the next run.
- Squash-only merges, PR title = commit subject (docs/release.md › Merge strategy). No branch protection (private repo, GitHub Free): green-before-merge is convention.
- Lane and test results are a function of the tree. PR and `main` runs do the same work; both measure coverage and upload it to Codecov.

## Decision

A `main` push run of commit C passes without running any package lane or e2e when a green PR run tested C's tree on C's first parent and every commit since the last green `main` push run, other than C, is a `[skip ci]` bot commit; in every other case it runs as before. `scripts/ci/verified-tree.mjs` holds the rules:

- Evidence: each same-repo PR run's `detect-changes` uploads artifact `verified-tree` (30-day retention): tree of the checked-out merge, its first parent (base tested on), PR head SHA. Recorded only when first parent = event's `pull_request.base.sha` (lane diff start) or that SHA + only `[skip ci]` bot commits. Bot commits don't update open PR: `base.sha` stays, `refs/pull/N/merge` builds on newer tip; no lane counts them. Else: `unrecorded` marker. Git error while recording → marker carrying the error + `::warning::` on the PR run, never a red PR run.
- Lookup on a `main` push: the one merged PR whose `merge_commit_sha` is C (`commits/{C}/pulls`), from this repo, not a fork → newest completed `ci.yml` `pull_request` run for that PR's final head → conclusion `success` → its `verified-tree` record, head matching.
- Skip only when all hold: C's tree = recorded tree; C's first parent = recorded base; only `[skip ci]` bot commits (or none) between the last green `main` push run and C's parent. The last rule keeps a red or cancelled merge's lanes from being dropped: the PR run picked lanes from the PR's own diff only.
- Plain miss → today's run, no annotation: no merged PR (direct push), several, fork PR, no completed run, newest run not green, artifact expired, tree / base / intervening-commit mismatch.
- Fault → today's run plus a `::warning::` annotation: any API, download or git error, a green run with no artifact, a malformed record. Never a skip on error.
- On a skip: every `detect-changes` lane output false, `verify-packages=[]`; step summary names the PR and the verifying PR run. Run concludes success, so `release.yml` releases C, and the next `main` run diffs from it.

## Trade-offs

- Green `main` push run no longer means "this run tested C"; it means "C's tree passed CI on C's parent, here or in the PR run the summary names".
- Codecov gets no upload for a verified-skip run's commit, so its `main` history skips those commits until the next full `main` run uploads. A later PR based on such a commit still gets its comment and `codecov/patch` check: Codecov compares against a substitute base ("pseudo-base", [docs](https://docs.codecov.com/docs/comparing-commits)), as it already does for PRs based on the bot's `[skip ci]` commits.
- One test pass per tree: a flaky test that passed in the PR run is not re-rolled on `main`.
- Evidence lives in workflow artifacts: a PR run older than 30 days, or from before this ADR, gives a full run (the latter with a warning).
- Every `main` push `detect-changes` makes ~4 extra API calls and one artifact download.
- Fork PRs never verify: their PR runs skip lanes and e2e on the self-hosted pool.

## Consequences

- Easier: a clean squash merge goes green on `main` in about the time of `detect-changes`, frees the e2e slot, and releases right away.
- Harder: why `main` passed is in the run summary, not in job logs; a lane rule or record bug could skip real work, so the script is tested in `detect-changes` before use.
- Revisit when: merges stop being squash-only; PR runs stop testing the merge ref; `main` runs gain checks PR runs lack (secrets, deploy smokes, extra lanes); a merge queue or required up-to-date branches lands.
