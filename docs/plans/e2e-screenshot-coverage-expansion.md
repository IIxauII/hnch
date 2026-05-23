# E2E screenshot coverage expansion

**Status:** Draft (post-critique)
**Date:** 2026-05-19
**Source spec:** [docs/specs/e2e-screenshot-coverage-expansion.md](../specs/e2e-screenshot-coverage-expansion.md)
**Source issue:** [#265](https://github.com/IIxauII/hnch/issues/265)
**Shape:** Multi-PR (4 phases)

## Summary

Replace the ad-hoc screenshot setup (3 scattered dirs, 197 tracked PNGs on `main`) with a two-surface canonical harness:

- **PR flow:** developer's pre-push hook (via existing `lefthook`) runs a tag-scoped subset, publishes PNGs to a long-lived `screenshots` branch under `sha-<short>/`, posts a sticky PR comment with inline `blob/...?raw=true` embeds (verified rendering on mobile + desktop). **No cap** on `screenshots` branch (PR-scoped, transient).
- **Main flow:** CI workflow on push-to-`main` (paths-filter `packages/{client,shared,e2e/tests/_screenshots,e2e/tests/fixtures}/**`) runs the **full suite**, commits PNGs to `main` under `docs/screenshots/<sha>/`, updates `docs/screenshots/latest` symlink, prunes to last 10 sha dirs.

Skills (`/triage`, `/plan`, `/spec`, `/critique`) consult `docs/screenshots/latest/` on `main` as the canonical "what the app looks like now" reference.

## Approach

### Specs (Phase 1)

Two patterns based on context complexity:

- **Single-host scenes** → extend `packages/e2e/tests/_screenshots/capture.spec.ts` (existing tour).
- **Multi-client + timing-sensitive scenes** → new per-feature files under `packages/e2e/tests/_screenshots/` (matches existing pattern: `vote-bars-shot.spec.ts`, `avatar-color.spec.ts`, `room-full.spec.ts`).

Output path env-driven (shared across all spec files):

```ts
const SHA = process.env['SCREENSHOT_SHA'] ?? 'local';
const OUT_DIR = path.resolve(__dirname, '../../../../docs/screenshots', SHA);
```

Local manual runs default to `docs/screenshots/local/`. CI/hook pass `SCREENSHOT_SHA=sha-<short>`.

#### Single-host (capture.spec.ts extensions)

| # | Scene | Notes |
|---|---|---|
| 6a | Custom scale editor sheet | Lobby → scale picker → Custom |
| 6b | PresetOverrides toggle | Card toggled off |
| 4a | Round history empty | Verify placeholder exists or document none |
| 9 | Empty home | First-run, no last-session, no teams |
| 8a | Connection chip — offline | `setOffline(true)`, immediate |
| 8c | Connection chip — reconnected | `setOffline(false)`, wait for `connected` |

#### Per-feature files (new)

| # | File | Scene(s) | Mechanic |
|---|---|---|---|
| 1 | `password-flow.spec.ts` | Password entry sheet + wrong-password reject (close 4002) | 2 contexts: host w/ pwd-protected room, joiner |
| 2 | `reveal-transition.spec.ts` | Pre-reveal all-voted, post-reveal lobby with VoteResultsComponent | Host + 2 voter contexts |
| 3 | `skip-round.spec.ts` | Host skip action sheet, lobby row skipped, suppressed pre-skip votes | Host + 2 voter contexts |
| 4 | `round-history.spec.ts` | Populated history + departed-name resolution | Multi-client, one `leftAt` |
| 5a | `participants.spec.ts` | Viewer role badge + toggle, swipe-kick (mobile), leave-session confirm | Host + 1 joiner |
| 5b | `participant-cap.spec.ts` | 4th joiner vs `HNCH_ROOM_CAP=3` → 4006 reject | Reuse `createParticipant` per `room-full.spec.ts` |
| 7 | `session-ended.spec.ts` | Joiner-side toast on host's End Session | Host clicks real UI; joiner observes |
| 8b | `connection-states.spec.ts` | Disconnected variant only (5,500 ms sustain) | Single context; long wait |

**Reveal-mid-anim** dropped — keep only pre-reveal + post-reveal frames per critique outcome. The transition frame was a known flake source.

`packages/e2e/tests/fixtures/helpers.ts` gets new selector constants for: password sheet, viewer-role toggle, kick swipe affordance, custom-scale editor sheet, session-ended toast, connection chip variants, round-history empty placeholder.

### Skill discovery (Phase 1)

`.claude/commands/{triage,plan,spec,critique}.md` extended to:

- On client/UI work (paths under `packages/client/**`; terms "UI", "screen", "visual", "theme", "layout"), fetch the latest screenshot reference from `main`:
  - URL pattern: `https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/<topic>/<file>.png?raw=true`.
  - `latest` is a symlink maintained by main-CI pointing at the newest `sha-<short>` dir.
- Skill surfaces relevant URLs to the user as visual context primer ("here's what the area currently looks like").
- Phase 4 additionally: `/plan` and `/spec` write `.screenshot-tags` so the dev's hook captures the right scoped subset.

### Cleanup (Phase 1)

| Path | Tracked PNGs | Action |
|---|---|---|
| `screens/` (repo root) | 16 | `git rm -r screens/` |
| `.claude/screens/` | 158 | `git rm -r .claude/screens/` |
| `docs/screenshots/` (legacy feature dirs) | 23 | `git rm -r docs/screenshots/` |

Single cleanup commit in Phase 1. After P1 merges, `main` carries zero PNGs. Phase 2 (main CI) repopulates `docs/screenshots/<sha>/` on its first run.

No `.gitignore` entry for `docs/screenshots/` (per user). Local hook runs write to `docs/screenshots/local/` as ephemeral staging; hook never stages it to the dev's PR branch.

### Bootstrap `screenshots` branch (Phase 1)

Create orphan branch with a single `README.md` explaining purpose ("machine-managed; do not hand-edit; pruned by retention policy on `main`'s CI does NOT apply here — `screenshots` branch is uncapped"). Push.

### Main CI workflow (Phase 2)

New `.github/workflows/screenshots-main.yml`:

- **Trigger:** `push` to `main`, `paths:` filter `packages/{client,shared,e2e/tests/_screenshots,e2e/tests/fixtures}/**`. Does NOT trigger on `docs/screenshots/**` changes (prevents the bot's own commit from refiring).
- **Runner:** self-hosted pool per ADR-0037, gated by `vars.LINUX_RUNNER`.
- **Permissions:** `contents: write`.
- **Steps:**
  1. Checkout `main` (full history).
  2. Install + run relay + client via `playwright.config.ts` `webServer`.
  3. `SCREENSHOT_CAPTURE=1 SCREENSHOT_SHA=sha-${GITHUB_SHA::7} pnpm --filter @hnch/e2e exec playwright test _screenshots --project=chromium --workers=1 --reporter=list` (runs the entire `_screenshots/` directory: `capture.spec.ts` + all per-feature files).
  4. Update `docs/screenshots/latest` symlink: `ln -sfn sha-${GITHUB_SHA::7} docs/screenshots/latest`.
  5. Prune: `cd docs/screenshots && ls -t -d sha-*/ | tail -n +11 | xargs -r rm -rf` (keeps newest 10 sha dirs).
  6. Commit + push: `git add docs/screenshots/ && git commit -m "chore(screenshots): refresh @ sha-${GITHUB_SHA::7} [skip ci]" && git push origin main`.
- **Loop guard:** `paths:` filter excludes `docs/screenshots/**`, and the commit message carries `[skip ci]` as belt-and-suspenders.

### Pre-push hook (Phase 3) — lefthook-based

Repo already uses `lefthook` (per `lefthook.yml`). Add a `pre-push` block:

```yaml
pre-push:
  commands:
    screenshots:
      run: node scripts/screenshot-publish.mjs --mode=hook
      stage_fixed: false
      skip:
        - merge
        - rebase
```

`scripts/screenshot-publish.mjs` (new), invoked by hook with `--mode=hook`:

1. **Detect relevance.** `git diff --name-only @{push} HEAD -- packages/{client,shared,e2e/tests/_screenshots,e2e/tests/fixtures}` → if empty, exit 0.
2. **Detect PR.** `gh pr view --json number --jq .number 2>/dev/null` → if absent, stderr: `"No PR yet for this branch. After 'gh pr create', run 'pnpm screenshots:publish' to upload screenshots."` then exit 0.
3. **Run capture.** Read tag list from `.screenshot-tags` if present (Phase 4); otherwise full suite. `SCREENSHOT_CAPTURE=1 SCREENSHOT_SHA=sha-<short> [SCREENSHOT_TAGS="..."] pnpm --filter @hnch/e2e exec playwright test _screenshots --project=chromium --workers=1` (Playwright `--grep` applied when `SCREENSHOT_TAGS` set).
4. **Publish to `screenshots` branch with retry loop.**

   ```
   for attempt in 1..5:
     git worktree add -f ../.screenshots-tmp screenshots
     git -C ../.screenshots-tmp fetch origin screenshots
     git -C ../.screenshots-tmp reset --hard origin/screenshots
     rsync -a --delete docs/screenshots/sha-<short>/ ../.screenshots-tmp/sha-<short>/
     # NO prune on screenshots branch (uncapped, PR-scoped)
     git -C ../.screenshots-tmp add -A
     git -C ../.screenshots-tmp commit -m "screenshots: PR #<num> @ sha-<short>"
     if git -C ../.screenshots-tmp push origin screenshots; then break
     else: sleep 2; continue   # someone else pushed first; re-fetch + replay
   git worktree remove --force ../.screenshots-tmp
   ```

5. **Update sticky PR comment.** Find by marker `<!-- hnch-screenshots -->`:

   ```
   COMMENT_ID=$(gh api repos/{owner}/{repo}/issues/{N}/comments \
     --jq '.[] | select(.body | startswith("<!-- hnch-screenshots -->")) | .id' | head -1)
   if [ -n "$COMMENT_ID" ]; then
     gh api -X PATCH repos/{owner}/{repo}/issues/comments/$COMMENT_ID -f body="$BODY"
   else
     gh pr comment $PR -b "$BODY"
   fi
   ```

   Body starts with `<!-- hnch-screenshots -->`, then a `## Screenshots @ sha-<short>` heading, then one `![<scene>](https://github.com/IIxauII/hnch/blob/screenshots/sha-<short>/<topic>/<file>.png?raw=true)` per captured scene.

6. **Continue push.** `scripts/screenshot-publish.mjs` exits 0; original `git push` proceeds.

Also exposed as `pnpm screenshots:publish` (script in root `package.json`) — same logic, `--mode=manual`, no `@{push}` diff (always runs full or tag-scoped). For the "no PR at first push" case + manual force.

Bypass: `git push --no-verify` documented in CONTRIBUTING.md as the escape hatch.

### Tag-driven scoping (Phase 4)

- Each scene/`test()` annotated with Playwright tags. Tag catalog in `packages/e2e/README.md`: `@theming`, `@layout`, `@participants`, `@viewer`, `@host`, `@password`, `@reveal`, `@skip`, `@history`, `@scale`, `@connection`, `@session-end`, `@home`, `@onboarding`, `@all` (always-run baseline).
- `.screenshot-tags` (repo root, gitignored — per-author, per-feature) contains a Playwright `--grep` regex (e.g. `@participants|@viewer`).
- `scripts/screenshot-publish.mjs` reads `.screenshot-tags`; missing/empty → full suite.
- Skills `/plan` and `/spec` write `.screenshot-tags` based on the change scope. `/critique` reads it during plan review.

### URL rendering — empirically verified (2026-05-19)

Tested on private repo via issue #265 comment with three URL patterns:

- ❌ `raw.githubusercontent.com/...` — fails (auth required on private repo).
- ✅ `github.com/.../blob/<branch>/<path>?raw=true` — renders inline in `![](...)` on mobile + desktop.
- ✅ `github.com/.../blob/<branch>/<path>` — renders as clickable link, opens image viewer.

All PR sticky comment embeds use pattern B (`?raw=true`).

## ADR impact

**No new ADR.** Per user decision: this is contributor workflow + CI tooling, not a structural application change. Documented in CONTRIBUTING.md + `packages/e2e/README.md` + CLAUDE.md update instead.

ADR-0028 (no telemetry) note added to CONTRIBUTING.md screenshots section: the workflow is developer tooling + repo CI; no outbound channel is added to shipped client/relay/CLI binaries. The `gh` CLI uses contributors' own credentials.

All captured UI states themselves derive from already-accepted ADRs (referenced for traceability): 0017, 0018, 0019, 0020, 0023, 0024, 0025, 0035, 0037, 0040.

## Decisions resolved

1. **Architecture** — two surfaces: PR pre-push hook (scoped) + main CI (full).
2. **Output directory** — `docs/screenshots/<SHA>/<topic>/` runtime path. SHA = `local` (manual) / `sha-<short>` (hook & CI).
3. **Storage on `screenshots` branch** — PR hook publishes here; **uncapped**; sha-keyed dirs per PR push; force-push collisions handled by fetch+reset+retry loop.
4. **Storage on `main`** — main CI commits sha-keyed dirs to `docs/screenshots/`; pruned to last 10; `docs/screenshots/latest` symlink maintained.
5. **Skill discovery** — `docs/screenshots/latest/` on `main` branch (stable symlink path).
6. **Hook tool** — `lefthook` (already in repo), NOT husky.
7. **Trigger glob** — `packages/{client,shared,e2e/tests/_screenshots,e2e/tests/fixtures}/**` (applied to both main CI paths-filter and hook diff-check).
8. **Comment delivery** — sticky via marker `<!-- hnch-screenshots -->`; `gh api` find-by-marker → PATCH; first-time → POST. NOT `--edit-last`.
9. **First-push-no-PR flow** — hook prints notice, exits 0. Author runs `pnpm screenshots:publish` after `gh pr create`. Documented in CONTRIBUTING.md.
10. **Concurrency** — hook does `git fetch + reset --hard origin/screenshots` before each commit attempt, non-force push, retry loop on rejection.
11. **Bypass** — `git push --no-verify` documented.
12. **Scene file split** — per-feature files for multi-client + timing-sensitive; `capture.spec.ts` extensions for single-host states.
13. **Reveal mid-anim** — dropped; pre-reveal + post-reveal only.
14. **Cap-reject setup** — reuse `createParticipant` per `room-full.spec.ts`.
15. **Session-ended mechanic** — real "End Session" UI; joiner observes via toast.
16. **Connection-state simulation** — `setOffline(true)` for `offline`; sustain 5,500 ms for `disconnected`. `connecting` mid-state skipped.
17. **Env vars** — `SCREENSHOT_CAPTURE=1` (gate); `SCREENSHOT_SHA` (output dir); `SCREENSHOT_TAGS` (Phase 4).
18. **Cleanup** — delete `screens/`, `.claude/screens/`, `docs/screenshots/` from `main` in Phase 1 (197 PNG deletions). No `.gitignore` for `docs/screenshots/`.
19. **No new ADR.** Docs only (CLAUDE.md, CONTRIBUTING.md, e2e README).
20. **PR title** — drop `!`; verify scope against allowlist (`scripts/check-commit-scope.sh`).

## Phases

### Phase 1 — Specs, cleanup, docs, skills, bootstrap `screenshots` branch

- **Scope:**
  - `packages/e2e/tests/_screenshots/capture.spec.ts` — add single-host scene blocks; env-driven `OUT_DIR`.
  - `packages/e2e/tests/_screenshots/{password-flow,reveal-transition,skip-round,round-history,participants,participant-cap,session-ended,connection-states}.spec.ts` — new per-feature files.
  - `packages/e2e/tests/fixtures/helpers.ts` — new selector constants.
  - **Cleanup:** `git rm -r screens/ .claude/screens/ docs/screenshots/` (197 PNGs).
  - **Bootstrap `screenshots` branch:** orphan branch with `README.md`.
  - **Docs:**
    - `CLAUDE.md` — rewrite "PR screenshots" section.
    - `CONTRIBUTING.md` — new "Screenshots" section: hook flow, `pnpm screenshots:publish`, `--no-verify` bypass, ADR-0028 scope note.
    - `packages/e2e/README.md` — create or extend: harness, env vars, local invocation, tag catalog (forward-ref to P4).
    - `.claude/commands/{triage,plan,spec,critique}.md` — "Visual context" instruction pointing at `docs/screenshots/latest/` on `main`.
- **Exit bar:**
  - `git ls-files '*.png' | wc -l` returns `0` on `main`.
  - `screenshots` branch exists on origin with README.
  - `SCREENSHOT_CAPTURE=1 SCREENSHOT_SHA=local pnpm --filter @hnch/e2e exec playwright test _screenshots --project=chromium --workers=1` produces all scenes under `docs/screenshots/local/`.
  - `pnpm --filter @hnch/e2e exec playwright test --project=chromium` (no env var) — non-screenshot suite green, screenshot scenes skip.
  - `pnpm --filter @hnch/e2e typecheck` + `lint` clean.
- **PR title scope:** `feat(e2e): canonical screenshot harness; cleanup legacy PNG dirs` (final scope after verifying allowlist with `scripts/check-commit-scope.sh`).
- **Worktree:** `pnpm worktree:add screenshots-harness main` after `git fetch origin`.
- **Depends on:** none.

### Phase 2 — Main CI workflow

- **Scope:**
  - `.github/workflows/screenshots-main.yml` — workflow per Approach.
- **Exit bar:**
  - `actionlint` clean.
  - Smoke: merge a no-op PR touching `packages/client/**`, observe CI run → produces `docs/screenshots/sha-<short>/` on `main`, updates `latest` symlink, commit with `[skip ci]` lands, workflow does NOT refire.
  - `docs/screenshots/latest` resolves to a real sha dir; skills can fetch from `https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/<topic>/<file>.png?raw=true` and the URL renders.
  - Prune retains exactly 10 newest sha dirs after running ≥11 captures.
- **PR title scope:** `feat(ci): add main-branch screenshot refresh workflow`
- **Worktree:** `pnpm worktree:add screenshots-main-ci main` (off P1 merge).
- **Depends on:** Phase 1 merged.

### Phase 3 — Pre-push hook + `screenshots` branch publisher + `pnpm screenshots:publish`

- **Scope:**
  - `lefthook.yml` — add `pre-push` block.
  - `scripts/screenshot-publish.mjs` — Node script implementing Approach §"Pre-push hook (Phase 3)".
  - `package.json` — add `screenshots:publish` script alias.
  - `CONTRIBUTING.md` — concrete hook invocation, bypass flag, troubleshooting.
- **Exit bar:**
  - `lefthook run pre-push` triggers capture when client paths changed.
  - Throwaway PR with `packages/client/**` change exercises full loop: capture → `screenshots` branch push (with retry/reset semantics verified) → sticky comment via marker → inline-renders on mobile + desktop.
  - Concurrent-push simulation (two local clones pushing back-to-back) verified to retry+rebase without data loss.
  - `git push --no-verify` bypasses cleanly.
  - First-push-without-PR: stderr advisory printed; author runs `pnpm screenshots:publish` after `gh pr create` and gets sticky comment.
  - Intervening unrelated PR comment between two hook runs is preserved (marker-based update doesn't clobber it).
- **PR title scope:** `feat(repo): add pre-push screenshot hook + screenshots-branch publisher`
- **Worktree:** `pnpm worktree:add screenshots-hook main` (off P2 merge).
- **Depends on:** Phase 2 merged.

### Phase 4 — Tag taxonomy + AI-driven scope selection

- **Scope:**
  - Tag every `test()` across all `_screenshots/` files (taxonomy in Approach).
  - `scripts/screenshot-publish.mjs` — read `.screenshot-tags`, pass through Playwright `--grep`.
  - `.gitignore` — add `.screenshot-tags`.
  - `packages/e2e/README.md` — tag catalog table.
  - `.claude/commands/{plan,spec}.md` — write `.screenshot-tags` based on change scope.
  - `.claude/commands/critique.md` — read `.screenshot-tags` as part of plan review.
- **Exit bar:**
  - Hook honors `.screenshot-tags` (verified by inspecting Playwright invocation in hook log).
  - Empty/missing `.screenshot-tags` → full suite runs.
  - Skill produces accurate tag sets on representative changes (theming → `@theming`; viewer-style → `@participants @viewer`).
- **PR title scope:** `feat(e2e,repo): tag screenshot scenes + AI-driven scope selection`
- **Worktree:** `pnpm worktree:add screenshots-tags main` (off P3 merge).
- **Depends on:** Phase 3 merged.

## Open questions

- **Cap-reject sustained over multi-PR cycles:** if `screenshots` branch is uncapped, it grows monotonically. Acceptable since PNGs are small (~80 kB each, ~30/PR ≈ 2.4 MB/PR). Revisit if branch exceeds, e.g., 10 GB. Document in `screenshots` README.
- **Symlink portability on the runner:** confirm self-hosted runner (Linux container on Mac mini per ADR-0037) creates symlinks correctly via `ln -sfn`. If not, fall back to a `latest` text-file pointer + skill resolves via `cat`.
- **`docs/screenshots/local/` clutter:** un-gitignored; will appear in `git status`. Mitigation: hook only uses the SHA dir it produced; legacy `local/` is dev convenience. Revisit if annoying.
- **Round history empty-state placeholder:** confirm at P1 spec authoring.
- **Custom scale editor entry path:** `PresetOverrides` location — confirm at P1.
- **Viewer/kick UI surfaces:** exact touch targets desktop vs mobile — confirm at P1.
- **`meta.sessionEndedAt` rendering:** toast vs banner — affects screenshot timing.
- **Self-hosted runner capacity:** screenshot suite (all `_screenshots/` files) on every client-touching merge. Confirm runtime stays under reasonable bound. If excessive, consider parallelizing per spec file.

## Verification plan

Per-phase exit bars are authoritative. Cross-phase static gates at every phase:

- `pnpm --filter @hnch/e2e typecheck`
- `pnpm --filter @hnch/e2e lint`
- `pnpm --filter @hnch/e2e exec playwright test --project=chromium` (non-screenshot suite remains green; screenshot scenes skip without env var)
- `actionlint` on any workflow YAML touched.

## Screenshots

**Required for this plan's PRs:** Each phase's PR exercises the harness against itself.

- Phase 1 PR: reviewer pulls branch, runs `SCREENSHOT_CAPTURE=1 SCREENSHOT_SHA=local pnpm ...` to confirm output.
- Phase 2 PR: post-merge, the workflow's first run produces the inaugural `sha-<short>/` and `latest` symlink on `main`.
- Phase 3 PR: hook runs on the PR's own push; sticky comment proves the loop.
- Phase 4 PR: `.screenshot-tags` demo'd; hook log shows scoped Playwright invocation.

URL rendering for PR comments: verified on private repo 2026-05-19 → `blob/<branch>/...?raw=true`.

## References

- Spec: [docs/specs/e2e-screenshot-coverage-expansion.md](../specs/e2e-screenshot-coverage-expansion.md)
- Issue: [#265](https://github.com/IIxauII/hnch/issues/265)
- URL render test: [#265 comment](https://github.com/IIxauII/hnch/issues/265#issuecomment-4490400848)
- Existing tour spec: `packages/e2e/tests/_screenshots/capture.spec.ts`
- Multi-client patterns: `packages/e2e/tests/{room-full,end-session,auto-reconnect}.spec.ts`
- Selector fixtures: `packages/e2e/tests/fixtures/{helpers.ts,app.fixture.ts}`
- Existing legacy PNG locations removed in P1: `screens/` (16), `.claude/screens/` (158), `docs/screenshots/` (23)
- Hook tool: existing `lefthook.yml`
- Commit scope allowlist: `scripts/check-commit-scope.sh`
- CI runner pool: ADR-0037
- Screenshot commit convention: CLAUDE.md → "PR screenshots" (rewritten in P1)
- Related ADRs: 0017, 0018, 0019, 0020, 0023, 0024, 0025, 0035, 0037, 0040

## Critique resolutions (2026-05-19)

| ID | Severity | Outcome | Note |
|---|---|---|---|
| C1 | Blocker | Accepted | lefthook (not husky) |
| C2 | Medium | Accepted (no ADR) | Note moved to CONTRIBUTING.md; ADR-0028 scope clarified there |
| C3 | High | Accepted | fetch+reset+retry loop, non-force push |
| C4 | High | Accepted (architecture-corrected) | Uncapped on `screenshots` branch; cap-to-10 on `main` only |
| C5 | Medium | Accepted | Dropped `!`; verify scope via `scripts/check-commit-scope.sh` |
| C6 | Medium | Accepted | `pnpm screenshots:publish` script + CONTRIBUTING note |
| C7 | Medium | Accepted | Marker-based PATCH; not `--edit-last` |
| C8 | Medium | Accepted | Expanded glob to `packages/{client,shared,e2e/tests/_screenshots,e2e/tests/fixtures}/**` |
| C9 | Medium | Accepted | Per-feature files for multi-client + timing-sensitive |
| C10 | Low | Rejected | Skills run locally only |
| C11 | Low | Rejected | Dropped mid-anim shot entirely (so flake moot) |
