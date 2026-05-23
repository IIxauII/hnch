# Plan — Theme + Accent preview chips (#251)

## Context

PR #246 (merged as 969083a) shipped the Avatar color row in Settings with a colored preview chip rendered via `<span class="avatar-preview" slot="end">`. Theme and Accent rows live in the **Appearance** section directly below and use bare `ion-select` rows with no `slot="end"` content — visual rhythm breaks.

Issue #213 (swatch-grid replacement of `ion-select`) was closed in favor of this chip-only polish. Scope here is **presentational only**: no service changes, no ADR, no schema/protocol surface.

## Goal

Bring Theme + Accent rows to visual parity with the Avatar color row by adding right-aligned previews:
- **Accent:** colored circular swatch reflecting the resolved accent base color (`--hnch-accent`).
- **Theme:** small icon reflecting current selection (`sunny-outline` / `moon-outline` / `contrast-outline` for system).

## Files touched

Single package: `packages/client`. Single-scope PR — `fix(client):` or `feat(client):` (lean `fix` since it's polish parity).

### 1. `packages/client/src/app/settings/settings.page.ts`

**Template — Theme row (lines ~119–128 on main):**

Add `slot="end"` icon after the `ion-select`:

```html
<ion-item>
  <ion-select label="Theme" interface="popover" ...>
    ...
  </ion-select>
  <ion-icon
    slot="end"
    aria-hidden="true"
    class="appearance-preview-icon"
    [name]="themeIconName()"
  ></ion-icon>
</ion-item>
```

**Template — Accent row (lines ~131–143 on main):**

Add `slot="end"` swatch after the `ion-select`:

```html
<ion-item>
  <ion-select label="Accent" interface="popover" ...>
    ...
  </ion-select>
  <span
    class="appearance-preview"
    aria-hidden="true"
    slot="end"
    [style.background]="accentResolvedColor()"
  ></span>
</ion-item>
```

**Component — new computeds + icon imports:**

```ts
import { contrastOutline, moonOutline, sunnyOutline } from 'ionicons/icons';
// addIcons({ contrastOutline, moonOutline, sunnyOutline, ...existing });

protected readonly themeIconName = computed(() => {
  switch (this.themeService.theme()) {
    case 'light': return 'sunny-outline';
    case 'dark':  return 'moon-outline';
    default:      return 'contrast-outline'; // 'system'
  }
});

protected readonly accentResolvedColor = computed(() => {
  // AccentService.currentDef() returns the dark-mode-aware ColorDef.
  // If no `currentDef` getter exists, derive from ACCENTS / ACCENTS_DARK_OVERRIDE
  // using accentService.accent() + themeService.resolvedTheme() (or matchMedia
  // for 'system'). Pick whichever already exists; do NOT add public API.
  return this.accentService.currentDef().base;
});
```

> Verification step (during impl): `grep -n "currentDef\|ACCENTS_DARK_OVERRIDE" packages/client/src/app/core/accent.service.ts` — if no public helper exists, either inline the dark-override logic in the computed (cheap, ~6 lines) or add a minimal `currentDef()` getter. Prefer inline first to keep the PR pure-presentational.

**Styles:**

Rename / extract the existing `.avatar-preview` rule to a shared class so all three rows reuse it. Two acceptable paths — pick **A** unless extraction churn looks heavier than expected:

- **A. Rename `.avatar-preview` → `.appearance-preview`** and update the one consumer (avatar color row). Single canonical class.
- **B. Add `.appearance-preview` next to `.avatar-preview`** as duplicate rule. Lower risk, mild duplication. Skip if (A) is one-line in the template.

```scss
.appearance-preview {
  display: inline-block;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: 1px solid var(--ion-color-step-300, #ccc);
}
.appearance-preview-icon {
  font-size: 1.25rem;
  color: var(--ion-color-medium);
}
```

### 2. `packages/client/src/app/settings/settings.page.test.ts`

Add lightweight assertions:
1. Theme row renders the expected icon name for each of `'system' | 'light' | 'dark'`.
2. Accent row renders a `.appearance-preview` with `background` set to the resolved accent color (assert non-empty `style.background`, not exact hex — keeps tests resilient to palette tweaks).
3. Renaming `.avatar-preview` → `.appearance-preview`: update any existing matcher in the file that references the old class name. Run `grep -n avatar-preview packages/client` first.

No new test file. Keep within existing `SettingsPage` describe block.

## Acceptance (from #251)

1. ✅ Accent row shows circular swatch matching selected accent base color.
2. ✅ Theme row shows small icon reflecting selection.
3. ✅ Visual rhythm (spacing, chip size) matches Avatar color row.
4. ✅ `aria-hidden="true"` on chip + icon; existing select labels preserved as screen-reader anchors.

## Out of scope

- AccentService / ThemeService API additions beyond what's needed for the resolved color (prefer inline).
- Swatch grid / half-sheet replacement of `ion-select` (was #213, closed).
- Custom… accent option.
- Dark-mode override audit beyond what `currentDef()` already does.

## Verification

- `pnpm --filter @hnch/client test` — settings.page.test passes.
- `pnpm --filter @hnch/client lint && pnpm --filter @hnch/client typecheck`.
- Manual: mobile (390×844) + portal (1440×900). Toggle Theme system→light→dark, watch icon swap. Toggle Accent across 3 keys, watch swatch swap. Dark mode: confirm `racing-green` / `graphite` swatches differ from light (covered by `currentDef()` if used).
- Screenshot: commit `docs/screenshots/theme-accent-chips/{before,after}-{light,dark}.png` to branch, link in PR comment per CLAUDE.md PR-screenshot rule.

## Worktree

Single small PR — worktree optional but recommended per repo convention:

```
pnpm worktree:add theme-accent-chips main
```

## Risks

- **Icon name** — verify `addIcons` registration covers the three names. Settings page likely already registers some ionicons; check before adding.
- **`currentDef()` may not exist** — fall back to inline dark-override logic. Plan does NOT mandate service changes.
- **Class rename touches PR #246 code** — keep the rename minimal (one `class=` swap in template, one CSS selector). If any other file references `.avatar-preview`, switch to path B (duplicate rule).

## Commit / PR

- Type: `fix(client): theme + accent preview chips in settings`
- Body: link #251, note #213 closed in favor.
- No ADR.
