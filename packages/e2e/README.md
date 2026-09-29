# `@hnch/e2e`

Playwright end-to-end tests for hnch. Multi-client, real-relay scenarios; no mocks.

## Layout

```
tests/
  _screenshots/         # opt-in screenshot capture suite (this README's focus)
  fixtures/             # shared selectors + browser-context helpers
  *.spec.ts             # functional e2e suites
```

## Running functional tests

```sh
pnpm --filter @hnch/e2e exec playwright test --project=chromium
```

The full suite spins up `pnpm dev:relay` and `pnpm dev:client` automatically via `playwright.config.ts` `webServer`. Use `--workers=1` for stability when investigating flakes.

## Screenshot harness

All screenshot specs live under `tests/_screenshots/` and are gated by `SCREENSHOT_CAPTURE=1`. Without the env var, they `test.skip` — they don't run as part of regular CI.

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

Every spec's `shot()` waits for `pageSettled(page)` (`_helpers/settled.ts`) before it captures: exactly one page showing, fully in. Ionic keeps the page being left on screen while the new one slides in, and a shot taken then shows the two on top of each other. Call `shot()` once the content of the new page is known to be there — until then the one page showing is still the old one. A toast that should not be in the picture is waited out with `expect(page.locator('ion-toast:not(.overlay-hidden)')).toHaveCount(0)`; the first `ion-toast` in the page is the connection banner's own and is always hidden.

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

Every `test()` under `_screenshots/` is annotated with one or more Playwright tags. `.screenshot-tags` (worktree root, gitignored) holds a `--grep` regex — `scripts/screenshot-publish.mjs` passes it through. Empty/missing → full suite runs. The file is materialised inside worktrees by `pnpm worktree:add --plan <slug>` (or `HNCH_PLAN_SLUG=<slug> pnpm worktree:bootstrap`), parsed from the plan doc's `## Screenshot tags` section. Skills do not write this file directly; the primary worktree (`main`) should never contain it.

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

**`.screenshot-tags` format.** A single line containing a Playwright `--grep` regex (with optional trailing newline). Tags are space-separated inside test titles, so any tag substring matches. Authoritative source is the plan doc; this file is just the materialised cache inside a worktree. Examples:

```
# capture only viewer + participants scenes
@viewer|@participants

# capture all theming surfaces and the always-run baseline
@theming|@all

# capture reveal + skip flows
@reveal|@skip
```

**Skills (`/plan`, `/spec`, `/critique`).** `/plan` writes a `## Screenshot tags` section into the plan doc — a heading followed by a paragraph whose first inline code span is the regex (e.g. `` `@viewer|@participants` ``). `/spec` does not author tags. `/critique` reads the section from the plan doc and flags scope mismatches. The `.screenshot-tags` file is materialised inside the worktree at `pnpm worktree:add --plan <slug>` time, so parallel worktrees never collide on `main`.

**Tag-to-file map** (one tag → many tests across files; one test → many tags):

| Tag | Files producing scenes |
|---|---|
| `@all` | `capture.spec.ts`, `estimating-shot.spec.ts` |
| `@theming` | `avatar-color.spec.ts`, `capture.spec.ts`, `estimating-shot.spec.ts`, `vote-bars-shot.spec.ts` |
| `@layout` | `agenda-states.spec.ts`, `capture.spec.ts`, `estimating-shot.spec.ts`, `keyboard-shortcuts.spec.ts`, `vote-bars-shot.spec.ts`, `vote-dots-196.spec.ts` |
| `@participants` | `agenda-states.spec.ts`, `avatar-color.spec.ts`, `participant-cap.spec.ts`, `participants.spec.ts` |
| `@viewer` | `participants.spec.ts` |
| `@host` | `agenda-states.spec.ts`, `participants.spec.ts`, `session-ended.spec.ts`, `skip-round.spec.ts` |
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
| `keyboard-shortcuts.spec.ts` | `keyboard/` | shortcuts overlay |
| `vote-bars-shot.spec.ts` | `vote-bars/` | vote distribution bars (light/dark, desktop/mobile) |
| `vote-dots-196.spec.ts` | `vote-dots/` | vote dot layout (issue #196) |
| `estimating-shot.spec.ts` | `layout/` | estimating screen visual hierarchy (issue #191) |
