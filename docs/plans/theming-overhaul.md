# Theming overhaul — implementation plan

Status: shipped 2026-05-15. PR-A1 + PR-A2 #185, PR-A3 #199. Legacy `--hnch-surface{,-2}` aliases dropped + `docs/ionic.md` token contract added in cleanup PR. PR-A4 (high-contrast palette) remains deferred.

## Goal

Tighten the Angular+Ionic client's visual depth and consistency by:

1. Aligning hnch design tokens with Ionic's native theming layer (so native components inherit our palette automatically).
2. Migrating dark-mode base from pure `#000` (current — flat, OLED-harsh) to `#1C1C1E` (Apple HIG) to gain perceived depth and reduce halation.
3. Establishing a hybrid token system: Ionic stepped colors as the substrate (so native Ionic components, separators, and grouped-list backgrounds derive correctly) + a thin `--hnch-elev-{1..3}` layer on top for direction-aware elevation (light mode goes lighter than bg toward `#FFF`; dark mode goes lighter than bg toward `#FFF`).
4. Wiring Ionic semantic colors (`--ion-color-{success,warning,danger}`) to `--hnch-*` so toasts, badges, and chips match the rest of the UI.

Non-goals (defer to a later overhaul):

- High-contrast palette (Ionic 8 `high-contrast.class.css`) — deferred to a later PR-A4 if demand emerges.
- Vote-card visual redesign (option B from the earlier interview).
- Reveal-animation choreography.
- Motion tokens / `prefers-reduced-motion`.
- Dynamic Type / `--ion-dynamic-font` (Ionic 9+ feature; status unclear).
- Wide-viewport (desktop ≥1440) layout rework — separate plan.

## Decisions (locked via interview round)

| Decision | Choice |
|---|---|
| Dark base bg | `#1C1C1E` (Apple HIG) |
| Surface strategy | Hybrid: Ionic stepped-colors substrate + `--hnch-elev-{1..3}` for direction-aware elevation |
| Ionic semantic wirings | All four: `success/warning/danger`, `bg/text`, `medium = muted`, component bgs centralized |
| Rollout | 3 PRs, each in its own worktree (`pnpm worktree:add`) |

## Approach overview

Single source of truth = `packages/client/src/theme/variables.scss`. Three layers, top-down:

```
┌────────────────────────────────────────────────────────────────┐
│ Layer 3 — component CSS-var wiring                              │
│   ion-card{--background}, ion-item{--background}, etc.          │
│   defined in variables.scss, not per-component .scss            │
└────────────────────────────────────────────────────────────────┘
                              ▲
┌────────────────────────────────────────────────────────────────┐
│ Layer 2 — hnch design tokens (semantic API)                     │
│   --hnch-elev-{1..3}, --hnch-text, --hnch-muted,                │
│   --hnch-sep, --hnch-fill, --hnch-{success,warning,danger},     │
│   --hnch-accent-*                                                │
└────────────────────────────────────────────────────────────────┘
                              ▲
┌────────────────────────────────────────────────────────────────┐
│ Layer 1 — Ionic substrate                                       │
│   --ion-background-color, --ion-text-color (+ -rgb)             │
│   --ion-color-primary-* (set by AccentService)                  │
│   --ion-color-{success,warning,danger}-* (semantic)             │
│   --ion-color-medium-* (= --hnch-muted)                         │
│   Stepped colors auto-derived by Ionic from bg/text             │
└────────────────────────────────────────────────────────────────┘
```

Components only touch Layer 2 (`var(--hnch-elev-1)`, `var(--hnch-muted)`, etc.). Layer 1 + 3 live in `variables.scss`. The `AccentService` continues to drive `--ion-color-primary-*` dynamically.

## Token tables

### Dark mode (`:root.ion-palette-dark`)

| Token | Value | Used for |
|---|---|---|
| `--ion-background-color` | `#1C1C1E` | Ionic bg substrate; auto-derives step-50..900 |
| `--ion-background-color-rgb` | `28,28,30` | rgba ops |
| `--ion-text-color` | `#FFFFFF` | Ionic text substrate |
| `--ion-text-color-rgb` | `255,255,255` | rgba ops |
| `--hnch-bg` | `var(--ion-background-color)` | alias |
| `--hnch-elev-1` | `#2C2C2E` | cards, items, lobby panels |
| `--hnch-elev-2` | `#3A3A3C` | popovers, action sheets |
| `--hnch-elev-3` | `#48484A` | active/pressed, nested modal |
| `--hnch-text` | `#FFFFFF` | primary text |
| `--hnch-text-2` | `#F2F2F7` | secondary text |
| `--hnch-muted` | `rgba(235,235,245,0.60)` | tertiary text (unchanged) |
| `--hnch-muted-2` | `rgba(235,235,245,0.30)` | quaternary (unchanged) |
| `--hnch-sep` | `rgba(255,255,255,0.10)` | separators (was `rgba(84,84,88,0.45)` — tighter, web best-practice) |
| `--hnch-sep-strong` | `rgba(255,255,255,0.16)` | strong separators |
| `--hnch-fill` | `rgba(120,120,128,0.32)` | input bg, tinted hits (unchanged) |
| `--hnch-fill-strong` | `rgba(118,118,128,0.40)` | (unchanged) |
| `--hnch-glass` | `rgba(28,28,30,0.66)` | (unchanged) |
| `--hnch-glass-strong` | `rgba(28,28,30,0.82)` | toolbars (slightly stronger) |
| `--hnch-success` / `-rgb` / `-shade` / `-tint` | `#30D158` / `48,209,88` / shade12% / tint10% | semantic — wired to `--ion-color-success-*` |
| `--hnch-warning` | `#FF9F0A` | wired to `--ion-color-warning-*` |
| `--hnch-danger` | `#FF453A` | wired to `--ion-color-danger-*` |
| `--hnch-btn-disabled-bg` | `rgba(255,255,255,0.08)` | (unchanged) |
| `--hnch-btn-disabled-fg` | `rgba(255,255,255,0.50)` | bumped from 0.40 → 0.50 for WCAG 4.5:1 |
| `--hnch-shadow-1` | `0 1px 2px rgba(0,0,0,0.4)` | low elevation (dark mode shadows weak — rely on elev-N) |
| `--hnch-shadow-2` | `0 4px 12px rgba(0,0,0,0.5)` | popovers |
| `--hnch-shadow-3` | `0 12px 32px rgba(0,0,0,0.6)` | modals |

### Light mode (`:root`, default)

| Token | Value |
|---|---|
| `--ion-background-color` | `#F2F2F7` |
| `--ion-background-color-rgb` | `242,242,247` |
| `--ion-text-color` | `#000000` |
| `--ion-text-color-rgb` | `0,0,0` |
| `--hnch-bg` | `var(--ion-background-color)` |
| `--hnch-elev-1` | `#FFFFFF` |
| `--hnch-elev-2` | `#FAFAFB` |
| `--hnch-elev-3` | `#F5F5F7` |
| `--hnch-text` | `#000000` |
| `--hnch-text-2` | `#1C1C1E` |
| `--hnch-muted` | `rgba(60,60,67,0.60)` (unchanged) |
| `--hnch-sep` | `rgba(0,0,0,0.10)` |
| `--hnch-sep-strong` | `rgba(0,0,0,0.18)` |
| `--hnch-btn-disabled-fg` | `rgba(0,0,0,0.40)` (unchanged) |
| `--hnch-shadow-1` | `0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.06)` |
| `--hnch-shadow-2` | `0 4px 12px rgba(0,0,0,0.08)` |
| `--hnch-shadow-3` | `0 12px 32px rgba(0,0,0,0.16)` |

### Component-level wiring (Layer 3, in `variables.scss`)

```scss
ion-card {
  --background: var(--hnch-elev-1);
  --color: var(--hnch-text);
}
ion-item {
  --background: var(--hnch-elev-1);
  --color: var(--hnch-text);
  --border-color: var(--hnch-sep);
}
ion-list {
  background: var(--hnch-bg);
}
ion-toolbar {
  --background: var(--hnch-glass-strong);
  --color: var(--hnch-text);
}
ion-modal {
  --background: var(--hnch-elev-1);
}
ion-popover {
  --background: var(--hnch-elev-2);
}
ion-action-sheet {
  --background: var(--hnch-elev-2);
}
```

### `ion-color-medium` policy

**Decision: Option α** — set `--ion-color-medium: #8E8E93` (Apple system gray, solid hex required by Ionic) + matching `-rgb/-shade/-tint` in `variables.scss`. Existing 12 component call-sites unchanged. Native Ionic components (segment, chip) inherit the same gray.

---

## PR breakdown

Each PR ships in its own worktree (`pnpm worktree:add theming-A{1,2,3}`). Order is strict — A2 depends on A1's tokens, A3 depends on A2's centralization.

### PR-A1 — foundation: Ionic semantic vars + var alignment

**Branch:** `feat/theming-foundation`
**Worktree:** `../hnch-theming-A1`
**Scope size:** small (~4 files, ~80 LOC)

Goal: wire Ionic substrate to hnch tokens without changing any hex values yet. No visible change in either mode beyond toast/badge color alignment.

**Files to edit**

- `packages/client/src/theme/variables.scss`
  - Add `--ion-background-color`, `--ion-background-color-rgb`, `--ion-text-color`, `--ion-text-color-rgb` in both `:root` and `:root.ion-palette-dark`. Set them to current bg/text hex.
  - Add `--ion-color-success`, `-rgb`, `-contrast`, `-contrast-rgb`, `-shade`, `-tint` (and same for warning/danger). Compute shade/tint via Ionic generator math (`mix(#000, base, 12%)` / `mix(#fff, base, 10%)`).
  - Add `--ion-color-medium` (= `var(--hnch-muted)` is a no-go because Ionic needs hex, not rgba). Choose a solid hex equivalent: `#8E8E93` light, `#8E8E93` dark (Apple's system gray). Add `-rgb/-contrast/-shade/-tint` for it.
- `packages/client/src/app/lobby/lobby.page.ts` line 522 — replace `var(--ion-color-step-200, rgba(0, 0, 0, 0.12))` with `var(--hnch-sep)`.
- `packages/client/src/app/home/password-prompt.sheet.ts` line 96 — same replacement.
- `packages/client/src/app/core/accent.service.ts` — switch `shade()` / `tint()` from simple multiplication to `mix`-equivalent math:
  - `shade(base, pct) = mix(#000, base, pct)` → `channel * (1 - pct/100)` per channel (current is equivalent to this for shade; verify byte-exact).
  - `tint(base, pct)  = mix(#fff, base, pct)` → `channel + (255 - channel) * (pct/100)` per channel (matches current).
  - Update `accent.service.test.ts` expected hexes if any drift.
  - Goal: byte-identical output to Ionic's color generator so accent shade/tint match Ionic's stock generation when users override.

**Acceptance**

- `pnpm --filter @hnch/client test` passes (update accent.service.test.ts expected hexes if `shade/tint` math changed).
- Lint + typecheck clean.
- Manual: open client, take screenshots, diff against `.claude/screens/96ec22a/*`. Allowed deltas: toast/badge colors shift to Apple-style greens/oranges/reds; otherwise identical.
- Playwright e2e: full pass.

**Conventional Commit**

```
feat(client): wire Ionic semantic CSS vars to hnch design tokens
```

---

### PR-A2 — surfaces: elevation tiers + dark bg shift + shadows

**Branch:** `feat/theming-surfaces`
**Worktree:** `../hnch-theming-A2`
**Depends on:** PR-A1 merged
**Scope size:** medium (~6 files, ~150 LOC)

Goal: introduce `--hnch-elev-{1..3}` + shadow tokens. Shift dark base bg to `#1C1C1E`. Visible change: dark mode gains depth; cards lift visibly.

**Files to edit**

- `packages/client/src/theme/variables.scss`
  - Update dark-mode `--ion-background-color` to `#1C1C1E` (+ rgb `28,28,30`).
  - Rename `--hnch-surface` → `--hnch-elev-1`, `--hnch-surface-2` → `--hnch-elev-2`, add `--hnch-elev-3`.
  - Keep `--hnch-surface` + `--hnch-surface-2` as `var(--hnch-elev-1)` / `var(--hnch-elev-2)` aliases for one release.
  - Add `--hnch-shadow-{1..3}` tokens for both modes.
  - Tighten dark `--hnch-sep` to `rgba(255,255,255,0.10)` and `-strong` to `rgba(255,255,255,0.16)`.
  - Bump dark `--hnch-btn-disabled-fg` to `rgba(255,255,255,0.50)` (WCAG 4.5:1 check).
- `packages/client/src/theme/_glass.scss` — no edit, but verify glass values still readable on `#1C1C1E` bg (likely fine; values reference variables).
- Run `grep -rn '--hnch-surface' packages/client/src` and migrate to `--hnch-elev-1` (or leave for one release using aliases — decide in review).
- `packages/client/src/app/core/accent.service.test.ts` — no edit if A1 already handled `shade/tint` math.

**Acceptance**

- Manual visual diff vs A1 baseline:
  - Dark home: page bg now `#1C1C1E`; "Create Room" / "Join Room" cards now `#2C2C2E` and visibly lifted.
  - Dark lobby: same lift for "Share invite / Show QR" + Participants panel.
  - Dark estimating: card grid background lifts; numbers no longer read as "disabled."
  - Light mode: imperceptible (cards stay white, bg stays `#F2F2F7`).
- A11y: run Axe on home + lobby + estimating in both modes. No new failures. Disabled-button contrast ≥ 4.5:1 (verify with a contrast checker; current `0.40` may still pass on `#2C2C2E` — measure).
- Run e2e visual snapshot suite if one exists; update baselines explicitly.

**Conventional Commit**

```
feat(client)!: shift dark base bg to #1C1C1E + introduce elevation tiers

BREAKING CHANGE: --hnch-surface renamed to --hnch-elev-1 (alias kept for
one release). External consumers should migrate.
```

(Breaking only if downstream consumes our SCSS; in practice internal — judgment call on the `!` and `BREAKING CHANGE` footer at PR time.)

---

### PR-A3 — polish: component-level centralization

**Branch:** `feat/theming-centralize`
**Worktree:** `../hnch-theming-A3`
**Depends on:** PR-A2 merged
**Scope size:** medium (~10 files, ~120 LOC)

Goal: centralize Ionic component backgrounds in `variables.scss`. Remove scattered per-component `--background` overrides so one place drives all surfaces.

**Files to edit**

- `packages/client/src/theme/variables.scss` — add the Layer 3 component-wiring block (ion-card / ion-item / ion-list / ion-toolbar / ion-modal / ion-popover / ion-action-sheet).
- Remove now-redundant per-component `--background` overrides across:
  - `packages/client/src/app/lobby/lobby.page.ts`
  - `packages/client/src/app/estimating/avatar-vote-row.component.ts`
  - `packages/client/src/app/session-settings/*.sheet.ts`
  - `packages/client/src/app/home/password-prompt.sheet.ts`
  - … grep for `--background:` under `packages/client/src/app/**.ts` and audit each.

**Acceptance**

- Centralization: grep confirms no per-component `--background:` overrides remain except where intentional (e.g., glass-on-toolbar, modal-centered).
- Visual diff vs A2 baseline: imperceptible (component bgs unchanged, just sourced from one place).
- e2e: full pass.
- Schema/Preferences: `pnpm --filter @hnch/client test` clean.

**Conventional Commit**

```
refactor(client): centralize Ionic component backgrounds in variables.scss
```

### PR-A4 — future: high-contrast palette (deferred)

Not in scope of this overhaul. If/when demand emerges, ship as:

- `@import "@ionic/angular/css/palettes/high-contrast.class.css"` (+ `-dark`) in `global.scss`.
- Independent `Increase contrast` toggle in Settings > Appearance (orthogonal to System/Light/Dark, mirrors iOS Accessibility).
- New `hnch.high-contrast` boolean preference. No migration on existing theme values.
- Verify all 4 combos (light, light-HC, dark, dark-HC) + accent interaction.

---

## Verification matrix (run before each PR's merge)

| Check | Command |
|---|---|
| Lint | `pnpm --filter @hnch/client lint` |
| Typecheck | `pnpm --filter @hnch/client typecheck` |
| Unit tests | `pnpm --filter @hnch/client test` |
| e2e | `pnpm --filter @hnch/e2e test` |
| Visual diff | manual screenshot capture vs `.claude/screens/<base-sha>/*` |
| A11y | Axe via Chrome DevTools on Home / Lobby / Estimating, light + dark |

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Dark bg shift causes regressions on screens we don't inspect | Capture before/after screenshots for all 23 e2e screen scenarios in `.claude/screens/`. |
| Renaming `--hnch-surface` breaks external consumers | Ship aliases for one release; audit downstream via grep. |
| Disabled-state contrast drift in PR-A2 | Verify with contrast checker on actual `--hnch-elev-1` (`#2C2C2E`) bg. |
| Centralized component bgs break a half-sheet's custom look | Audit each removed override individually; keep ones with intentional contrast. |
| `--ion-color-medium` hex change shifts native Ionic muted text app-wide | Choose hex within ~5% of Ionic's default Apple-gray `#8E8E93` to minimize delta. |

## ADRs needed

None — this overhaul does not change the *shape* of any system. It refines values in the theming layer. Document the new `--hnch-elev-{1..3}` + shadow token contract in `docs/ionic.md` after PR-A2 ships.

## Out-of-band follow-ups (not in this plan)

- Vote-card visual overhaul (option B from earlier interview).
- Wide-viewport desktop layout — current 640px column wastes space at 1440.
- Motion tokens + `prefers-reduced-motion`.
- Dynamic Type via `--ion-dynamic-font` once Ionic clarifies support.
