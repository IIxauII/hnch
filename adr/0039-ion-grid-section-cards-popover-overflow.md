# ADR-0039: UI vocabulary follow-up — `ion-grid`, `ion-popover` overflow menus, and `ion-card` section grouping

**Status:** Accepted
**Date:** 2026-05-07
**Deciders:** xau

## Context

[ADR-0038](0038-responsive-layout-and-keyboard.md) shipped the responsive *structure* of the client: breakpoint custom properties, the `.page-shell` cap-and-center wrapper, the `.lobby-shell` two-pane grid at `≥1024px`, the modal-to-centered-dialog conversion, and the `KeyboardShortcutService` keyboard-shortcut contract. That layer landed correctly and the structural decisions in it remain in force.

Live testing on tablet and desktop viewports surfaced a second-order problem ADR-0038 did not address: the *vocabulary* the codebase reaches for inside the structural shell is mismatched in three places.

**1. Hand-rolled CSS Grid for responsive multi-column layouts.** ADR-0038 §Option D rejected `ion-grid` for what looked at the time like the right reasons — the codebase already uses `display: grid` for the Estimating card grid, and a parallel layout vocabulary was a real cost. After the responsive cascade landed, an audit of the client found seven distinct callsites declaring their own `display: grid` + `grid-template-columns` + breakpoint media-query expansion (Estimating cards, Lobby participants pane, results summary, history list, share/QR pane, settings groupings, round-detail layout). Each one re-derives the same pattern: declare a column count for mobile, expand at 768px, expand again at 1024px. The "small" cost of the parallel mental model has materialized as seven copies of the same boilerplate, each one a place where the breakpoint discipline can drift. The original cons-column claim ("the codebase has no `ion-grid` usage today, so adopting it now would cost familiarity for no gain") flips when the alternative is seven hand-rolled grids and growing. Ionic's responsive grid is in the supported surface per [ADR-0002](0002-frontend-framework-angular-ionic-capacitor.md); we already pay the import cost.

**2. `ActionSheetController` for overflow menus.** The `⋯` button on Lobby, Estimating, and Home opens an `ActionSheetController` sheet. On mobile this is correct: the iOS/Material idiom for a touch-target overflow is a bottom-anchored action sheet. On desktop the same control opens a sheet 700+ pixels below the trigger button — the user clicks the top-right corner of a 1440×900 viewport and a modal slides up from the bottom edge. ADR-0038's modal-to-centered-dialog rule (§5) addresses *modals* via shadow parts but does not touch `ActionSheetController`, which has its own anchoring model and no shadow-part hook for repositioning to the trigger. The natural Ionic primitive for "menu anchored to the element that opened it" is `popoverController` with the `event` field set to the click event — anchoring lives in the API itself, not in CSS overrides.

**3. Sectionless flat content inside the responsive shell.** Lobby and Estimating are the two screens with multiple content groups. Lobby surfaces room metadata + participants + post-reveal results + round history; Estimating surfaces the round subtitle/timer + the vote-card grid. Today both are flat sequences of components inside their `<ion-content>`, with separation conveyed by whitespace and per-component padding. At desktop+ widths inside the `.lobby-shell` two-pane, the lack of group framing means the right pane reads as a long uninterrupted vertical column of dissimilar widgets — there is no visual answer to "which section am I in?" The standard Ionic primitive for grouped content is `ion-card` + `ion-card-header` + `ion-card-content`, and the existing theme tokens (`--hnch-surface`, `--hnch-sep`, `--hnch-fill` — declared in `packages/client/src/theme/variables.scss`) already cover the surface, separator, and fill colors a card needs.

These three are one coordinated decision because they share one motivation: ADR-0038's structural layer needs a vocabulary pass to land cleanly. Splitting them into three ADRs would force three separate supersession-pointers on ADR-0038 §Option D and three independent rationales for what is functionally one follow-up. Documenting them together makes the boundary with ADR-0038 explicit and keeps the supersession surgical.

## Decision

Adopt three coordinated UI-vocabulary patterns inside the ADR-0038 structural shell. ADR-0038's breakpoint values, `.page-shell` cap, two-pane Lobby scope, modal-to-dialog rule, and keyboard contract are unchanged; this ADR refines what we put *inside* that shell.

### 1. `ion-grid` for responsive multi-column layouts

Use `ion-grid` / `ion-row` / `ion-col` with `size`, `size-md`, `size-lg`, `size-xl` attributes for any layout that needs different column counts at different breakpoints. Migrate the seven existing hand-rolled responsive grid callsites to `ion-grid` over time; new responsive grid callsites use `ion-grid` from day one.

Native CSS Grid (`display: grid`) stays valid for **fixed-cell, non-responsive affordances** — places where the column count is the same at every viewport because the component itself isn't responsive. Examples: a footer with two equal action buttons (`grid-template-columns: 1fr 1fr`), a 2×2 statistics tile cluster, an avatar + label + value row pattern. The discriminator is responsiveness: if the layout reflows at a breakpoint, use `ion-grid`; if it doesn't, plain CSS Grid is simpler and the dependency on Ionic's grid component is unwarranted.

This supersedes [ADR-0038](0038-responsive-layout-and-keyboard.md) §Option D **for the layout-vocabulary portion only**. ADR-0038's other sections — breakpoints, `.page-shell`, `.lobby-shell` two-pane, modal conversion, keyboard contract, focus-visible rule — remain Accepted and unchanged.

### 2. `ion-popover` for top-bar overflow menus

The `⋯` overflow menu on Lobby, Estimating, and Home is opened via `popoverController.create({ component: …, event })` rather than `ActionSheetController.create({ buttons: … })`. The `event` field anchors the popover to the click event's target on every viewport — desktop renders next to the trigger, mobile renders next to the trigger (which on a phone-sized viewport is still in the top bar, a few pixels below the button rather than 700 pixels below it).

Single path on mobile and desktop. No adaptive split between popover-on-desktop and action-sheet-on-mobile — `ion-popover` works on both, and a parallel mobile-vs-desktop branch would re-introduce the inconsistency this ADR is removing.

Behavioral semantics inherited from the action-sheet implementation are preserved:

- Destructive items (e.g., "End session for everyone", "Leave session") still trigger `AlertController` confirmation as a second step. The popover is a menu; the alert is the destructive-confirmation primitive.
- Haptic wiring on item press is unchanged (the existing tap haptic continues to fire from inside the popover's item handler).
- Item ordering, copy, role assignments (`destructive`, `cancel`) carry over.

The `cancel` role from `ActionSheetController` becomes a backdrop dismiss on `ion-popover` (the Ionic default — tap outside, popover closes). The explicit "Cancel" button row from the action sheet is dropped because popovers do not need one; users dismiss by tapping outside or pressing `Esc`.

### 3. `ion-card` section grouping on Lobby and Estimating

Lobby splits its content into four `ion-card` sections inside the existing two-pane shell:

- **Room** — room name, code, password indicator, share/QR (left rail at `≥1024px`).
- **Participants** — roster, role toggles, kick affordance (left rail at `≥1024px`).
- **Results** — post-reveal vote results (right pane at `≥1024px`; absent before reveal).
- **History** — round-history list (right pane at `≥1024px`).

Estimating splits its content into two `ion-card` sections:

- **Round** — round subtitle, elapsed-time stopwatch, participant-status row.
- **Vote** — the scale card grid plus the host's Reveal button.

Each card uses the standard composition: `ion-card` outer, `ion-card-header` with `ion-card-title` (and optional `ion-card-subtitle`), `ion-card-content` for the body. The keyboard-shortcut surface from [ADR-0038](0038-responsive-layout-and-keyboard.md) §6 is unaffected — the `R` / `1`–`9` / `Esc` bindings continue to dispatch off the active screen, not off the card boundary.

**Token reuse.** Cards use the existing tokens declared in `packages/client/src/theme/variables.scss`:

- `--hnch-surface` for the card background.
- `--hnch-sep` for the header/body divider and inter-card gaps where shown.
- `--hnch-fill` for any inner fill region (e.g., the participant-row hover/focus tint).

No new tokens are introduced. If a card needs a color the existing token set doesn't cover, that's a signal to widen the token vocabulary in a separate change, not to add a one-off card-specific variable.

**Width inheritance.** Cards inherit width constraints from the `.page-shell` (single-column screens) and `.lobby-shell` grid columns (Lobby two-pane). No new `max-width` rules on the card itself. If a card looks too wide on a particular viewport, the fix is at the shell level, not at the card level.

## Options Considered

### Option A: Land all three changes (chosen)

`ion-grid` for responsive multi-column layouts; `ion-popover` for overflow menus; `ion-card` section grouping on Lobby and Estimating. Single ADR, single supersession pointer on ADR-0038 §Option D.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — three vocabulary changes across the client, but each is mechanical inside a single component or layout |
| Cost | One pass through Lobby + Estimating + the seven responsive-grid callsites + the three overflow callsites |
| Desktop UX | Substantially better — anchored menus, framed sections, consistent grid system |
| Mobile UX | Equivalent to today — `ion-popover` works on touch viewports; `ion-card` is a familiar mobile pattern; `ion-grid` produces the same layout the hand-rolled grids produce today |
| Supersession surface | Narrow — ADR-0038's other sections are untouched |

**Pros:**
- One coordinated pass; the "vocabulary follow-up to ADR-0038" framing is honest.
- The `ion-grid` adoption removes the seven-callsite duplication; declarative `size-*` attributes are easier to read in review than hand-rolled `grid-template-columns` plus media-query blocks.
- Anchored overflow menus fix the desktop usability bug directly; no CSS workaround needed.
- Cards give the Lobby right pane and the Estimating page real visual structure; tokens reuse the existing palette.

**Cons:**
- Bundles three vocabulary decisions; a future contributor disagreeing with one of them must read the ADR for context on the other two.
- `ion-grid` and plain CSS Grid coexist (fixed-cell affordances stay on plain CSS Grid). The discriminator ("responsive → `ion-grid`, fixed → plain Grid") is a rule the contributor has to remember and apply correctly. Mitigated by examples in this ADR and by the small surface of fixed-cell cases.
- The "introduce a parallel layout system" cost ADR-0038 §Option D worried about is real — the codebase now has two grid vocabularies. The bet is that the discriminator is sharp enough to make the choice obvious case-by-case.

### Option B: Three separate ADRs (one per change)

ADR-0039 = `ion-grid` adoption (supersedes ADR-0038 §Option D); ADR-0040 = `ion-popover` overflow menus; ADR-0041 = `ion-card` section grouping.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Higher — three ADRs to author, three index entries, three sets of cross-references |
| Cost | Three rationales, each repeating the "ADR-0038 shipped structure; vocabulary needs follow-up" framing |
| Decoupling | Higher — each can be reverted independently |
| Audit clarity | Lower — readers hunting "what changed about UI vocabulary post-ADR-0038?" must read three documents |

**Pros:**
- Each decision is independently reversible. If `ion-popover` proves wrong but `ion-grid` and `ion-card` are fine, only one supersession is needed.
- Cleaner audit trail per-decision; each ADR has a single tight scope.

**Cons:**
- Three ADRs all motivated by the same observation ("ADR-0038 shipped structure; vocabulary needs a pass") create three near-identical Context sections. The duplication is real cost.
- The three changes are practically coupled at the implementation level — Lobby's cards contain `ion-grid` rows for participants, and the popover replaces the action-sheet that the cards' header overflow buttons open. A contributor reading any one ADR has to chase the other two for the full picture.
- Three ADRs mean three index entries and three points of supersession against ADR-0038 §Option D (or one supersession plus two unrelated ADRs whose framing has to explain why they're not also superseding). Bookkeeping cost without rationale benefit.

### Option C: `ion-grid` only; defer popover and cards

Land the `ion-grid` adoption now (the most defensible reversal of ADR-0038 §Option D given the seven-callsite consistency win) and defer the popover and cards changes to subsequent ADRs once that adoption is in production.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Lowest — single supersession, single vocabulary change |
| Cost | Smallest scoped change |
| User-visible impact | Minimal — `ion-grid` migration is mostly invisible to users; the desktop UX problems (anchored menus, section framing) remain unfixed |
| Risk of stalling | Real — "land the structural part now, fix the UX paper cuts later" is how the original ADR-0038 §Option D rejection happened, and the cost of the resulting parallel vocabulary is what justifies revisiting it |

**Pros:**
- Smallest possible change. Easiest to review. Easy to revert if `ion-grid` turns out to have rough edges this codebase hits.
- Clean "supersede `ion-grid` rejection in §Option D, leave everything else for later" framing.

**Cons:**
- The popover and cards problems are observed-in-the-wild bugs (`⋯` opens a sheet 700px from the trigger; Lobby right pane has no section framing at desktop widths). Deferring them means they ship in the next release while we wait for two more ADRs.
- The motivations are coupled — the cards proposal's "tokens reuse `--hnch-surface` etc." claim, and the popover's "single path on mobile and desktop" claim, are vocabulary choices that benefit from being reasoned about together so the implementations don't drift.
- The original ADR-0038 §Option D rejection ("introduces a parallel layout system without solving anything") was correct *given the information available at the time* — there was no seven-callsite duplication then. Revisiting it now without also addressing the other two vocabulary issues throws away the chance to do one coordinated cleanup pass.

### What changed since ADR-0038 §Option D rejected `ion-grid`

ADR-0038 §Option D framed `ion-grid` as a parallel system to plain CSS Grid that "introduces a parallel layout system… without solving anything CSS Grid + custom-property breakpoints does not." Two things changed:

- **Concrete callsite count.** Post-ADR-0038, the responsive cascade rolled out across the client, and the audit found seven hand-rolled responsive grids — Estimating cards, Lobby participants pane, results summary, history list, share/QR pane, settings groupings, round-detail layout. The "parallel system" comparison at write-time was hypothetical; the comparison now is "seven copies of the same `display: grid` + `grid-template-columns` + media-query expansion vs one declarative `<ion-col size-md="6" size-lg="4">`." The cost of the parallel mental model is fixed; the cost of the duplication grows with each new responsive surface.
- **Developer ergonomics.** ADR-0038's rejection treated `ion-grid` as equivalent to plain CSS Grid in expressiveness. In review practice, declarative `size-*` attributes are easier to scan than hand-rolled `grid-template-columns` plus a 1024px media-query block — the breakpoint values are implicit in the attribute name (`size-lg` = `≥1024px` per Ionic's grid breakpoints) rather than spelled out per callsite. A contributor proposing a new responsive grid layout reaches for `ion-grid` and gets the breakpoint discipline for free; a contributor reaching for `display: grid` has to remember to write the media query and must use the right pixel value.

The original rejection's reasoning was sound at the time. The facts now are different. The discriminator added in this ADR's §1 ("responsive → `ion-grid`, fixed-cell → plain Grid") preserves the simpler primitive for the cases where it's actually simpler, and adopts the declarative one for the cases where the duplication has accumulated.

## Trade-off Analysis

The chosen option (Option A — all three together) accepts a parallel-vocabulary cost in exchange for one coordinated pass through the UI surface. The codebase ends up with two grid vocabularies (`ion-grid` for responsive, plain Grid for fixed-cell), one anchored menu primitive (`ion-popover` everywhere — `ActionSheetController` retired from overflow contexts), and one section-grouping primitive (`ion-card` for Lobby and Estimating; other screens unchanged for now).

What we give up:

- **The "one grid vocabulary" simplicity ADR-0038 §Option D was protecting.** Two grid systems coexist. The discriminator is documented and sharp ("does the layout reflow at a breakpoint?") but it is a rule a contributor must apply rather than a default the framework picks for them. In practice this is recoverable in code review.
- **The cancel-row affordance from action sheets.** `ActionSheetController` provides an explicit "Cancel" button row that is conventional on iOS. `ion-popover` does not, and adding one back manually would defeat the point — popovers dismiss by tap-outside/`Esc`. A small affordance shift on mobile that lands closer to a desktop menu idiom on every viewport. The trade-off is intentional: anchored, single-path, consistent across viewports.
- **Symmetry across screens for section grouping.** Settings, Home, Join, Create do not gain `ion-card` grouping in this ADR — only Lobby and Estimating do. The asymmetry is deliberate: Settings is a leaf list whose existing `ion-list` already provides grouping; Home/Join/Create have one or two content groups that don't earn a card boundary. If a future change pushes one of those screens toward Lobby's content density, this ADR's pattern extends naturally — wrap each group in `ion-card`, reuse the same tokens. The trade-off is "do this where it earns its weight, leave it alone where it doesn't" rather than "card-up the entire app."

What we get:

- **Consistency at the seven responsive-grid callsites.** `ion-grid` removes the hand-rolled boilerplate and the breakpoint-discipline drift risk.
- **Anchored overflow on every viewport.** The desktop-overflow-menu-700px-from-trigger bug is fixed at the API level; no CSS workaround is needed.
- **Real visual structure on Lobby and Estimating at every viewport.** Cards group content and inherit existing tokens; the desktop two-pane reads as four boxed sections rather than a long flat column.
- **Narrow supersession surface.** ADR-0038 stays Accepted; only its §Option D `ion-grid` rejection is superseded, and only for the layout-vocabulary portion. The breakpoint values, `.page-shell` pattern, two-pane Lobby scope, modal-to-dialog rule, and keyboard contract from ADR-0038 continue in force.

The decision to keep the supersession surgical (ADR-0038 §Option D only, not the whole ADR) is load-bearing. ADR-0038's structural decisions — the breakpoints, the page shell, the keyboard contract — are correct and unchanged. Marking the entire ADR-0038 as Superseded would be wrong; appending a clarification pointer to the §Option D paragraph and superseding only that decision keeps the rest of ADR-0038 readable as the Accepted source-of-truth for everything else it covers.

## Consequences

**Easier:**

- New responsive multi-column layouts: declare `<ion-grid><ion-row><ion-col size-md="6" size-lg="4">…</ion-col></ion-row></ion-grid>` and the breakpoint discipline is implicit in the attribute names.
- Overflow menus on every screen: `popoverController.create({ component: OverflowMenuComponent, event })` and the menu anchors itself; no custom positioning, no per-viewport branching.
- Section grouping on dense screens: wrap a content group in `<ion-card>` and the existing tokens cover the surface, separator, and fill colors.
- Reading the codebase: the seven responsive grids look the same once migrated, so a reviewer encountering an unfamiliar grid recognizes the pattern at a glance.
- Reasoning about Lobby's two-pane: the four cards are visible structural units in the markup — "Room", "Participants", "Results", "History" — rather than a flat sequence of ad-hoc components held together by whitespace.

**Harder:**

- Two grid vocabularies coexist. The discriminator ("responsive → `ion-grid`, fixed-cell → plain CSS Grid") is documented in this ADR but enforced in code review. A new contributor reaching for `display: grid` for a responsive layout produces working code that doesn't follow the convention; we'll catch it in review or it'll diverge silently.
- The `ion-grid` import surface adds to the per-component standalone import list ([angular.md](../angular.md) imports). Components migrating away from plain Grid pick up `IonGrid`, `IonRow`, `IonCol` imports.
- `ion-popover` content components are a new component category in the client. Each overflow menu gets a dedicated `OverflowMenuComponent` (or screen-specific variant) rather than a `buttons: [{ text, role, handler }]` array literal at the callsite. More files; more explicit structure; per-overflow customization is easier but per-overflow setup is heavier.
- The `cancel` button row affordance from `ActionSheetController` is gone on mobile. Users dismiss popovers by tap-outside or `Esc`. This is the standard popover idiom on mobile but is a behavior shift from the existing action-sheet implementation; QA should confirm no regression in flows that depended on the explicit Cancel.
- Lobby and Estimating gain `ion-card` wrappers — markup is deeper, and any per-screen CSS that targeted the previous flat sequence (e.g., `:nth-child` selectors) needs an audit.
- Token usage is constrained to the existing `--hnch-surface`, `--hnch-sep`, `--hnch-fill` set. If a card's design needs a color the tokens don't cover, the fix is to widen the token vocabulary in a separate ADR, not to add a card-local variable. This is a discipline cost.

**Revisit triggers:**

- The `ion-grid` / plain-CSS-Grid discriminator drifts in practice — contributors mistakenly use `ion-grid` for fixed-cell layouts or `display: grid` for responsive layouts, and code review can't catch all of them → consider a lint rule or a successor ADR that drops one of the two vocabularies.
- `ion-popover` exhibits a bug or an interaction quirk that `ActionSheetController` did not — particularly around touch-target sizing on small mobile viewports (`ion-popover` defaults are tighter than action-sheet defaults) → write a successor ADR rather than reverting per-screen, since the divergence between mobile and desktop overflow is what this ADR is removing.
- A future product surface adds a screen with content density similar to Lobby (e.g., a session-admin screen, a per-round detail view) → apply the same `ion-card` section-grouping pattern; no new ADR needed unless the token set proves insufficient.
- The `ion-card` token usage outgrows `--hnch-surface` / `--hnch-sep` / `--hnch-fill` — a card design needs a hover state, a selected state, a destructive-tinted variant, etc. → widen the theme tokens in a dedicated ADR rather than introducing card-local variables.
- A future ADR adopts a unified component library for popovers, action sheets, and modals (e.g., a hnch-specific `OverflowMenuController` that branches internally) → that ADR supersedes §2 of this one, not the whole ADR.
- The "responsive → `ion-grid`" rule conflicts with a future Ionic API change (Ionic 9+ deprecates `ion-grid` in favor of CSS-only grid utilities, etc.) → write a successor ADR; the choice in this ADR is correct relative to current Ionic.

## Action Items

- [ ] Migrate the seven hand-rolled responsive-grid callsites to `ion-grid` / `ion-row` / `ion-col` with `size`, `size-md`, `size-lg`, `size-xl` attributes. Identified callsites: Estimating cards, Lobby participants pane, results summary, history list, share/QR pane, settings groupings, round-detail layout. Each migration should drop the per-callsite `grid-template-columns` and breakpoint media query in favor of declarative attributes.
- [ ] Replace `ActionSheetController` with `popoverController.create({ component, event })` for the `⋯` overflow menus on Lobby, Estimating, and Home. Author the `OverflowMenuComponent` (or screen-specific variants) that the popover renders. Preserve destructive-item `AlertController` confirmation chains and existing haptic wiring.
- [ ] Restructure Lobby into four `ion-card` sections (Room, Participants, Results, History) inside the existing `.lobby-shell` two-pane shell. Restructure Estimating into two `ion-card` sections (Round, Vote). Use `ion-card-header` + `ion-card-title` for section headers and `ion-card-content` for bodies. Reuse existing tokens (`--hnch-surface`, `--hnch-sep`, `--hnch-fill`) — no new tokens.
- [ ] Audit per-screen CSS on Lobby and Estimating for selectors that targeted the previous flat-sequence layout (e.g., `:nth-child` on the page content, descendant selectors that assumed no card wrapper) and update or remove as needed.
- [ ] Update `ux.md` §6 ("Interaction patterns") with the new overflow-menu pattern: anchored popover on every viewport, dismiss-by-tap-outside / `Esc`, no explicit Cancel row.
- [ ] Update `ux.md` §-wherever-Lobby-and-Estimating-wireframes-live with the new four-card and two-card section structures.
- [ ] Update `angular.md` (or `ionic.md`) with the `ion-grid` vs plain CSS Grid discriminator: responsive multi-column → `ion-grid`; fixed-cell, non-responsive → plain `display: grid`. Include one example of each.
- [ ] Update `CLAUDE.md` "Current decisions at a glance" with a one-liner summarizing this ADR (ion-grid for responsive layouts, ion-popover for overflow menus, ion-card section grouping on Lobby and Estimating, supersedes ADR-0038 §Option D for the layout-vocabulary portion only). Flag for orchestrator — the ADR author cannot edit `CLAUDE.md` directly.
- [ ] Add Playwright coverage for the new overflow-popover behavior on at least one mobile viewport and one desktop viewport: open the menu, assert it anchors near the trigger (not at the viewport bottom), dismiss by tap-outside, dismiss by `Esc`. The destructive-confirmation flow (e.g., "End session for everyone") gets one happy-path assertion that the `AlertController` still fires.
- [ ] Add Playwright coverage for the Lobby four-card and Estimating two-card structures at desktop viewport — assert each card's header text is present and visible.
- [ ] Watch for the `ion-grid` / plain-CSS-Grid discriminator drifting in code review; add to the code-review checklist.

## Cross-references

- [ADR-0038](0038-responsive-layout-and-keyboard.md) — responsive baseline. This ADR refines §Option D's `ion-grid` rejection and inherits ADR-0038's breakpoint values, `.page-shell` cap, `.lobby-shell` two-pane scope, modal-to-dialog rule, and `KeyboardShortcutService` keyboard contract unchanged. The supersession is layout-vocabulary-only; ADR-0038's other sections remain Accepted. ADR-0038 §Option D originally argued `ion-grid` "introduces a parallel layout system to plain CSS Grid (which the codebase already uses for the card grid) without solving anything CSS Grid + custom-property breakpoints does not. The codebase becomes inconsistent — some grids are `ion-grid`, others are `display: grid`. The cost of inconsistency is paid forever; the benefit is small." This ADR's §1 explains what changed (seven hand-rolled callsites materialized post-ADR-0038; the duplication outweighs the parallel-vocabulary cost) and how the discriminator constrains the parallel-system risk (responsive → `ion-grid`; fixed-cell → plain Grid).
- [ADR-0002](0002-frontend-framework-angular-ionic-capacitor.md) — Angular + Ionic + Capacitor stack confirms that `ion-grid`, `ion-popover`, and `ion-card` are all in the supported component surface; no new framework dependency is introduced.
- [ADR-0019](0019-scale-customization.md) — heterogeneous scales (Fibonacci, t-shirt, powers-of-2, linear, risk, custom) inform the Estimating card grid sizing. The Vote card's `ion-grid` configuration accommodates the variable card count per scale (5 cards for t-shirt, 7 for Fibonacci, up to N for custom scales) by declaring `size-md`/`size-lg`/`size-xl` proportions that produce 3/4/5-column grids at the corresponding viewports — the same column-count cascade ADR-0038 §4 specified for Estimating, now expressed in `ion-grid`'s vocabulary.
