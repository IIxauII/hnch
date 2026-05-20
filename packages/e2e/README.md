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

Every `test()` under `_screenshots/` is annotated with one or more Playwright tags. `.screenshot-tags` (repo root, gitignored) holds a `--grep` regex — `scripts/screenshot-publish.mjs` passes it through. Empty/missing → full suite runs.

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
| `@home` | home and last-session card |
| `@onboarding` | first-run name entry |
| `@agenda` | agenda states (`agenda-states.spec.ts`) |
| `@keyboard` | keyboard shortcuts surfaces (`keyboard-shortcuts.spec.ts`) |
| `@vote-bars` | vote distribution bars (`vote-bars-shot.spec.ts`) |
| `@vote-dots` | vote dot layout (`vote-dots-196.spec.ts`) |

**Slug ≠ tag exactly.** Tags drive `--grep` scope selection; the OUT_DIR feature-slug is the *primary* tag of each spec (the one in the table above), and it is the name of the subfolder under `docs/screenshots/<sha>/`. `@all` is grep-only — it never appears as a slug.

**`.screenshot-tags` format.** A single line containing a Playwright `--grep` regex. Tags are space-separated inside test titles, so any tag substring matches. Examples:

```
# capture only viewer + participants scenes
@viewer|@participants

# capture all theming surfaces and the always-run baseline
@theming|@all

# capture reveal + skip flows
@reveal|@skip
```

**Skills (`/plan`, `/spec`).** When the requested change scope is known, the skill writes `.screenshot-tags` so the next pre-push run captures only the relevant scenes. `/critique` reads `.screenshot-tags` and flags scope mismatches during plan review.

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

### Scene index

| File | Subfolder | Scenes |
|---|---|---|
| `capture.spec.ts` | `baseline/` | Onboarding, home, home overflow, settings page, join page, lobby, session-settings sheet, scale picker, access picker, QR modal, lobby overflow, round-start modal, estimating, estimating w/ card selected, lobby results, custom scale editor, preset toggle, round-history empty, empty home, connection chip offline + reconnected |
| `password-flow.spec.ts` | `password/` | password sheet on join; wrong-password reject |
| `reveal-transition.spec.ts` | `reveal/` | pre-reveal all-voted; post-reveal lobby |
| `skip-round.spec.ts` | `skip/` | host skip action; lobby skipped row; suppressed pre-skip votes |
| `round-history.spec.ts` | `history/` (prefixed `round-history-`) | populated history; departed-name resolution |
| `room-history.spec.ts` | `history/` (prefixed `room-history-`) | home empty / one / two / five rooms; swipe-remove; hover-x |
| `participants.spec.ts` | `participants/` (prefixed `participants-`) | viewer role badge + toggle; swipe-kick (mobile); leave-session confirm |
| `participant-cap.spec.ts` | `participants/` (prefixed `participant-cap-`) | 4th joiner vs `HNCH_ROOM_CAP=3` → close 4006 |
| `session-ended.spec.ts` | `session-end/` | joiner-side toast on host's End Session |
| `connection-states.spec.ts` | `connection/` | sustained disconnected (≥5,500 ms) |
| `avatar-color.spec.ts` | `theming/` | settings palette default + Pink; lobby + estimating with chosen color |
| `agenda-states.spec.ts` | `agenda/` | empty agenda; add sheet open/filled; 3-item list; edit sheet; mid-session consumed; skipped/cancelled; joiner mobile collapsed/expanded |
| `keyboard-shortcuts.spec.ts` | `keyboard/` | shortcuts overlay |
| `vote-bars-shot.spec.ts` | `vote-bars/` | vote distribution bars (light/dark, desktop/mobile) |
| `vote-dots-196.spec.ts` | `vote-dots/` | vote dot layout (issue #196) |
| `estimating-shot.spec.ts` | `layout/` | estimating screen visual hierarchy (issue #191) |
