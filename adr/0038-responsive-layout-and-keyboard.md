# ADR-0038: Responsive layout system & keyboard-shortcut contract

**Status:** Accepted
**Date:** 2026-05-02
**Deciders:** xau

## Context

The client (`packages/client`) was built phone-first, and the structural traces of that decision are still visible in the codebase. There are zero `@media (min-width: …)` rules in component or global stylesheets; no `max-width` on `<ion-content>` containers; the Estimating card grid is fixed at `repeat(3, minmax(0, 1fr))`; modals universally use `breakpoints: [0, 0.6, 0.95]` half-sheets. There is no global `:focus-visible` treatment, no hover affordances, and no keyboard-shortcut surface anywhere in the app.

That posture was deliberate at the time. [`ux.md`](../ux.md) §1 ("Goals & principles") line 32 lists as a v1 non-goal:

> "iPad/landscape layouts (iPhone portrait = design target)."

The supporting principle on the line above — "iPhone is primary design target. Mobile-first via Capacitor." — is consistent with [ADR-0002](0002-frontend-framework-angular-ionic-capacitor.md)'s framing of the client as an Ionic+Capacitor app whose native target is iOS first.

The PWA at `hnch.dev` (deployed per [ADR-0029](0029-relay-deployment.md)) has since become a real desktop and tablet user surface. The phone-shaped layout sprawled across a 1440px canvas is a poor experience: forms stretch full-width with no comfortable read length, the Estimating grid wastes most of its horizontal real estate, modals appear as bottom sheets glued to the bottom edge of a 27" monitor, and keyboard users have no way to vote without a mouse. The CLI ([ADR-0021](0021-cli-package.md)) covers the keyboard-driven case for terminal users, but PWA users on a desktop browser today get neither the touch idiom (because they're on a mouse + keyboard) nor a desktop idiom (because no breakpoint logic exists).

A written decision is warranted because the same outcome ("hnch looks and works correctly on tablet+ and desktop") can be reached in materially different ways with different downstream consequences — phone-shaped-but-centered, fluid-only with no two-pane, two-pane on every multi-content screen, or `ion-grid`/`ion-col` adoption — and a future contributor could reasonably pick any of them. Locking the breakpoint values, the page-shell pattern, the *which screens get which treatment* allocation, and the keyboard-shortcut bindings into one document means later UI work has a contract to extend rather than a blank slate to re-decide.

The decision also amends a v1 non-goal in `ux.md`. That amendment is companion to this ADR rather than a separate decision — the structural surface introduced here (breakpoints, page shell, keyboard service) is what makes the doc edit possible.

## Decision

Adopt a mobile-first responsive system that adds desktop-specific behavior at fixed breakpoints. The mobile (`<768px`) cascade is preserved unchanged; every new rule is additive and gated by `@media (min-width: …)` or `@media (hover: hover)`.

### 1. Breakpoints

CSS custom properties declared on `:root` in `packages/client/src/theme/variables.scss`:

```scss
:root {
  --hnch-bp-tablet: 768px;
  --hnch-bp-desktop: 1024px;
  --hnch-bp-wide: 1440px;
}
```

The values themselves are written as raw pixels in `@media` queries (CSS custom properties cannot be used in media-query conditions today); the custom-property declaration is the single documented source of truth that component stylesheets reference by comment.

### 2. Container widths

CSS custom properties declared alongside the breakpoints:

- `--hnch-content-max: 960px` — single-column screens cap and center.
- `--hnch-rail-width: 320px` — Lobby's left rail at desktop.
- `--hnch-modal-max: 480px` — centered-dialog max-width.

### 3. Page shell

A single `.page-shell` class in `global.scss` provides:

```scss
.page-shell {
  max-width: var(--hnch-content-max);
  margin-inline: auto;
}
```

Every screen wraps its content in `.page-shell`. The class is a no-op on small viewports (the cap exceeds the viewport so the rule is inert) and centers content at tablet+ viewports. This is the load-bearing structural addition: introducing it later, after components have grown their own per-screen width handling, would require touching every page.

### 4. Two-pane on Lobby only at `≥1024px`

Lobby is the one screen with enough content density (participants + share/QR + round subtitle + results + history + actions) that a two-pane shell is genuinely better, not just bigger. At `≥1024px`:

```scss
.lobby-shell {
  display: grid;
  grid-template-columns: var(--hnch-rail-width) 1fr;
  gap: 2rem;
}
```

Left rail = share/QR/participants. Right pane = round subtitle/results/history. Below 1024px the existing single-column flow is unchanged.

Other screens stay single-column inside the page shell. Estimating, Settings, Join, Home, Create — none gain a sidebar. Estimating's card grid expands by adjusting `grid-template-columns` at the breakpoints (up to 5 columns at desktop+) but remains a single-column page in layout terms.

### 5. Modals → centered dialogs at `≥1024px`

Below 1024px, modals retain the existing `breakpoints: [0, 0.6, 0.95]` half-sheet idiom (the iOS/Material standard for the touch target). At `≥1024px`, an Ionic shadow-part rule converts them to centered dialogs:

```scss
@media (min-width: 1024px) {
  ion-modal::part(content) {
    --max-width: var(--hnch-modal-max);
    --height: auto;
  }
  ion-modal::part(handle) { display: none; }
}
```

The bottom-sheet grabber hides; the modal centers on the viewport with a backdrop. The `breakpoints` array on `ion-modal` invocations is unchanged — Ionic ignores it on the centered-dialog rendering path.

### 6. Keyboard-shortcut contract

A new `KeyboardShortcutService` (Angular injectable) registers and unregisters keydown bindings per active screen. Implementation properties:

- Bindings registered via `Renderer2.listen(document, 'keydown', …)` so SSR/test environments without `document` degrade gracefully.
- Events with `event.target` matching `<input>`, `<textarea>`, or `[contenteditable]` are ignored, so a user typing their display name or a room code never accidentally votes.
- Registration is gated by `matchMedia('(hover: hover) and (pointer: fine)')` at construction time. On touch devices without a physical keyboard, the service is a no-op and registers nothing — it is a desktop affordance, not a parallel input surface that has to be kept consistent with mobile.

Per-screen bindings:

- **Estimating:** `1`–`9` map positionally to the visible scale cards (vote/replace/clear); `R` = Reveal Votes (host only); `Esc` = clear current selection.
- **Lobby:** `N` = open Round-start modal (host); `R` = Re-vote (host, post-reveal); `S` = Start Round (host, pre-round, alias for `N`).
- **Join:** `/` = focus code input.
- **Modals:** `Esc` = dismiss (Ionic default — preserved, not re-implemented); `Enter` = primary action where unambiguous (single primary CTA, no destructive confirmation).

Position-mapped digit keys deliberately track the *visible* scale cards rather than the *canonical* card values. A scale of `[1, 2, 3, 5, 8, 13, 21]` and a scale of `[XS, S, M, L, XL]` both bind `1`–`N` to "first visible card through Nth visible card." This is the only consistent interpretation across [ADR-0019](0019-scale-customization.md)'s heterogeneous scales (Fibonacci, t-shirt, powers-of-2, linear, risk, plus device-local overrides and custom scales).

### 7. Focus + hover

A global `:focus-visible` rule in `global.scss`:

```scss
*:focus-visible {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: 2px;
}
```

Hover styles (card lift, list-item background tint) live in component CSS gated on `@media (hover: hover)` so they do not flicker on touch devices that synthesize hover states from taps. The pattern is per-component rather than centralized — the visual treatment is component-specific and a global hover rule would over-claim.

## Options Considered

### Option A: Phone-shaped, centered with empty gutters

Cap every page at ~720px and center it. No two-pane, no fluid grids, no hover, no keyboard.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest — one global `max-width` rule |
| Cost | One stylesheet edit |
| Desktop UX | Poor — wastes the canvas, looks like a phone in a window |
| Tablet UX | Tolerable — reads roughly like phone |
| Keyboard | Absent |

**Pros:** smallest possible change; zero risk to mobile cascade; ships in a single PR.
**Cons:** does not actually deliver desktop UX. A 1440px monitor displays a 720px column with 360px of dead space on each side, no hover affordances, no keyboard support. PWA-on-desktop users continue to receive a phone-shaped experience and we have spent effort to make the wasted space look intentional rather than to fix the underlying mismatch.

### Option B: Fluid only, no two-pane

Container + breakpoints expand grids and cap content widths, but no screen ever splits into multiple panes. Lobby remains single-column at every viewport.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low–Medium — breakpoints, page shell, fluid grids, but no two-pane CSS |
| Cost | Most of the new CSS surface but none of the structural per-screen work |
| Desktop UX | Better than Option A; Lobby is bigger but not better-organized |
| Tablet UX | Same as Option A — Lobby still scrolls long |

**Pros:** simpler than two-pane; avoids per-screen layout decisions about which screens get a sidebar.
**Cons:** Lobby is the one screen with enough content density (participants + share/QR + round results + history + actions) that "bigger but still single-column" leaves the same scroll problem mobile has, just in a wider window. Two-pane is genuinely the better organization for that one screen, not just a cosmetic preference. Building the breakpoints + page shell + fluid grids without the two-pane pattern would likely force a follow-up ADR within weeks adding it.

### Option C: Two-pane on every multi-content screen

Lobby, Estimating, Settings, Round-history-detail all gain a sidebar at `≥1024px`. Maximum desktop-native feel.

| Dimension | Assessment |
|-----------|------------|
| Complexity | High — per-screen layout decisions, `.page-shell` interacts with each one differently |
| Cost | Substantially more CSS and per-component HTML restructuring |
| Desktop UX | Strong on Lobby; mixed on the others |
| Mobile risk | Higher — more places where the responsive cascade can be miswritten and break mobile |

**Pros:** maximally desktop-native at every screen.
**Cons:** Estimating's single focus is the card grid — a sidebar would distract from the moment of voting, which is the product's core interaction. Settings is a leaf list; a sidebar would be filler. Applying two-pane uniformly costs more without adding per-screen UX value. Better to keep two-pane scoped to the screen where it earns its weight.

### Option D: Adopt `ion-grid` / `ion-col`

Use Ionic's responsive grid system (`size`, `size-md`, `size-lg`) instead of plain CSS Grid + media queries.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — Ionic grid is well-documented but introduces a new layout vocabulary |
| Cost | Per-component HTML changes plus a parallel mental model |
| Desktop UX | Equivalent to Option A/B — `ion-grid` does not provide two-pane shells, just responsive columns |
| Team familiarity | Low — `ion-grid` is not used anywhere in this repo today |

**Pros:** declarative, Ionic-native, no manual breakpoint math.
**Cons:** introduces a parallel layout system to plain CSS Grid (which the codebase already uses for the card grid) without solving anything CSS Grid + custom-property breakpoints does not. The codebase becomes inconsistent — some grids are `ion-grid`, others are `display: grid`. The cost of inconsistency is paid forever; the benefit is small.

## Trade-off Analysis

Option A is the cheapest possible change but does not deliver the thing being asked for. It centers the phone experience inside a desktop window rather than producing a desktop experience.

Option B delivers most of the responsive system without the one structural element — two-pane on Lobby — that meaningfully changes how desktop users perceive the app. Building everything except the two-pane would almost certainly be revisited within weeks; landing it in one decision is cheaper than two.

Option C is the maximalist version, and the per-screen UX argument against it is real. Estimating's card grid is the moment of decision; sidebars compete for attention with the cards. Settings is short enough that a sidebar would be filler. The best argument for a sidebar — content density that benefits from spatial organization — only applies to Lobby.

Option D would replace plain CSS Grid (already the card-grid layout idiom) with `ion-grid`, which produces a parallel system without solving anything. The codebase has no `ion-grid` usage today, so adopting it now would cost familiarity for no gain.

The chosen option is mobile-first additive, which means **every new rule is gated**. The existing phone cascade is the default; tablet and desktop are opt-in via `@media`, and hover/keyboard treatments are gated by `@media (hover: hover)` and `matchMedia('(hover: hover) and (pointer: fine)')` respectively. The cost of getting the cascade wrong is bounded — a missing `@media` would either show a desktop layout on mobile (visible immediately in QA) or show a phone layout on desktop (the status quo, no regression). What we give up is the ability to take per-component shortcuts: every page must wrap content in `.page-shell` rather than each rolling its own width handling, every per-screen stylesheet must be audited for missing breakpoints, and the keyboard service adds a small global keydown listener whose ignore-list is load-bearing (forgetting `<input>` would mean voters accidentally vote while typing their name).

The decision to scope two-pane to Lobby only is intentional and load-bearing. If a future product change pushes another screen toward Lobby's content density (e.g., a "session admin" screen that surfaces participant management + access control + round controls together), this ADR's pattern extends naturally — declare a new `.<screen>-shell` grid alongside `.lobby-shell`, gate it on `≥1024px`. The pattern is reusable without committing every screen to it.

The keyboard contract is deliberately minimal. The CLI ([ADR-0021](0021-cli-package.md)) is the canonical keyboard-driven surface of the product; the PWA's keyboard shortcuts are a hover-pointer-keyboard affordance for desktop browser users, not a parity surface. Position-mapped digit keys (1–9 → first nine visible cards) are the only consistent semantic across [ADR-0019](0019-scale-customization.md)'s heterogeneous scales — value-mapped digits would require Fibonacci users to memorize that 5 means the fifth Fibonacci number, t-shirt users to give up digit shortcuts entirely, and custom-scale users to have no shortcut at all. Position-mapping accepts that "1" means "first card visible" and lets the scale change underneath without retraining the user.

## Consequences

**Easier:**

- PWA users on tablet and desktop receive a real desktop experience: Lobby two-pane shows participants beside results, Estimating's card grid uses up to 5 columns at desktop+ widths instead of 3, modals stop being half-sheets glued to the bottom edge of a 1440px monitor.
- Keyboard users on desktop browsers can vote and run rounds without a mouse — `1`–`9` to vote, `R` to reveal, `Esc` to clear, `/` to focus the code input on Join.
- Focus-visible outlines become consistent across the app, raising the accessibility floor without per-component work.
- The `.page-shell` pattern is a single class to add to a new page — future pages inherit the cap and centering by convention.
- Hover affordances on cards and list items make the app feel native to the input device, not just resized.
- The keyboard-shortcut service is a single registration surface; future shortcut additions land in one file, with one ignore-list, one media-query gate.

**Harder:**

- Every page component must wrap content in `.page-shell` to participate in the cap-and-center behavior. A new screen that forgets the wrapper renders full-width on desktop — a visible regression but not a structural one.
- Per-screen stylesheets are now responsible for their own breakpoint discipline. Component CSS that hard-codes `grid-template-columns: repeat(3, minmax(0, 1fr))` without `@media (min-width: 1024px) { … repeat(5 …) }` works correctly on mobile and looks cramped on desktop. Easy to miss in review; mitigated by code-review checklist and by the fact that desktop QA is now part of the visual testing surface.
- The keyboard service's ignore-list is load-bearing. Forgetting to ignore a new editable surface (e.g., a contenteditable rich-text field) would mean keystrokes leak into shortcuts. The ignore-list is centralized in one place; the cost is that the place exists and must be maintained.
- Two-pane Lobby requires the participants list, share/QR, round subtitle/results, and history components to compose into the grid layout without overflowing their cells. The per-component work is bounded but real.
- Modals at desktop+ no longer look like the rest of the iOS/Material idiom — they become centered dialogs. This is correct for desktop but creates a visual inconsistency between the two viewport classes that someone seeing both for the first time might find jarring. Documented in `ux.md`.
- The keyboard contract diverges from the CLI: CLI uses Ink-driven keybindings ([ADR-0021](0021-cli-package.md)) with its own command palette, while the PWA's `KeyboardShortcutService` is an additive desktop affordance. This is intentional — see Trade-off Analysis — but the divergence is a thing to remember when documenting "how to use hnch with the keyboard."

**Revisit triggers:**

- A future product surface that pushes another screen toward Lobby's content density (e.g., a session-admin screen that surfaces participant management + access control + round controls together) → extend the two-pane pattern to that screen by declaring a new `.<screen>-shell` grid; no new ADR needed unless the breakpoint values themselves change.
- The breakpoint values prove wrong in practice (e.g., 768px is too narrow for tablet two-pane to be readable, or 1024px is too eager) → update the custom-property values in one place; if the change is more than a numeric tweak (e.g., dropping a breakpoint, adding a fourth) write a successor ADR.
- Keyboard contract drift — a feature ships shortcuts that conflict with the documented bindings, or the position-mapped digit semantic stops being the right choice (e.g., a future scale type that genuinely benefits from value-mapped digits) → write a successor ADR rather than amending this one's §6 in place.
- The CLI ([ADR-0021](0021-cli-package.md)) and PWA keyboard surfaces converge in some way that justifies a unified contract → successor ADR; the current divergence is intentional but not load-bearing for all time.
- Touch-laptop ambiguity (a Surface or iPad Pro with a keyboard attached): `matchMedia('(hover: hover) and (pointer: fine)')` flips on and off as the keyboard is attached/detached. If users on hybrid devices report the shortcut surface flickering or behaving unpredictably, the registration gate may need a debounce or a user preference; track and address as implementation hygiene unless the resolution is structural.
- The fork-PR / public repo opening from [ADR-0037](0037-self-hosted-runner-pool-covers-all-non-health-jobs.md) brings in external contributors who add new pages → revisit whether the `.page-shell` convention is enough or whether a typed wrapper / lint rule is warranted.

## Action Items

- [ ] Once accepted, update `adr/README.md` index with this entry. (Done in this changeset.)
- [ ] Update `CLAUDE.md` "Current decisions at a glance" with a one-liner referencing the breakpoints, the page-shell pattern, the Lobby two-pane scope, and the keyboard-shortcut contract. Flag for orchestrator — the ADR author cannot edit `CLAUDE.md` directly.
- [ ] Update `ux.md` §1 line 32 ("iPad/landscape layouts (iPhone portrait = design target)" non-goal) to reflect that tablet+ and desktop layouts are now in scope, with iPhone remaining the primary design target. Cross-link this ADR. The wording change is companion to this ADR, not a separate decision.
- [ ] Update `ux.md` §6 ("Interaction patterns") with a new "Keyboard shortcuts (desktop PWA)" subsection enumerating the bindings from §6 of this ADR, the input-element ignore-list, and the touch-device no-op behavior.
- [ ] Update `ux.md` §7 ("Theming") or a new responsive section to document the breakpoint custom-property contract and the `.page-shell` convention.
- [ ] Declare the breakpoint and container-width custom properties in `packages/client/src/theme/variables.scss` and the `.page-shell` rule + global `:focus-visible` in `packages/client/src/global.scss`. Audit existing pages to wrap content in `.page-shell`.
- [ ] Implement `KeyboardShortcutService` with the per-screen registration model, the input-element ignore-list, and the `matchMedia('(hover: hover) and (pointer: fine)')` gate. Wire it into Estimating, Lobby, and Join.
- [ ] Add per-screen `@media (min-width: …)` rules to expand the Estimating card grid (3 → 4 → 5 columns), to apply the Lobby two-pane shell at `≥1024px`, and to convert modals to centered dialogs at `≥1024px`.
- [ ] Add hover affordances (card lift, list-item background tint) gated on `@media (hover: hover)` in the relevant component stylesheets.
- [ ] Add Playwright coverage in `packages/e2e` for at least one tablet viewport (768×1024) and one desktop viewport (1440×900) on the existing happy-path flows (create → join → vote → reveal). The mobile e2e suite stays unchanged; the new viewports are additive.
- [ ] Watch for breakpoint-discipline regressions: any new page component must wrap content in `.page-shell`; any new grid that cares about column count must declare the desktop-breakpoint expansion. Add to code-review checklist.

## Cross-references

- [ADR-0002](0002-frontend-framework-angular-ionic-capacitor.md) — Angular + Ionic + Capacitor stack is unchanged; the responsive system uses Ionic shadow parts (`::part(content)`, `::part(handle)`) and plain CSS Grid, both already in the supported surface.
- [ADR-0019](0019-scale-customization.md) — heterogeneous scales (Fibonacci, t-shirt, powers-of-2, linear, risk, custom) are the reason keyboard digit shortcuts use position-mapping rather than value-mapping.
- [ADR-0021](0021-cli-package.md) — CLI is the canonical keyboard-driven surface; the PWA's `KeyboardShortcutService` is an additive desktop affordance, not a parity surface. The divergence is intentional.
- [ADR-0029](0029-relay-deployment.md) — PWA + relay served from a single origin (`hnch.dev`); the desktop user surface targeted by this ADR is the PWA on `hnch.dev`.
