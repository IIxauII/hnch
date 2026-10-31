# `@hnch/e2e`

Playwright end-to-end tests for hnch. Multi-client, real-relay scenarios; no mocks.

## Layout

```
scripts/
  serve-static.mjs      # serves the built client for E2E_CLIENT=build (unit tests: pnpm --filter @hnch/e2e test:unit; the CI e2e job runs them before Playwright)
tests/
  _screenshots/         # opt-in screenshot capture suite (this README's focus)
  fixtures/             # shared selectors + browser-context helpers (incl. the 375px sheet openers)
  *.spec.ts             # functional e2e suites
```

## Running functional tests

```sh
pnpm --filter @hnch/e2e exec playwright test --project=chromium
```

The full suite starts the relay and the client automatically via `playwright.config.ts` `webServer`. Use `--workers=1` for stability when investigating flakes.

### Which client the tests load

`E2E_CLIENT` picks how the client is served:

| Value | What runs | Default |
|---|---|---|
| `dev` | `ng serve` (`pnpm --filter @hnch/client dev`) with its file watcher | local runs, including `pnpm test:e2e` |
| `build` | `ng build --configuration e2e` into `packages/client/dist/e2e`, then `scripts/serve-static.mjs` serves it, with `index.html` for app routes | whenever `CI` is set (the `E2E (Playwright)` job and `screenshots-main.yml`) |

The `build` mode runs the optimised bundle users get, and no dev server competes with the browsers for CPU. The `e2e` configuration has no `fileReplacements`, so it keeps `environment.ts` and reaches the relay on the page's own port (worktree and CI ports work with no extra config). Production builds and deploys are unaffected: they keep their own `production` configuration and `www/` output.

- To run locally against what CI runs: `CI=1 pnpm test:e2e` (also gets the CI timeouts below and `maxFailures: 1`), or `E2E_CLIENT=build pnpm test:e2e` for the build alone.
- The build is not watched: with `build`, a client edit only shows up in the next run, which rebuilds (about 15 s locally).
- Outside CI, Playwright reuses whatever already listens on `CLIENT_PORT`. A running `pnpm dev:client` there means `E2E_CLIENT=build` still tests the dev server.

### Timeouts

Every test gets 45 s. With `CI` set, each action (click, fill, locator wait) also stops after 10 s and each navigation (`goto`, `reload`, `waitForURL`) after 15 s, so a lost click or a URL that never comes fails with an error naming that call instead of using up the test budget. Run with `CI=1` to get the same limits locally.

- A call that legitimately waits longer passes its own `timeout` (host election and reconnect waits use 15 s).
- A test that is slow as a whole, not stuck, sets its own budget with `test.setTimeout(...)` in the test body, never in the config. Example: the 6th-room eviction test in `recent-rooms-list.spec.ts`.
- `waitForTimeout` and `expect(...)` assertions are not covered by these limits; assertions keep the 5 s expect default.

## Screenshot harness

All screenshot specs live under `tests/_screenshots/` and are gated by `SCREENSHOT_CAPTURE=1`. Each one opens with the same file-level line:

```ts
test.skip(!process.env['SCREENSHOT_CAPTURE'], 'set SCREENSHOT_CAPTURE=1 to run');
```

That gives two separate switches:

- **App tests** (`pnpm --filter @hnch/e2e test`, the CI `E2E (Playwright)` job, no `SCREENSHOT_CAPTURE`): every test under `_screenshots/` is reported as skipped; none of them runs.
- **Capture** (`SCREENSHOT_CAPTURE=1 … playwright test _screenshots`): every screenshot spec runs and writes its PNGs.

A new screenshot spec starts with that line too. An assertion that must hold on every PR (a regression guard) belongs in an app spec under `tests/`, not under `_screenshots/`. The 375px sheet guards moved to `sheet-actions-mobile.spec.ts` for that reason (#594).

### Two surfaces

- **PR flow** — `lefthook` pre-push hook runs a scoped subset and publishes to the `screenshots` branch. See `CONTRIBUTING.md → Screenshots`.
- **Main flow** — `.github/workflows/screenshots-main.yml` runs the full suite on every push to `main` and commits to `docs/screenshots/<sha>/`.

### Env vars

| Var | Default | Purpose |
|---|---|---|
| `SCREENSHOT_CAPTURE` | unset | When set (`1`), unlocks the screenshot specs. Without it, they skip. |
| `SCREENSHOT_SHA` | `local` | Output subdir name. CI/hook pass `sha-<short>`; manual runs default to `local`. |
| `SCREENSHOT_TAGS` | unset | Playwright `--grep` regex — narrows capture to scenes tagged with the listed tags (Phase 4). |
| `HNCH_ROOM_CAP` | unset | Relay-side participant cap, exercised by `participant-cap.spec.ts`. |

### Output

`docs/screenshots/<SHA>/<feature>/<scene>.png` — relative to repo root. Every spec resolves its `OUT_DIR` via the shared helper:

```ts
import { resolveOutDir } from './_helpers/out-dir';

const OUT_DIR = resolveOutDir('reveal'); // → docs/screenshots/<sha>/reveal/
```

`<feature>` is the spec's primary `@tag` (see Tag catalog below). When two specs share one feature subfolder (e.g. `participants.spec.ts` + `participant-cap.spec.ts` both → `participants/`), each spec prefixes its PNG filenames with its basename to avoid collisions: `participants-01-roster.png` vs `participant-cap-01-lobby.png`.

The helper writes `mkdir -p` only when called — never at module import — so it is safe to import from non-test modules.

### Taking the shot

A spec's `shot()` waits for `pageSettled(page)` (`_helpers/settled.ts`) before it captures: exactly one page showing, fully in. Ionic keeps the page being left on screen while the new one slides in, and a shot taken then shows the two on top of each other. Call `shot()` once the content of the new page is known to be there — until then the one page showing is still the old one. (A few specs wait a fixed moment instead: `reveal-transition.spec.ts`, which is there to catch the reveal *while* it moves, and the two phone form specs, `round-start-mobile.spec.ts` and `agenda-item-form-mobile.spec.ts`, which capture a sheet over a page that has not changed.)

A toast that should not be in the picture is waited out with `expect(page.locator('ion-toast:not(.overlay-hidden)')).toHaveCount(0)`. Count the ones that are showing, never the elements: the Lobby and the round screen each carry an `ion-toast` of the connection banner's, which stays in the page and is hidden unless the connection has just come back.

### Local manual run

```sh
SCREENSHOT_CAPTURE=1 SCREENSHOT_SHA=local \
  pnpm --filter @hnch/e2e exec playwright test _screenshots \
  --project=chromium --workers=1
```

### Spec organization

- **`capture.spec.ts`** — single-host linear tour (onboarding → home → settings → join → lobby → estimating → results). Add single-context, single-viewport scenes here.
- **`<feature>.spec.ts`** — multi-client + timing-sensitive scenes (password, reveal, skip, history, participants, cap, session-end, connection). One file per UI surface.

### Tag catalog

Every `test()` under `_screenshots/` is annotated with one or more Playwright tags. `.screenshot-tags` (worktree root, gitignored) holds a `--grep` regex — `scripts/screenshot-publish.mjs` passes it through. Empty/missing → full suite runs. Write the file when creating a worktree with `pnpm worktree:add <name> [base] --tags "<grep>"`, or by hand inside the worktree. Skills do not write this file; the primary worktree (`main`) should never contain it.

| Tag | Scope |
|---|---|
| `@all` | always-run grep-narrowing keyword — tag applied to every scene-test so a tag-scoped run includes the baseline |
| `@baseline` | the canonical home/lobby/estimating tour (`capture.spec.ts`). Slug for the `baseline/` subfolder |
| `@theming` | color/theme/accent surfaces |
| `@layout` | layout-only changes (header, footer, padding) |
| `@participants` | participant list, roster |
| `@viewer` | viewer-role badges + toggles |
| `@host` | host-only actions |
| `@password` | password sheet + wrong-password reject |
| `@reveal` | pre/post-reveal frames |
| `@skip` | host skip action + suppressed votes |
| `@history` | round history |
| `@scale` | scale picker, custom scale editor, preset overrides |
| `@connection` | online / reconnecting / offline / disconnected |
| `@session-end` | host End Session → joiner toast |
| `@home` | home and the list of recent sessions |
| `@onboarding` | first-run name entry |
| `@agenda` | agenda states (`agenda-states.spec.ts`) |
| `@keyboard` | keyboard shortcuts surfaces (`keyboard-shortcuts.spec.ts`) |
| `@vote-bars` | vote distribution bars (`vote-bars-shot.spec.ts`) |
| `@vote-dots` | vote dot layout (`vote-dots-196.spec.ts`) |
| `@estimating` | Estimating page baseline + card interactions (`estimating-shot.spec.ts`) |

**Slug ≠ tag exactly.** Tags drive `--grep` scope selection; the OUT_DIR feature-slug is the *primary* tag of each spec (the one in the table above), and it is the name of the subfolder under `docs/screenshots/<sha>/`. `@all` is grep-only — it never appears as a slug.

**`.screenshot-tags` format.** A single line containing a Playwright `--grep` regex (with optional trailing newline). Tags are space-separated inside test titles, so any tag substring matches. The file is per worktree and gitignored. Examples:

```
# capture only viewer + participants scenes
@viewer|@participants

# capture all theming surfaces and the always-run baseline
@theming|@all

# capture reveal + skip flows
@reveal|@skip
```

**Choosing the regex.** Pick the tags whose scenes the change is likely to affect (e.g. `` `@viewer|@participants` `` for a viewer-role change) and include `@all` when the home/lobby/estimating baseline tour is affected. `/critique` flags a tag scope that misses obviously affected surfaces. Because the file lives inside the worktree, parallel worktrees never collide on `main`.

**Tag-to-file map** (one tag → many tests across files; one test → many tags):

| Tag | Files producing scenes |
|---|---|
| `@all` | `capture.spec.ts`, `estimating-shot.spec.ts` |
| `@theming` | `avatar-color.spec.ts`, `capture.spec.ts`, `estimating-shot.spec.ts`, `vote-bars-shot.spec.ts` |
| `@layout` | `agenda-item-form-mobile.spec.ts`, `agenda-states.spec.ts`, `capture.spec.ts`, `estimating-shot.spec.ts`, `keyboard-shortcuts.spec.ts`, `round-start-mobile.spec.ts`, `vote-bars-shot.spec.ts`, `vote-dots-196.spec.ts` |
| `@participants` | `agenda-states.spec.ts`, `avatar-color.spec.ts`, `participant-cap.spec.ts`, `participants.spec.ts` |
| `@viewer` | `participants.spec.ts` |
| `@host` | `agenda-item-form-mobile.spec.ts`, `agenda-states.spec.ts`, `participants.spec.ts`, `round-start-mobile.spec.ts`, `session-ended.spec.ts`, `skip-round.spec.ts` |
| `@password` | `password-flow.spec.ts` |
| `@reveal` | `reveal-transition.spec.ts`, `vote-bars-shot.spec.ts` |
| `@skip` | `skip-round.spec.ts` |
| `@history` | `room-history.spec.ts`, `round-history.spec.ts` |
| `@scale` | `vote-dots-196.spec.ts` |
| `@connection` | `capture.spec.ts`, `connection-states.spec.ts` |
| `@session-end` | `session-ended.spec.ts` |
| `@home` | `capture.spec.ts`, `room-history.spec.ts` |
| `@onboarding` | `keyboard-shortcuts.spec.ts` |
| `@estimating` | `estimating-shot.spec.ts` |

### Scene index

| File | Subfolder | Scenes |
|---|---|---|
| `capture.spec.ts` | `baseline/` | Onboarding, home, settings page, join page, lobby, session-settings sheet, scale picker, session settings with a password set, QR modal, lobby host menu, round-start modal, estimating, estimating w/ card selected, lobby results, custom scale editor, preset toggle, round-history empty, empty home, connection banner reconnecting + reconnected |
| `password-flow.spec.ts` | `password/` | session settings with the password set; protected lobby; password field on join; wrong-password reject |
| `reveal-transition.spec.ts` | `reveal/` | pre-reveal all-voted; post-reveal lobby |
| `skip-round.spec.ts` | `skip/` | host skip action; lobby skipped row; suppressed pre-skip votes |
| `round-history.spec.ts` | `history/` (prefixed `round-history-`) | populated history; departed-name resolution |
| `room-history.spec.ts` | `history/` (prefixed `room-history-`) | home empty / one / two / five sessions; × focused (desktop + mobile) |
| `participants.spec.ts` | `participants/` (prefixed `participants-`) | observer role switch; host actions menu on a row (mobile action sheet, desktop popover); leave-session confirm |
| `participant-cap.spec.ts` | `participants/` (prefixed `participant-cap-`) | 4th joiner vs `HNCH_ROOM_CAP=3` → close 4006 |
| `session-ended.spec.ts` | `session-end/` | joiner-side toast on host's End Session |
| `connection-states.spec.ts` | `connection/` | reconnecting banner (desktop + mobile) |
| `avatar-color.spec.ts` | `theming/` | settings palette default + Pink; lobby + estimating with chosen color |
| `agenda-states.spec.ts` | `agenda/` | empty agenda; add sheet open/filled; 3-item list; story menu; edit sheet; mid-session consumed; skipped/removed; joiner on mobile |
| `agenda-item-form-mobile.spec.ts` | `agenda/` (numbered `12-`, `13-`) | story form sheet at 375px, add mode and edit mode |
| `round-start-mobile.spec.ts` | `round-start/` | round-start sheet at 375px |
| `keyboard-shortcuts.spec.ts` | `keyboard/` | shortcuts overlay |
| `vote-bars-shot.spec.ts` | `vote-bars/` | vote distribution bars (light/dark, desktop/mobile) |
| `vote-dots-196.spec.ts` | `vote-dots/` | vote dot layout (issue #196) |
| `estimating-shot.spec.ts` | `layout/` | estimating screen visual hierarchy (issue #191) |
