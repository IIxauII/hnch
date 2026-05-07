# ADR-0040: Flat sections + Apple-ish type scale (supersedes ADR-0039 §D3)

**Status:** Accepted
**Date:** 2026-05-07
**Deciders:** xau

## Context

[ADR-0039](0039-ion-grid-section-cards-popover-overflow.md) shipped three coordinated UI-vocabulary patterns inside the [ADR-0038](0038-responsive-layout-and-keyboard.md) structural shell: §D1 `ion-grid` for responsive multi-column layouts, §D2 `ion-popover` for top-bar overflow menus, and §D3 `ion-card` section grouping on Lobby and Estimating. The §D1 `ion-grid` adoption and §D2 `ion-popover` migration both landed cleanly and remain correct. Live testing of §D3's `ion-card` section grouping in this 2026-05-07 session surfaced two distinct problems that together make the card framing the wrong primitive for hnch's content density.

**1. Boxes around boxes.** Wrapping each Lobby and Estimating section in `ion-card` produced a visible outer rectangle (the card border + shadow). The widgets *inside* those cards already carry their own framing — `<ion-list lines="inset">` draws inset borders on every row, `<ion-accordion-group expand="inset">` draws an inset rectangle around the participants accordion, the Voter/Observer chip on the self-row carries a pill shape, the round-history component renders its own internal "HISTORY" sub-header. The composition reads as 2–3 nested rectangles per section: card → inset list → row chip; or card → inset accordion → header strip. User feedback this session called the result "amateur." The framing primitive is not load-bearing for any actual structure (the responsive shell from ADR-0038 §3 and the two-pane grid from ADR-0038 §4 already do the structural work); it is purely a visual grouping affordance, and that affordance is being undercut by the inner widget frames it sits on top of.

**2. Inconsistent type scale.** A separate audit done while inspecting the card-framed pages found that the type sizes across Lobby + Estimating + the shared components were rolled per-component without a documented scale. Concrete examples: Lobby's `.room-code` sets `font-size: 2.5rem`; the page subtitle sets `font-size: 0.9rem`; `ion-card-title` defaults to `~1rem`; the round-results component renders the result number at small inline body size next to a "(N votes)" label at the same size; the round-history rows use `font-size: 13px` for metadata in one place and `--ion-font-size: 14px` elsewhere. There is no single source of truth, no token vocabulary, and no documented hierarchy. The effect is that the visual hierarchy on a given screen is whatever the most recently-edited component decided it was, and a contributor adding a new heading or stat number has no convention to follow — they pick a value, and the value drifts.

These two problems are coupled. Removing the card framing exposes the type-scale inconsistency more sharply (without the card border to imply "this is a section," the typography has to do the section-separation work), and adopting a documented type scale without removing the card framing leaves the boxes-around-boxes problem unsolved. Documenting them in one ADR keeps the supersession surgical and gives the implementation pass a single source of truth to reference.

The repo convention is that accepted ADRs are immutable; substantive change is a new ADR that supersedes the prior one. ADR-0039's §D1 (`ion-grid`) and §D2 (`ion-popover`) are working correctly and are not being revisited. The supersession this ADR documents is narrow: §D3 only.

## Decision

Replace `ion-card` section grouping on Lobby and Estimating with a flat-section pattern (a `<section>` with a thin top divider and a single uppercase micro section heading), and introduce a documented type-scale token vocabulary in `theme/variables.scss` that all per-component CSS references. ADR-0039's §D1 `ion-grid` adoption and §D2 `ion-popover` overflow menus remain Accepted and unchanged.

### D1. Type-scale tokens in `variables.scss`

Add the following custom properties to `:root` in `packages/client/src/theme/variables.scss`. Sizes are declared in pixels (not `rem`) so that the scale does not amplify or compress when the body font size is changed (Ionic theme overrides, OS-level zoom for accessibility, etc. continue to work; the scale itself stays predictable).

```scss
:root {
  /* Type scale — see ADR-0040. Apple-ish: tight display, generous body. */
  --hnch-text-display: 32px;   /* room code, big stat numbers */
  --hnch-text-h1:      22px;   /* page-level heading inside content */
  --hnch-text-h2:      17px;   /* section heading */
  --hnch-text-body:    15px;   /* default body */
  --hnch-text-caption: 13px;   /* muted descriptors, metadata */
  --hnch-text-micro:   11px;   /* uppercase section labels */

  --hnch-font-weight-bold:     700;
  --hnch-font-weight-semibold: 600;
  --hnch-font-weight-medium:   500;
  --hnch-font-weight-normal:   400;

  --hnch-letter-spacing-display: -0.02em;
  --hnch-letter-spacing-micro:    0.08em;
}
```

The shape of the scale is informed by Apple's iOS type ramp (San Francisco / Settings / Mail) — tight tracking on display sizes, generous body, narrow letter-spacing range. The exact pixel values are hnch's own; they are not copied from any Apple reference. The "Apple-ish" descriptor is shorthand for the *shape* of the ramp (display far above body, body just above caption, micro for uppercase labels), not a brand alignment claim.

Component CSS references the tokens by name: `font-size: var(--hnch-text-h2)`, `font-weight: var(--hnch-font-weight-semibold)`. No per-component magic numbers. A component that wants a font size outside the ramp is a signal to widen the token vocabulary in a follow-up change, not to hard-code a value.

### D2. Flat-section pattern

Drop `ion-card` / `ion-card-header` / `ion-card-title` / `ion-card-content` from Lobby and Estimating templates. Replace with a flat `<section>` carrying a thin top divider and an uppercase micro section heading:

```html
<section class="page-section" aria-label="Participants">
  <header class="page-section-header">
    <h2 class="page-section-title">PARTICIPANTS</h2>
    <span class="page-section-meta">1 online</span>
  </header>
  <div class="page-section-body">
    <!-- list / accordion / vote-grid -->
  </div>
</section>
```

The supporting CSS lives in `packages/client/src/global.scss`:

```scss
.page-section {
  margin-block: 1.5rem;
}
.page-section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  padding-block: 0.5rem;
  border-top: 1px solid var(--hnch-sep);
}
.page-section-title {
  font-size: var(--hnch-text-micro);
  font-weight: var(--hnch-font-weight-medium);
  letter-spacing: var(--hnch-letter-spacing-micro);
  text-transform: uppercase;
  color: var(--ion-color-medium);
  margin: 0;
}
.page-section-meta {
  font-size: var(--hnch-text-caption);
  color: var(--ion-color-medium);
}
.page-section-body {
  padding-block: 0.5rem;
}
```

The first `.page-section` on a page drops the top border (a divider as the very first thing on the page reads as a stray rule). Implemented via `:first-child` selector or a modifier class — implementer's choice in Phase 2/3.

**Inner widget cleanup.** With the outer card frame gone, the inset borders on inner widgets become the visible "frame" and read as a single unwanted rectangle around what should be flat content. The implementation pass drops them:

- `<ion-list lines="inset">` → `lines="full"` or `lines="none"` per row-separator readability. Rail action list (Share invite / Show QR) → `lines="none"`.
- `<ion-accordion-group expand="inset">` → drop `expand="inset"`. Accordion sits in document flow.
- Voter/Observer chip on the self-row stays (single chip, not a frame).
- `<app-round-history>` drops its internal "HISTORY" `<h3>` sub-header — the parent page's `.page-section-title` is the only label.
- `<app-vote-results>` applies the type-scale tokens: result number → `--hnch-text-display`, "(N votes)" label → `--hnch-text-caption`, elapsed-time → `--hnch-text-caption`; "Unanimous" chip stays as-is.

### D3. Narrow supersession of ADR-0039 §D3 only

[ADR-0039](0039-ion-grid-section-cards-popover-overflow.md) §D3 ("`ion-card` section grouping on Lobby and Estimating") is superseded by D2 above. ADR-0039's other sections — §D1 (`ion-grid` for responsive multi-column layouts) and §D2 (`ion-popover` for top-bar overflow menus) — remain Accepted and unchanged. ADR-0038's §1–3 (breakpoints, container widths, `.page-shell`), §4 (two-pane Lobby at `≥1024px`), §5 (modal-to-dialog at `≥1024px`), §6 (keyboard contract), and §7 (focus + hover) are unaffected. The flat sections live *inside* the `.page-shell` cap and the `.lobby-shell` two-pane grid; they replace only the ion-card framing within those structural layers.

ADR-0039 §D3's token-reuse claim ("cards use `--hnch-surface`, `--hnch-sep`, `--hnch-fill`") is partially preserved: the flat-section pattern reuses `--hnch-sep` for the top divider. `--hnch-surface` and `--hnch-fill` are not used by the flat-section pattern itself but remain valid tokens for other surfaces.

The supersession pattern mirrors what ADR-0039 itself did to ADR-0038 §Option D: append a single-line clarification pointer to the superseded paragraph in the prior ADR, without otherwise editing it. ADR-0039's body text remains the as-written record of what was decided in that prior pass; this ADR is the new source of truth for the section-grouping decision.

## Options Considered

### Option A: Flat sections + type-scale tokens (chosen)

Drop `ion-card` framing on Lobby and Estimating, replace with a flat `<section>` + thin top divider + uppercase micro heading. Document a type-scale token vocabulary in `variables.scss` and apply it across the affected components.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — touches Lobby, Estimating, two shared components, the global stylesheet, and the theme tokens |
| Cost | One coordinated pass through the four files plus token + global rule additions |
| Desktop UX | Substantially improved — no nested-rectangle visual; type hierarchy is consistent and reads at a glance |
| Mobile UX | Equivalent to or better than today — flat sections stack cleanly in the single-column flow; type-scale tokens replace ad-hoc values |
| Token surface | Adds a documented type-scale vocabulary (six size tokens, four weight tokens, two letter-spacing tokens) — a real but small addition |
| Supersession surface | Narrow — ADR-0039 §D1 and §D2 unchanged; ADR-0038 unchanged |

**Pros:**
- Eliminates the boxes-around-boxes problem at the level it actually exists (the outer card frame).
- The thin-divider + uppercase-micro-heading pattern matches the iOS Settings / Mail aesthetic and reads as native to the platform hnch primarily targets.
- The type-scale tokens make the visual hierarchy a documented contract rather than per-component drift.
- Reuses the existing `--hnch-sep` token for the divider; no new color tokens needed.
- Inner-widget cleanup (drop `lines="inset"`, drop `expand="inset"`, drop the redundant "HISTORY" sub-header) is mechanical and bounded.

**Cons:**
- ADR-0039 §D3 is freshly Accepted (same-day decision); superseding it on the same day looks indecisive in the audit trail. Mitigated by the surgical scope — §D1 and §D2 from the same ADR are not being revisited, the supersession is documented as narrow, and the original §D3 was made on a different information set (the cards-around-inset-widgets visual hadn't been observed yet).
- Two grouping primitives now coexist in the codebase: flat sections (Lobby, Estimating) and `ion-card` (anywhere a future screen reaches for it). Mitigated by D2's pattern being clearly the section-grouping primitive going forward; an `ion-card` left in a different context (e.g., an alert dialog body) is not in conflict.
- The type-scale tokens are a new vocabulary contributors must learn. Mitigated by the small token count (six sizes) and by the tokens being discoverable in `variables.scss`.

### Option B: Cards-deflated — keep `ion-card`, strip the visual framing

Keep `ion-card` markup on Lobby and Estimating but override the shadow + border + background tokens so the cards render as flat sections. The structural markup stays identical to ADR-0039 §D3; only the visual treatment changes via Ionic's CSS custom properties (`--background`, `--box-shadow`, `--border-width`).

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — a handful of `ion-card` style overrides in `global.scss` |
| Cost | Smallest possible change |
| Visual outcome | Equivalent to Option A's section appearance once the overrides bottom out the card chrome |
| Markup outcome | `ion-card` / `ion-card-header` / `ion-card-content` stays in templates — the markup describes a card, the CSS draws a section |
| Supersession surface | None — ADR-0039 §D3 stays in force as written |

**Pros:**
- No ADR supersession needed. ADR-0039 §D3 reads as still-accepted; the rendering change is "just CSS."
- The component tree on Lobby and Estimating is unchanged; tests asserting on `ion-card` selectors continue to pass.
- Easiest to revert if the flat-section idea proves wrong — restore the default card overrides and the framed look returns.

**Cons:**
- Markup-vs-CSS mismatch is a real cost. A reader of the template sees an `ion-card` and reasonably expects a card; the CSS quietly subverts that expectation. Six months from now a contributor will look at the Lobby template, see `ion-card`, and reason about it as a card. ADRs document *why* a decision was made; if the markup says "card" and the rendering says "section," neither the markup nor the CSS tells the contributor what to think — they have to chase the override stylesheet.
- The inner-widget-frames problem (inset list, inset accordion, redundant sub-header) still has to be solved separately. Cards-deflated only addresses the outer frame.
- The semantic role of an `ion-card` (Ionic's accessibility-tree treatment, screen reader announcement of "card") doesn't match a section. Forcing a section's a11y semantics through `ion-card` markup is adding accessibility noise.
- The type-scale problem is independent and is not addressed by this option. We'd still need a separate ADR for the type tokens, which is half of what's being rolled in here anyway.

### Option C: Custom-fix the existing per-component sizes; no token vocabulary

Skip introducing a type-scale token system. Audit each component's hardcoded font sizes, harmonize them by hand (e.g., bring `.room-code` from `2.5rem` to `2rem` and the page subtitle from `0.9rem` to `0.875rem` to land on a consistent scale), and document the resulting sizes in component CSS comments. Apply the flat-section pattern from Option A separately.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — one-by-one component edits, no global infrastructure |
| Cost | Comparable to Option A in raw line count, lower in design surface (no token names to invent) |
| Token surface | None — sizes stay component-local |
| Drift risk | High — without a documented token vocabulary, the next contributor adding a new heading picks a value with no convention to follow, and the harmonization decays |
| Discoverability | Low — to find what size body text is, a contributor reads the component CSS for an existing component and copies; no central table |

**Pros:**
- No new token names to design, name, or maintain.
- Every value is local to the component that uses it; no remote-edit risk (changing a token value affects every consumer).
- Easiest to reason about per-component — no "what does `--hnch-text-h2` resolve to?" indirection.

**Cons:**
- The harmonization decays the moment a new component is added. The original problem (per-component drift) is not solved, just re-set.
- Code review can't catch type-scale violations — there's no canonical scale to violate. A reviewer can't say "this should be `var(--hnch-text-h2)` not `font-size: 18px`" because the convention isn't documented.
- A future palette or scale change (Apple deprecating San Francisco metrics, hnch wanting to bump body size for accessibility, a high-contrast mode that shifts the scale) requires editing every component instead of changing one token value.
- The audit-and-harmonize work has to be redone on every multi-component change. Per-component sizes don't compose; tokens do.

### Option D: Material 3 type scale instead of Apple-ish

Adopt Material Design 3's `display-small` (36px / 400) / `headline-medium` (28px / 400) / `title-medium` (16px / 500) / `body-medium` (14px / 400) / `label-small` (11px / 500) ramp. Token names match the Material spec; sizes track the M3 reference values.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Equivalent to Option A — same number of tokens, same indirection |
| Cost | Same as Option A |
| Visual outcome | Material-flavored — heavier display weight (Material uses 400 for display, hnch's existing `.room-code` uses 700) |
| Cross-platform fit | Mixed — Material is the Android idiom; hnch's primary mobile target is iOS, which uses San Francisco / Apple HIG metrics |

**Pros:**
- Borrows a published design system; the scale's design rationale is well-documented externally.
- Token names match a system Angular Material consumers may already know.
- Cross-references to M3 documentation are stable.

**Cons:**
- Material display weights (400 for display, 500 for label) are lighter than the existing hnch hierarchy (the room code is 700-weight today, and the design language reads as Apple-leaning rather than Material-leaning). Adopting M3 weights would shift the visual feel of the app away from its current direction.
- Material's title-small is 14px and body-medium is 14px — the body / sub-title distinction is carried by weight rather than size. hnch's existing components rely on size differences for hierarchy (subtitle at 0.9rem, body at default, headings at larger), and the implementation pass would have to re-resolve every "is this a body or a title?" call. More expensive than Option A.
- Material's token names (`headline-medium`, `title-large`, `label-small`) are descriptive in Material's sense but produce a longer name list than hnch needs (M3 has 15 type roles; hnch has 6 sizes' worth of distinct uses).
- Aligning with Material would imply a follow-up question about whether the rest of the design language should also align with Material (color tokens, motion tokens, elevation), which is a much bigger surface than this ADR is scoped to.

## Trade-off Analysis

The chosen option (Option A — flat sections + Apple-ish type tokens) accepts a same-day supersession of ADR-0039 §D3 in exchange for (1) a section-grouping primitive that doesn't fight the inner-widget framing, and (2) a documented type-scale vocabulary that ends per-component drift. The supersession is surgical: §D1 and §D2 of ADR-0039 stay in force, ADR-0038 is unaffected, and only the one paragraph that turned out wrong gets a successor.

What we give up:

- **The ADR-0039 §D3 token-reuse claim.** ADR-0039 §D3 made a deliberate "cards use `--hnch-surface`, `--hnch-sep`, `--hnch-fill`" point as a way of constraining design surface and avoiding card-local variables. The flat-section pattern reuses `--hnch-sep` but does not consume `--hnch-surface` or `--hnch-fill` (no card body fill, no inner fill region). The constraint claim is preserved in spirit — flat sections don't introduce new color tokens — but the specific three-token list from ADR-0039 §D3 no longer applies as written. The new constraint is "type-scale tokens are the addition; color tokens are unchanged."
- **The familiar Ionic `ion-card` vocabulary on Lobby and Estimating.** A contributor coming from another Ionic codebase will reach for `ion-card` to group content; on these two screens, the convention is to reach for `<section class="page-section">` instead. The discriminator is documented in this ADR but enforced in code review. Mitigated by the fact that `ion-card` is still valid in other contexts (alert dialogs, inline notice cards, future screens) — it's only Lobby and Estimating where the flat-section pattern is the convention.
- **Same-day supersession optics.** ADR-0039 was Accepted on 2026-05-07; this ADR was Accepted on the same date. The audit trail shows a decision and a reversal in the same session. The honest reading is that ADR-0039 was made before the cards-around-inset-widgets visual was observed in live testing, and the new information justified the reversal. The ADR convention treats "I changed my mind based on new information" as exactly what ADRs are for; the supersession is the right shape rather than a sign of indecision.

What we get:

- **No more boxes around boxes.** The outer card frame is gone. The inner widgets (list, accordion, chip) are no longer competing with an outer rectangle; they read as flat content under a thin section divider.
- **A documented type scale.** Six size tokens, four weight tokens, two letter-spacing tokens — a small vocabulary that covers display through micro and ends the per-component drift problem at the source.
- **Apple-ish hierarchy that matches the platform.** hnch's primary mobile target is iOS ([ADR-0002](0002-frontend-framework-angular-ionic-capacitor.md), [ADR-0021](0021-cli-package.md)'s parity contract aside); Apple-ish metrics on the PWA align the desktop and tablet PWA visual with the native mobile target's design language.
- **Reusable across future screens.** A new screen reaching for section grouping uses `<section class="page-section">` and inherits the type tokens for free. No follow-up ADR needed unless the section pattern itself proves wrong.
- **Token-driven future palette work.** A future "high-contrast accessibility mode" or "OS-level dark/light auto-switch" change can move a few token values rather than auditing every component.

The decision to keep the supersession surgical (ADR-0039 §D3 only, not the whole ADR) is load-bearing. ADR-0039's §D1 (`ion-grid`) and §D2 (`ion-popover`) are working correctly and would need to be re-derived from scratch if ADR-0039 were marked superseded as a whole. Marking only the §D3 paragraph as superseded — and pinning the clarification on the §D3 paragraph itself, mirroring how ADR-0039 marked ADR-0038 §Option D — keeps ADR-0039 readable as the Accepted source of truth for the parts of it that survive.

## Consequences

**Easier:**

- Section grouping on Lobby and Estimating: declare `<section class="page-section">` with a `.page-section-header` and `.page-section-body`; the divider, the uppercase micro heading, and the spacing all come from `global.scss`.
- Adding a heading or stat number to any component: pick the matching token (`var(--hnch-text-h2)`, `var(--hnch-text-display)`) and the visual hierarchy is automatically consistent with the rest of the app.
- A future high-contrast or accessibility-zoom mode: edit the token values in one place; every consumer updates.
- Reading the codebase: Lobby and Estimating templates describe their sections with `<section>` semantics, not with `ion-card` indirection. The markup matches the rendering.
- Reviewing a new component: "does this use the type tokens?" is a single grep-able question; values that don't match the token set are visible deviations.
- The inner-widget cleanup (drop `lines="inset"`, drop `expand="inset"`, drop the round-history sub-header): each is a single-line deletion that removes a frame.

**Harder:**

- ADR-0039 §D3's "cards" mental model is partially out of date. A reader of ADR-0039 has to follow the §D3 supersession pointer to find the new pattern. Mitigated by the clarification pointer being on the §D3 paragraph itself, not buried in a separate index entry.
- Two grouping primitives in the codebase: flat `<section>` (Lobby, Estimating) and `ion-card` (everywhere else, if any future screen reaches for it). The discriminator ("dense multi-section page → flat sections; isolated emphasis surface → `ion-card`") is documented in this ADR but enforced in code review.
- The type-scale tokens add a vocabulary that contributors must learn. Mitigated by the small count (six sizes) and by the tokens being declared together in `variables.scss`.
- A component that wants a font size outside the ramp (e.g., a special promotional banner with 48px display) cannot reach into the ramp; the answer is to widen the ramp in a follow-up change. This is a discipline cost — the ramp protects consistency, but it slows down one-off design ambition.
- Per-component CSS that hardcoded font sizes (`.room-code { font-size: 2.5rem; }`, etc.) needs an audit-and-replace pass. Bounded but real.
- The thin-divider pattern relies on `--hnch-sep` reading correctly in both light and dark themes. The token is already used elsewhere (ADR-0039 §D3 cited it for card dividers), so this is not new risk, but a theme regression that affects `--hnch-sep` would be more visible now.

**Revisit triggers:**

- The flat-section pattern proves insufficient for a future screen with content density genuinely warranting a card boundary (e.g., a contained inline-edit affordance that needs an outer frame to convey "this is one editable unit") → write a successor ADR scoped to that screen; the flat-section pattern stays valid for Lobby and Estimating.
- The type-scale tokens prove inadequate (a screen with a use case the six sizes don't cover; an accessibility audit demands different metrics; a future scale type from [ADR-0019](0019-scale-customization.md) needs a number rendering at a non-token size) → widen the token vocabulary in a successor ADR rather than hardcoding values per-component.
- The Apple-ish framing diverges from Apple's evolving HIG (e.g., iOS 19 introduces a substantially different metrics ramp) → write a successor ADR; the values in this ADR are correct relative to current iOS conventions.
- The "section heading is uppercase micro" decision conflicts with an i18n requirement (some scripts read poorly in uppercase) → write a successor ADR that documents the script-conditional treatment; do not edit this ADR's §D2 in place.
- The two grouping primitives (flat sections vs. `ion-card`) drift in code review — contributors mistakenly use `ion-card` on Lobby/Estimating, or flat sections in contexts where `ion-card`'s emphasis is genuinely warranted → consider a lint rule or a successor ADR that drops one of the two vocabularies.
- A future product surface adds a screen with content density similar to Lobby or Estimating → apply the flat-section pattern; no new ADR needed unless the section pattern proves wrong on that surface.

## Action Items

- [ ] Add the type-scale tokens declared in §D1 to `:root` in `packages/client/src/theme/variables.scss`. (Phase 1, separate agent.)
- [ ] Add the `.page-section` / `.page-section-header` / `.page-section-title` / `.page-section-meta` / `.page-section-body` rules from §D2 to `packages/client/src/global.scss`. Include the first-section-no-top-border treatment. (Phase 1, separate agent.)
- [ ] Drop `IonCard, IonCardContent, IonCardHeader, IonCardTitle` from `lobby.page.ts` standalone imports and replace the four `<ion-card class="section-card">` wrappers with `<section class="page-section">` blocks. Apply type tokens to `.room-code`, `.subtitle`, `.results-heading`, etc. Drop `expand="inset"` from the participants accordion and switch the rail action list to `lines="none"`. (Phase 2.)
- [ ] Drop `IonCard, IonCardContent, IonCardHeader, IonCardTitle` from `estimating.page.ts` and replace the two `<ion-card>` wrappers with `<section class="page-section">`. Apply type tokens to the round number and descriptors. (Phase 3.)
- [ ] Drop the internal "HISTORY" sub-header from `round-history.component.ts`. Apply type tokens to row text and metadata. (Phase 4.)
- [ ] Apply type tokens to `vote-results.component.ts`: result number → `--hnch-text-display`, "(N votes)" label → `--hnch-text-caption`, elapsed-time → `--hnch-text-caption`. (Phase 4.)
- [ ] Drop the `IonCard*` entries from `lobby.page.test.ts` and `estimating.page.test.ts` `vi.mock` blocks. (Phases 2, 3.)
- [ ] Update the Phase 6 `desktop-layout.spec.ts` assertion: change "section cards present" (selector `ion-card.section-card`) to "page-section blocks present" (selector `section.page-section`). (Phase 5.)
- [ ] Update `CLAUDE.md` "Current decisions at a glance": annotate the ADR-0039 line to flag §D3 superseded, and add a new line for ADR-0040 summarizing the flat-section + type-scale stance. Flag for orchestrator — the ADR author cannot edit `CLAUDE.md` directly. (Phase 1, separate agent.)
- [ ] Update `ux.md` §-wherever-Lobby-and-Estimating-wireframes-live to reflect the flat-section pattern. The card-grouping language from the ADR-0039 follow-up should be updated to flat-section language; cross-link this ADR.
- [ ] Update `angular.md` (or `ionic.md`) with the type-scale token vocabulary: list the six size tokens, the four weight tokens, the two letter-spacing tokens, and the rule that component CSS references tokens rather than hardcoding values.
- [ ] Watch for the type-scale token discipline drifting in code review; add to the code-review checklist.
- [ ] Verify the supersession trail: ADR-0039's §D3 paragraph carries the single-line clarification pointer to this ADR (mirroring ADR-0038 §Option D's pointer to ADR-0039). The ADR-0039 row in `adr/README.md` is annotated to flag §D3 superseded by ADR-0040. (Phase 1, this changeset.)

## Cross-references

- [ADR-0039](0039-ion-grid-section-cards-popover-overflow.md) — UI vocabulary follow-up. §D3 (`ion-card` section grouping on Lobby and Estimating) is superseded by this ADR's §D2. §D1 (`ion-grid` for responsive multi-column layouts) and §D2 (`ion-popover` for top-bar overflow menus) remain Accepted and unchanged. ADR-0039 §D3's token-reuse claim ("cards use `--hnch-surface`, `--hnch-sep`, `--hnch-fill`") is replaced by the flat-section pattern's reuse of `--hnch-sep` only; new color tokens are still not introduced, so the spirit of the constraint carries over.
- [ADR-0038](0038-responsive-layout-and-keyboard.md) — responsive baseline. The type-scale tokens and the flat-section pattern live *inside* the ADR-0038 structural shell: `.page-shell` caps and centers, `.lobby-shell` two-pane grid divides Lobby into rail + pane, and the flat sections sit inside whichever column they belong to. ADR-0038 §1–3 (breakpoints, container widths, `.page-shell`), §4 (two-pane Lobby), §5 (modal-to-dialog), §6 (keyboard contract), and §7 (focus + hover) are unaffected. The `.page-section` margin (1.5rem) is independent of the breakpoint values; sections compose at every viewport without per-breakpoint overrides.
- [ADR-0019](0019-scale-customization.md) — heterogeneous scales (Fibonacci, t-shirt, powers-of-2, linear, risk, custom) inform why the Estimating vote-card grid styling is **out of scope** for this ADR. The vote cards themselves are a domain-specific affordance (the voting target) whose visual treatment — borders, hover lift, selected state — is governed by the round mechanics rather than by the section-grouping vocabulary. Estimating's `<section class="page-section">` is the *container* for the vote-card grid; the cards inside the container retain their existing styling. A future ADR may revisit the vote-card visual; that's a separate decision.
- [ADR-0002](0002-frontend-framework-angular-ionic-capacitor.md) — Angular + Ionic + Capacitor stack. The flat-section pattern uses plain HTML semantics (`<section>` + `<header>` + `<h2>`) and Ionic-native tokens; no new framework dependency.
