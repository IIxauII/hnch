# Plan — Vote-progress dots with per-participant identity (#196)

## Goal

`AvatarVoteRowComponent` dots gain identity:
- Mobile: 1.5rem dots, single uppercase initial inside each dot.
- Portal (≥ `$bp-md` = 768px): initial inside dot + truncated display name (≤10 chars) beneath.
- Voted dots filled primary + white initial; unvoted transparent + medium-color initial.
- Row wraps for 10+ participants.

Scope: **single PR**, single component (`packages/client`). No ADR, no schema, no protocol change.

## Files

| File | Change |
|---|---|
| `packages/client/src/app/estimating/avatar-vote-row.component.ts` | Template: render initial span + optional label span. Styles: resize dot to 1.5rem, flex-center initial, add `.dot-label` with `@media (min-width: $bp-md)` gate, wrap container. Use `@use '../../theme/breakpoints' as bp;` and reference `bp.$bp-md`. |
| `packages/client/src/app/estimating/avatar-vote-row.component.test.ts` | Add tests: initial rendered from `displayName.charAt(0).toUpperCase()`, empty/whitespace displayName fallback (`?` or empty — pick), label slice ≤10 chars present in DOM (visibility itself is CSS, untested in unit). Keep existing tests intact. |
| `packages/e2e/tests/fixtures/helpers.ts` | Selectors `voteDots` / `votedDots` still match `.dot` — no change needed. Verify no e2e relies on dot dimension. |

## Implementation notes

1. Template adds inside `.dot`: `<span class="dot-initial">{{ initialOf(p) }}</span>` and sibling `<span class="dot-label">{{ p.displayName | slice:0:10 }}</span>` — wrap dot+label in `.dot-cell` flex column so label sits beneath. Update CSS selector hierarchy accordingly. **Check `helpers.ts` selectors** — if e2e queries `app-avatar-vote-row .dot`, keep `.dot` as the round element class; the new wrapper takes a new class name.
2. Initial computation: pure function, NOT a computed signal (depends on `p`, not component state). Inline `(p.displayName?.trim()?.[0] ?? '').toUpperCase()`. Empty string fallback if missing — initial just renders blank.
3. SCSS: switch from inline `styles:` array string to a `styleUrl` only if `@use` mixing requires it. Angular allows `@use` inside inline component styles via the build pipeline — verify by trying inline first; extract to a sibling `.scss` file only if compiler rejects.
4. `flex-wrap: wrap; row-gap: 0.5rem` on `.dots`.
5. Label styles: `max-width: 5rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size: 0.6875rem; color: var(--ion-color-medium); text-align: center;`. Hidden via `display:none` below `$bp-md`.
6. Initial inside dot: `display:flex; align-items:center; justify-content:center; font-size:0.625rem; font-weight:600; line-height:1;`. Color rules: `.dot .dot-initial` → `var(--ion-color-medium)`; `.dot.voted .dot-initial` → `#fff`.
7. `aria-hidden="true"` stays on `.dots` parent — initials and labels inside inherit, no per-dot `aria-label`.
8. `SlicePipe` import: add `imports: [SlicePipe]` from `@angular/common`.

## Verification

- `pnpm --filter @hnch/client test` — unit tests pass, existing 5 cases unchanged.
- `pnpm --filter @hnch/client lint && pnpm --filter @hnch/client typecheck`.
- `pnpm --filter @hnch/e2e test` — confirm dot selectors still resolve.
- Visual check via dev server at two widths: 390×844 (no labels, initials visible) and 1280×900 (labels visible). Light + dark mode.
- 10-participant scenario: wrap verified visually.

## Out of scope (per issue)

Color-coding (#159), tooltips, vote-value preview, ADR changes.

## Worktree

Per repo convention: `pnpm worktree:add vote-dots-labels main` after `git fetch origin`. Single PR titled `feat(client): show participant initials on vote-progress dots (#196)`.
