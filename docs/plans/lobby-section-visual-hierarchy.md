# Plan: Lobby section visual hierarchy

**Status:** Draft (post-critique revision 2)
**Date:** 2026-05-21
**Spec:** `docs/specs/lobby-section-visual-hierarchy.md`
**Issue:** https://github.com/IIxauII/hnch/issues/266
**Scope:** `feat(client,e2e): ...`
**Estimate:** 5 story points

## Summary

Lobby page is a single-column stack with weak section boundaries and inconsistent inner widths on both mobile and desktop. This plan introduces a unified visual primitive (subtle surface-raised panels with heading + leading icon) across General / Share / Participants / Agenda / Results / History; adds a responsive `ion-grid` 2-column split at `≥992px` (Ionic `lg`); and uses **`ion-accordion-group [multiple]="true"` for ALL sections** — collapsible ones (Share, Participants, History) collapse by default on mobile; non-collapsible ones (General, Agenda, Results) render as default-open accordions with chevron + toggle disabled via CSS so the DOM + a11y surface stays uniform. Pure UX/client change — no schema, sync, or relay surface touched.

## Approach

### Section primitive — `ion-accordion-group [multiple]` for all six sections

**Pivoted from custom `LobbySectionComponent` after critique round 1; further tightened in critique round 2 to all-accordion (no mixed plain `<section>`)** — see "Alternatives considered". Reuse Ionic's built-in `ion-accordion-group` + `ion-accordion`. Native benefits:

- Keyboard toggle (Enter / Space) — free.
- `aria-expanded` / `aria-controls` wiring — free.
- Hide via CSS `max-height` animation, not DOM removal — preserves child component state (scroll, open portals, `openParticipantActions` overlay).
- Animation respects `prefers-reduced-motion` — free.
- Uniform header DOM (`ion-item slot="header"`) across all six sections — no visual delta between collapsible and non-collapsible. (C5)
- Uniform a11y surface — every section header announces `aria-expanded`, even when expansion is locked open. (C6)

Two `ion-accordion-group [multiple]="true"` instances — one per column on desktop, one combined on mobile. Each section is an `ion-accordion` with a stable `value` (`'general' | 'share' | 'participants' | 'agenda' | 'results' | 'history'`). Non-collapsible sections (General, Agenda, Results) get a `.locked-open` class that:

- hides the chevron (`display: none`),
- removes hover affordance + cursor,
- intercepts the header click via `pointer-events: none` on the header text (Ionic still owns the row; we just suppress toggle).

Bound state lives in `LobbyPage` as a signal-array of expanded values:

```ts
// in LobbyPage
protected readonly expandedSections = signal<string[]>([]);
private prevMode: SurfaceMode | null = null;

constructor() {
  // 1) Mode-transition defaults: only re-apply when mode actually flips (C2)
  effect(() => {
    const mode = this.surface.mode();
    if (this.prevMode === mode) return;
    const isMobile = mode === 'mobile';
    const base = isMobile
      ? ['general', 'participants', 'agenda', 'results'] // share + history collapsed
      : ['general', 'share', 'participants', 'agenda', 'results', 'history']; // all open
    this.expandedSections.set(base);
    this.prevMode = mode;
  });

  // 2) Targeted Participants auto-collapse on first reveal — preserved existing behavior.
  effect(() => {
    if (this.hasTerminalRounds() && this.surface.mode() === 'mobile') {
      this.expandedSections.update((v) => v.filter((k) => k !== 'participants'));
    }
  });
}

protected onAccordionChange(event: CustomEvent): void {
  const v = event.detail.value;
  this.expandedSections.set(Array.isArray(v) ? v : v ? [v] : []);
}
```

**C2 resolution:** the defaults effect only re-fires on `surface.mode()` *transition* (prev-mode guard), NOT on every reveal. Participants auto-collapse-on-reveal is moved to its own targeted effect that only edits the `'participants'` membership; other sections' user-set toggles are preserved across reveals.

**Locked-open CSS sketch:**

```scss
ion-accordion.lobby-section.locked-open {
  ion-icon[slot='end'] { display: none; }      // hide chevron
  ion-item[slot='header'] {
    --background-hover: transparent;
    pointer-events: none;                       // suppress toggle click
  }
}
```

`general`, `agenda`, `results` get `[value]="..."` included in initial `expandedSections` defaults so they render expanded; the `.locked-open` class prevents the user from collapsing them.

### Shared section chrome SCSS

```scss
ion-accordion.lobby-section {
  display: block;
  background: var(--hnch-surface, var(--ion-card-background));
  border-radius: 12px;
  margin-bottom: 1rem;
  --background: transparent;
}
ion-accordion.lobby-section ion-item[slot='header'] {
  --background: transparent;
  --padding-start: 1rem;
}
ion-accordion.lobby-section .lobby-section__heading {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0;
}
ion-accordion.lobby-section ion-icon[slot='start'] {
  margin-inline-end: 0.5rem;
}
```

Heading lives inside the `<ion-item slot="header">` content; it's marked-up as `<h2 class="lobby-section__heading">` so screen readers can navigate the lobby by landmark+heading.

Icons (via `ionicons` already in repo): `share-outline` (Share), `people-outline` (Participants), `list-outline` (Agenda), `stats-chart-outline` (Results), `time-outline` (History). General has no leading icon (room code is the visual anchor).

### Reconciling existing component chrome (C3 + C7)

`AgendaPanelComponent` and `RoundHistoryComponent` each own their own `<section>` + heading + padding. AgendaPanel also has internal mobile-only chip-collapse + empty-state Add CTA (`expanded` signal + `addRequested` output emitted from a mobile chip when `pendingCount===0`).

**Plan:**

- **Strip the OUTER chrome only** — the wrapping `<section aria-label="...">` + its heading. Body content + internal mobile chip + empty-state Add chip in AgendaPanel are preserved intact.
- **Reparent OUTER heading + icon** into the lobby template's `ion-item slot="header"` of the Agenda / History accordion.
- **DO NOT** strip AgendaPanel's internal mobile chip-collapse logic (`expanded` signal, lines ~53–97) — that's the next-up compact state and is the user's primary mobile interaction.
- **DO NOT** strip AgendaPanel's empty-state `<ion-chip>` Add CTA (lines ~84–96) — the `addRequested` output stays wired.

**Concretely required edits in `AgendaPanelComponent`:**

- Remove outer wrapping `<section class="agenda-panel" aria-label="Agenda">` and outer heading.
- Keep `expanded` signal + chip-collapse + empty Add chip.
- Update `agenda-panel.component.test.ts` for stripped outer chrome only — leave chip-collapse + add tests untouched.
- Verify no other caller relies on the outer `<section>`/`aria-label` — `rg "app-agenda-panel" packages/client/src --type ts`.

**Concretely required edits in `RoundHistoryComponent`:**

- Remove wrapping `<section class="history" aria-label="Round history">` + `<h3 class="history-heading">`.
- Keep body (round list) intact.
- Update component tests for stripped chrome.
- Verify no other caller: `rg "app-round-history" packages/client/src --type ts`.

### Participants section — accordion replacement

Today: `<ion-accordion-group>` wraps `<ion-accordion value="open">` for Participants. After this plan: Participants is one of six `<ion-accordion>` entries inside the column-level `ion-accordion-group [multiple]`, with `value="participants"`.

**Critical wiring (C9):** sibling spec `lobby-participants-summary-redundant.md` (already merged) gates `participants-summary` on `participantsAccordionOpen()`. Replace its source:

```ts
protected readonly participantsAccordionOpen = computed(() =>
  this.expandedSections().includes('participants'),
);
```

`lobby-summary.ts` helpers `participantsAccordionValueFor` / `participantsAccordionOpenFromValue` become obsolete and are removed; `lobby-summary.test.ts` updated.

### Desktop 2-column split (≥992px)

`ion-grid` / `ion-row` / `ion-col` with `size="12" size-lg="6"`. Matches repo convention (110 `ion-grid` hits, zero plain CSS grid at page level).

Column assignment at `≥992px`:

- **Left column (lg=6):** General · Share · Participants
- **Right column (lg=6):** Agenda · Results · History

Each column owns its own `ion-accordion-group [multiple]`. General sits at the top of the left column (simpler markup, stable reading order at the 992 collapse boundary). Results renders conditionally on `lastRevealedRound()`; when absent, History rises in the right column.

### Visual anchor

Baseline references on `main`:

- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/06-lobby-1440.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/20-lobby-390.png?raw=true
- https://github.com/IIxauII/hnch/blob/main/docs/screenshots/latest/baseline/15-lobby-results-1440.png?raw=true

## Alternatives considered

- **Native `<details>` / `<summary>`:** keyboard + a11y + reduced-motion free, but inconsistent styling across browsers and bypasses Ionic's interaction language. Rejected.
- **Custom `LobbySectionComponent` with signal-based collapse:** earlier draft. Re-implements aria-expanded/aria-controls, chevron rotation, keyboard, reduced-motion — all of which `ion-accordion` ships tested. Rejected.
- **Mixed `<ion-accordion>` + plain `<section>` for non-collapsible:** rejected in critique round 2 — header DOM (`ion-item slot=header` Shadow DOM vs plain `<header>`) and `aria-expanded` semantics diverge irreconcilably. All-accordion with `.locked-open` chosen instead.
- **Keep AgendaPanel + RoundHistory internal chrome, style their `<section>` to match (option B):** two sources of truth for section appearance; harder to keep parity. Rejected.
- **CSS-only collapse via `:host-context` / media queries:** can't toggle on user interaction without JS. Rejected.

## ADR impact

**None triggered.** Pure UX/client layout change. No identity, sync, persistence, access, or relay surface affected. No theme token / palette changes. Confirmed against ADR-0019, ADR-0020, ADR-0036, ADR-0042 — all behavior preserved.

## Decisions resolved

1. **Desktop layout primitive:** `ion-grid` + `ion-row` + `ion-col` with `size-lg="6"`. Matches repo convention.
2. **Desktop multi-col breakpoint:** **992px** (`$bp-lg`, Ionic `lg`). Ionic's standard tokens are `xs<576 / sm≥576 / md≥768 / lg≥992 / xl≥1200`; spec's "≥1024" was loose — superseded by `lg=992`.
3. **Section boundary style:** Subtle surface raise + rounded corners, no shadow.
4. **Section heading:** Heading text + leading icon. Lives inside `ion-item slot="header"` of each `ion-accordion`.
5. **Default collapse policy:** Mobile — Share collapsed, History collapsed; Participants follows `hasTerminalRounds()`; Agenda + Results + General always expanded (locked-open). Desktop `≥992px` — all expanded (locked-open and unlocked sections both expanded by default).
6. **Section reordering:** Mobile order unchanged. Desktop 2-col — left: General + Share + Participants; right: Agenda + Results + History.
7. **Host vs joiner template:** Single template with `@if (isHost())` conditionals.
8. **PR shape:** Single PR, scope `feat(client,e2e): ...`.
9. **Section primitive:** **`ion-accordion-group [multiple]="true"` with `ion-accordion` for ALL sections.** Non-collapsible sections get `.locked-open` class that hides chevron + suppresses toggle via CSS. Pivoted from earlier-draft `LobbySectionComponent`; pivoted again in round 2 from mixed accordion+section to all-accordion for uniform DOM/a11y.
10. **Screenshots:** 4 screens × 2 viewports × 2 themes × 2 roles = **32 PNGs**. New tag `@lobby-hierarchy`.
11. **ADR:** None triggered.
12. **Cross-mode user toggle behavior (C2):** defaults effect re-fires only on `surface.mode()` *transition* (prev-mode guard); reveals do NOT clobber user-set Share/History toggles. Participants auto-collapse on first reveal is moved to a separate targeted effect.
13. **Tag regex (C5 round 1):** `@lobby-hierarchy|@layout` — kept broader regression net.
14. **AgendaPanel internal chrome preservation (C3+C7 round 2):** strip outer `<section>` + heading ONLY. Keep internal mobile chip-collapse (`expanded` signal) + empty-state Add chip intact.

## Phases

**Single phase — single PR.** Scope: ~12–16 files under `packages/client/` + `packages/e2e/`.

### Files expected to change

**Client:**

- `packages/client/src/app/lobby/lobby.page.ts` — replace inline section markup with two `<ion-accordion-group [multiple]="true">` (one per column) containing six `<ion-accordion>` entries; add `ion-grid`/`ion-row`/`ion-col` 2-col split with `size-lg="6"`; introduce `expandedSections` signal, mode-transition `effect` with `prevMode` guard, and targeted Participants auto-collapse `effect`; replace `participantsAccordionValueFor`/`participantsAccordionOpenFromValue` usage with the new `expandedSections.includes('participants')` computed; add the shared `.lobby-section` SCSS + `.locked-open` modifier; add icons.
- `packages/client/src/app/lobby/lobby.page.test.ts` — update for new DOM; assert: mode-transition reset behavior, reveal does NOT reset Share/History user toggles, Participants auto-collapses on reveal, locked-open sections cannot be collapsed via header click, `participantsAccordionOpen()` derives from `expandedSections`.
- `packages/client/src/app/lobby/lobby-summary.ts` — remove obsolete `participantsAccordionValueFor` + `participantsAccordionOpenFromValue`.
- `packages/client/src/app/lobby/lobby-summary.test.ts` — drop tests for removed helpers.
- `packages/client/src/app/agenda/agenda-panel.component.ts` — strip outer `<section aria-label="Agenda">` + outer heading ONLY. **Keep** internal mobile chip-collapse + empty-state Add chip.
- `packages/client/src/app/agenda/agenda-panel.component.test.ts` — update only the outer-chrome assertions; leave chip-collapse + add-chip tests intact.
- `packages/client/src/app/shared/round-history.component.ts` — strip wrapping `<section aria-label="Round history">` + `<h3>`. Body-only output.
- `packages/client/src/app/shared/round-history.component.test.ts` — update for stripped chrome.

**E2e:**

- `packages/e2e/tests/_screenshots/lobby-hierarchy.spec.ts` *(new)* — `@lobby-hierarchy` tagged spec covering the 32-PNG matrix.
- `packages/e2e/tests/agenda.spec.ts` — update selectors that target `app-agenda-panel section.agenda-panel` (lines ~175, ~297) to the new lobby-owned accordion header / body surface.
- `packages/e2e/tests/_screenshots/agenda-states.spec.ts` — update selectors (lines ~75, ~118) targeting the stripped outer chrome.
- `packages/e2e/tests/_screenshots/capture.spec.ts` — update `app-round-history` selector (line ~205) to new accordion body surface.
- *(verify before impl)* full `rg`: `rg "agenda-panel section|round-history|Collapse agenda|aria-label=\"Agenda\"|aria-label=\"Round history\"" packages/e2e` — enumerate every additional spec/fixture coupled to stripped chrome and add to this list.

## Acceptance criteria

- New user can name each lobby section at a glance from boundary + heading + icon, in both viewports, both themes, both roles.
- Desktop lobby at 1440 uses a 2-column `ion-grid` `size-lg="6"`; columns assigned per Decisions §6.
- Single column on mobile (390); 2-col flip at `≥992px`; verified at 991 (single) and 992 (two-col).
- Mobile defaults: Share + History collapsed; Participants follows `hasTerminalRounds()`; General + Agenda + Results expanded and locked-open. Desktop: all expanded (locked-open + unlocked both visible).
- Resize / orientation flip across 992 snaps accordion expansion to the mode's defaults via the prev-mode-guarded effect. Within the same mode, user toggles persist. (C2)
- Reveal flipping `hasTerminalRounds()` from `false` → `true` only affects the Participants section on mobile; Share + History user-set toggles are NOT reset. (C2)
- AgendaPanel mobile next-up chip-collapse (`expanded` signal) continues to function — tap chip expands list, tap again collapses to chip. (C3)
- AgendaPanel empty-state mobile `<ion-chip>` "Add agenda" CTA continues to emit `addRequested` and reach the host's `openAddAgendaItem()` handler. (C7)
- All six section headers expose `aria-expanded`. Locked-open sections (General, Agenda, Results) cannot be collapsed via header click but still announce expand state. Chevron hidden via CSS on locked-open. (C5 + C6)
- Empty-agenda state: the "Add agenda item" CTA is reachable in both viewports without any collapse toggle. (C10 from round 1)
- `participantsAccordionOpen()` correctly drives the `lobby-participants-summary-redundant` gate (sibling spec).
- Keyboard: Tab to a collapsible section header, Enter/Space toggles expansion; focus stays on header after toggle. Locked-open headers are Tab-focusable but Enter/Space do not toggle. (C12 from round 1)
- `prefers-reduced-motion`: chevron + expand animation respect the user setting (Ionic default; assert in test). (C12)
- All existing agenda + round-history e2e selectors continue to resolve after chrome strip. (C4)
- Participants swipe-to-kick continues to resolve after a collapse → expand cycle of the Participants accordion. (C8)
- No telemetry / analytics added (ADR-0028).

## Open questions

1. **Ionic `ion-accordion-group [multiple]` API contract:** verify before impl via Context7 against the installed `@ionic/angular` major version: (a) `[value]` accepts `string[]` when `[multiple]="true"`, (b) `ionChange.detail.value` payload is `string[]` (not delta), (c) initial render expands all listed values, (d) setting `[value]="[]"` programmatically collapses all. Pin the version + cite docs in PR description. The current `onAccordionChange` handler hedges with `Array.isArray(v) ? v : v ? [v] : []` precisely because this is unverified. (C1)
2. **Locked-open click suppression:** confirm `pointer-events: none` on the `ion-item slot="header"` text doesn't break Ionic's internal focus management (Tab order, focus ring on header still reachable). Fallback: add `[disabled]="true"` on the inner `ion-item` or intercept via `(click)="$event.stopImmediatePropagation()"` on the header for locked-open sections.
3. **AgendaPanel "Add agenda item" CTA reparenting:** clarified above — outer button reparented; mobile chip + empty-chip Add stay inside AgendaPanel. Confirm at impl start that no third "Add" affordance exists.
4. **Icons:** confirm Ionicons names listed above are imported; add to the `addIcons({ ... })` registry call.
5. **Screenshot tag name:** plan uses `@lobby-hierarchy`. Verify against existing tag catalog in `packages/e2e/README.md → Tag catalog`. If a more canonical name exists, swap.

## Critique-rejected challenges

- **Round 1 C5 (`@layout` tag broadens pre-push):** rejected. Plan retains `@lobby-hierarchy|@layout` for regression coverage. Slower lefthook accepted as cost.

## Verification

- `pnpm -C packages/client typecheck`
- `pnpm -C packages/client lint`
- `pnpm -C packages/client test --run` (lobby.page.test, lobby-summary.test, agenda-panel.component.test, round-history.component.test)
- `pnpm -C packages/client build`
- `pnpm -C packages/e2e lint`
- E2e screenshot subset: `pnpm -C packages/e2e screenshots:run --grep '@lobby-hierarchy|@layout'` (or project's equivalent invocation; lefthook pre-push runs the tag-scoped subset automatically).
- Flake-check the new e2e spec 5× before merge.
- E2e a11y assertions: keyboard toggle, `aria-expanded` state (including locked-open=true throughout), `prefers-reduced-motion` honored.
- E2e swipe-to-kick sanity (C8): toggle Participants accordion closed → open, then swipe-kick on a participant row — assert the kick confirm renders.

## Screenshots

**Required:** Yes.

- **Screens:** lobby empty · lobby with participants+agenda · lobby with history · lobby post-reveal results.
- **Variants:** 4 screens × 2 viewports (390 / 1440) × 2 themes (light / dark) × 2 roles (host / joiner) = **32 PNGs**.
- **Path:** `docs/screenshots/lobby-section-visual-hierarchy/`
- **Delivery:** PR branch + sticky comment via lefthook pre-push hook + `screenshots` branch flow.
- **Merge handling:** N/A — screenshot artifacts live on the `screenshots` branch; main CI refreshes on merge.

## Screenshot tags

`@lobby-hierarchy|@layout`

Rationale: `@lobby-hierarchy` covers the matrix above. `@layout` intentionally included for cross-cutting layout-regression coverage (currently matches: vote-dots-196, vote-bars-shot, keyboard-shortcuts, estimating-shot, agenda-states, capture). Confirm tag canonicalisation against `packages/e2e/README.md → Tag catalog` at impl start.

## References

- **Spec:** `docs/specs/lobby-section-visual-hierarchy.md`
- **Sibling specs (already merged):**
  - `docs/specs/lobby-host-actions-portal.md`
  - `docs/specs/lobby-participants-summary-redundant.md`
  - `docs/specs/lobby-subtitle-tap-affordance.md`
- **ADRs touched (none modified):** ADR-0019 (scales), ADR-0020 (viewer role), ADR-0036 (participant removal), ADR-0042 (agenda)
- **UX flows:** `docs/ux.md` §5.4 (Lobby)
- **Conventions:** `docs/angular.md`, `docs/ionic.md`
- **Issue:** https://github.com/IIxauII/hnch/issues/266
