# Lobby subtitle tap affordance on mobile

**Status:** Draft (post-critique)
**Date:** 2026-05-20
**Source spec:** docs/specs/lobby-subtitle-tap-affordance.md
**Shape:** Single PR

## Summary

Add a trailing `pencil-outline` icon to the Lobby subtitle button when viewed by the host, signaling tap-to-edit on mobile where hover affordances do not exist. Guard the button against the empty-subtitle state. Non-hosts see an `<ion-chip outline>` (non-interactive scale label) instead of the button, fully removing the affordance.

## Approach

Pure presentational change in `packages/client/src/app/lobby/lobby.page.ts`.

### Template

Within the existing outer `@if (roomCode())` block (opens line 199, closes line 216), the room-code copy button stays unchanged. Replace lines 209–215 with:

```
@if (subtitle()) {
  @if (isHost()) {
    <button
      type="button"
      class="subtitle"
      [attr.aria-label]="'Edit session settings: ' + subtitle()"
      (click)="openSessionSettings()"
    >
      <span>{{ subtitle() }}</span>
      <ion-icon name="pencil-outline" aria-hidden="true"></ion-icon>
    </button>
  } @else {
    <ion-chip outline class="subtitle-chip" aria-live="polite">
      {{ subtitle() }}
    </ion-chip>
  }
}
```

The new `@if (subtitle())` opens AFTER the room-code button (line 208) and closes BEFORE the existing outer `}` (line 216) — the copy button is NOT folded under the new guard.

### Styles

`.subtitle` (~line 580): add `display: inline-flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;`. Inner text span gets `min-width: 0;` so long custom-scale names wrap inside the text span rather than orphaning the icon.

```
.subtitle ion-icon {
  font-size: 1rem;
  color: inherit;
  transition: color 120ms ease;
}
```

`color: inherit` makes the icon follow the button's color token, so the existing hover transition on `.subtitle` propagates to the icon.

`.subtitle-chip`: minimal — inherit muted text color so visual weight roughly matches today's non-host subtitle. No `(click)` binding — non-interactive.

### Icons

`pencil-outline` already registered via `addIcons()` (verified at line 908 by critic). No new icon imports.

Visual baseline:
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/lobby-host.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/lobby-voter.png?raw=true

## ADR impact

- None. Pure UX/client change. No ADR touched.

## Decisions resolved

1. **Icon choice** — `pencil-outline` (already registered, matches edit intent).
2. **Non-host element** — `<ion-chip outline>` (non-interactive). Drops `<button>` semantics, hover color, focus ring, and SR "button" label so affordance is truly removed for non-hosts.
3. **Empty subtitle guard** — `@if (subtitle())` wraps the entire host/non-host branch; placed strictly between the room-code button and the existing outer `}`.
4. **Icon size** — `1rem`.
5. **aria-label** — `"Edit session settings: {{subtitle()}}"` on host button — preserves round/scale context plus action intent.
6. **Icon color/transition** — `color: inherit` + `transition: color 120ms ease` on icon so hover color shift propagates smoothly.
7. **Long-name wrapping** — `flex-wrap: wrap` on `.subtitle` and `min-width: 0` on the text span to avoid orphaning the icon on a new line at 320 px with long custom scales.
8. **Screenshot scope** — `.screenshot-tags = @host|@layout|@viewer|@participants` to cover non-host visual variant.
9. **Unit tests** — add coverage in `lobby.page.spec.ts` for the three branches (host w/ icon, non-host chip, empty subtitle).
10. **PR shape** — single PR.

## Phases

### Phase 1 — Subtitle affordance

- **Scope:** `packages/client/src/app/lobby/lobby.page.ts` (template + styles), `packages/client/src/app/lobby/lobby.page.spec.ts` (new branch coverage).
- **Exit bar:** AC-1..AC-10 below all green; client typecheck, lint, unit tests, build pass; `@host|@layout|@viewer|@participants` screenshot subset captured and PR comment updated.
- **PR title scope:** `feat(client): add pencil icon affordance to lobby subtitle button`
- **Worktree:** `pnpm worktree:add lobby-subtitle-affordance main` after `git fetch origin`.
- **Depends on:** none.

## Acceptance criteria

- AC-1: When host AND `subtitle()` non-empty, `<button class="subtitle">` renders with trailing `pencil-outline` icon and `aria-label="Edit session settings: <subtitle text>"`.
- AC-2: When non-host AND `subtitle()` non-empty, an `<ion-chip outline class="subtitle-chip">` renders with the subtitle text and NO button, NO icon, NO hover color shift, NO focus ring.
- AC-3: When `subtitle()` empty, neither button nor chip renders in DOM.
- AC-4: Host button preserves `focus-visible` outline and the existing hover→`--hnch-text` color shift; icon follows the same hover transition via `color: inherit`.
- AC-5: Icon uses inherited color (no hardcoded literal) and respects light/dark/system theme switch.
- AC-6: At 320 px width with a long custom scale name (e.g. 20-char custom scale label), the pencil icon does not orphan onto its own line — it wraps with the trailing word of the subtitle text via `flex-wrap` + `min-width: 0`.
- AC-7: Screenshot subset `@host|@layout|@viewer|@participants` refreshes both `lobby-host.png` and `lobby-voter.png`; sticky PR comment shows both.
- AC-8: `lobby.page.spec.ts` covers three branches: host shows icon, non-host shows chip (no icon, no button), empty subtitle renders nothing.
- AC-9: `pnpm --filter @hnch/client test` passes locally.
- AC-10: No regression of room-code copy button — it remains outside the new `@if (subtitle())` guard.

## Open questions

- None.

## Verification plan

- `pnpm --filter @hnch/client typecheck`
- `pnpm --filter @hnch/client lint`
- `pnpm --filter @hnch/client test`
- `pnpm --filter @hnch/client build`
- Pre-push screenshot hook runs `@host|@layout|@viewer|@participants` subset (`.screenshot-tags` already updated).
- Flake-check lobby screenshot specs 5× before merge.

## Screenshots

**Required:** Yes

- Screens: Lobby host view (icon present), Lobby non-host/voter view (chip, no icon).
- Variants: light + dark, mobile width primary (≤430 px); portal width verified for hover-color preservation.
- Path: published to `screenshots` branch under `sha-<short>/` by pre-push hook (`.screenshot-tags` = `@host|@layout|@viewer|@participants`).
- Delivery: sticky PR comment auto-updated by hook (marker `<!-- hnch-screenshots -->`).
- Merge handling: no manual squash — artifacts live on `screenshots` branch, not in PR commits.

## Critique pass

7 challenges raised by plan-critic on 2026-05-20. All 7 accepted:

- C1 → Decision 2 (non-host uses `<ion-chip outline>`).
- C2 → screenshot tags expanded to include `@viewer|@participants`.
- C3 → `flex-wrap: wrap` + `min-width: 0` + AC-6.
- C4 → outer `@if (roomCode())` quoted; AC-10 added.
- C5 → `color: inherit` + transition on icon.
- C6 → unit test command in verification + AC-8/AC-9.
- C7 → concatenated `aria-label` preserves SR context.

## References

- Spec: docs/specs/lobby-subtitle-tap-affordance.md
- Issue: https://github.com/IIxauII/hnch/issues/273
- Related open: #266 (Lobby section visual hierarchy)
- Related closed: #192 (hover color on portal), #181 (non-host waiting guidance)
- Conventions: docs/angular.md, docs/ionic.md
