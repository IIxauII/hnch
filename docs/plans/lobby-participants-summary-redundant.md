# Lobby participants accordion: hide summary when expanded

**Status:** Draft
**Date:** 2026-05-19
**Source spec:** docs/specs/lobby-participants-summary-redundant.md
**Shape:** Single PR

## Summary

Gate the Lobby participants accordion summary line on the collapsed state. Pre-reveal (accordion open) the summary disappears so the participant list below is the sole source of truth; post-reveal (accordion auto-collapsed) the summary continues to render in the header as today.

## Approach

Template + small signal addition in `packages/client/src/app/lobby/lobby.page.ts`. The existing `participantsAccordionValue()` is a one-way binding (intent / auto-collapse state), not actual DOM expanded state — `ion-accordion` is user-interactive and has no `(ionChange)` listener today. Gating purely on `participantsAccordionValue() === null` would still show the summary when a user manually expands the post-reveal accordion (the redundancy this PR removes).

Resolution: introduce a local `participantsAccordionOpen` signal initialised from `participantsAccordionValue()`, wire `(ionChange)` on `<ion-accordion-group>` to push the actual value into the signal, and gate the summary on `!participantsAccordionOpen()`.

Logic now:
- `participantsAccordionValue()` → still drives the initial / auto-collapse intent passed to `[value]` on `ion-accordion-group`.
- `participantsAccordionOpen` → `WritableSignal<boolean>`, true when the section is actually expanded in the DOM.
- `participantsSummary()` → unchanged.

Template shape:
```html
<ion-accordion-group
  [value]="participantsAccordionValue()"
  (ionChange)="onParticipantsAccordionChange($event)"
>
  ...
  @if (participantsSummary() && !participantsAccordionOpen()) {
    <p class="participants-summary">{{ participantsSummary() }}</p>
  }
</ion-accordion-group>
```

Handler:
```ts
onParticipantsAccordionChange(event: CustomEvent<{ value: string | null }>): void {
  this.participantsAccordionOpen.set(event.detail.value === 'open');
}
```

No SCSS change; no service edits.

## ADR impact

- None. Pure UX/client change. No sync protocol, schema, relay, or auth surface touched.

## Decisions resolved

1. **PR shape** — Single PR. Small client-only change; no migration, no cross-package coupling.
2. **Screenshots** — Required. Visible header layout shift; reviewer needs to confirm both states across breakpoints and themes.
3. **Worktree** — Yes. Per repo convention every PR phase runs in its own worktree.
4. **Accordion-state source (post-critique C1)** — Bind actual DOM state via `(ionChange)` into a new `participantsAccordionOpen` signal. Rejected: gating on intent-only `participantsAccordionValue()` (would leak the redundancy when a user manually expands the post-reveal accordion). Rejected: scoping AC to auto-collapse intent only (ships a known papercut against the spec's "single source of truth" goal).
5. **AC explicit on manual toggle (C2)** — Add AC line covering manual-expand parity; add the manual-toggle case to the smoke list.
6. **Unit coverage for new signal (C3)** — Add unit test asserting `onParticipantsAccordionChange` toggles `participantsAccordionOpen` for the `'open'` / `null` event payloads.

## Phases

### Phase 1 — Gate summary on collapsed state

- **Scope:** `packages/client/src/app/lobby/lobby.page.ts` (template + small handler + new signal) and a co-located unit test (new file or existing nearest spec; verify at execution).
- **Exit bar:**
  - Pre-reveal Lobby (accordion open): no `.participants-summary` `<p>` rendered.
  - Post-reveal Lobby (accordion auto-collapsed): summary renders as today.
  - Post-reveal Lobby + user taps to expand: summary hides while expanded; reappears on collapse.
  - Single-participant edge: no empty `<p>`.
  - Light + dark themes unaffected.
  - Unit test asserts `participantsAccordionOpen` flips on `(ionChange)` payloads (`'open'` → true, `null` → false).
  - `pnpm --filter @hnch/client lint && pnpm --filter @hnch/client typecheck && pnpm --filter @hnch/client test` green.
- **PR title scope:** `fix(client): hide lobby participants summary when accordion expanded` (or `fix(client)` — single package).
- **Worktree:** `git fetch origin && pnpm worktree:add lobby-participants-summary-redundant main` at execution time.
- **Depends on:** none.

## Open questions

- e2e coverage: does an existing Playwright spec assert participant-list rendering in Lobby pre/post-reveal where this guard can be wired in cheaply? Verify at execution; if absent, the AC unit-level smoke is sufficient — no new e2e required for a presence-toggle. Note: `packages/e2e/tests/participant-host-kick.spec.ts:29` already comments on the accordion-force-open pattern — worth checking whether that spec breaks once visibility tracks real DOM state.
- Test location: is there an existing `lobby.page.spec.ts` or should the new unit live in `lobby-summary.test.ts`? Decide at execution.

## Verification plan

- Per phase: `pnpm --filter @hnch/client lint`, `pnpm --filter @hnch/client typecheck`, `pnpm --filter @hnch/client test`.
- UI smoke (manual via `pnpm dev:client`):
  - Mobile viewport 390 px: Lobby pre-reveal → header shows no summary; post-reveal (after revealing one round) → accordion auto-collapses, summary returns.
  - Mobile 390 px: post-reveal, tap header to expand → summary hides; tap again to collapse → summary returns.
  - Portal viewport 1280 px: same three states.
  - Toggle theme; verify no color regression on the collapsed-state summary.
  - Single-participant room: no empty `<p>` artifact in DOM in any state.

## Screenshots

**Required:** Yes

- Screens:
  - Lobby — pre-reveal (accordion open) — confirms summary absent.
  - Lobby — post-reveal (accordion auto-collapsed) — confirms summary present.
- Variants: mobile (390 px) + portal (1280 px); light + dark.
- Path: `docs/screenshots/lobby-participants-summary-redundant/`
- Delivery: PR comment with branch-file links — `https://github.com/xauyxau/hnch/blob/<branch>/docs/screenshots/lobby-participants-summary-redundant/<file>.png`. No raw URLs, no pasted attachments, no markdown tables.
- Merge handling: squash/drop the screenshot commit before merge (images shouldn't ship in client build).

## References

- Spec: `docs/specs/lobby-participants-summary-redundant.md`
- Issue: https://github.com/xauyxau/hnch/issues/241
- UX flow: `docs/ux.md` (Lobby)
- Sibling logic: `packages/client/src/app/lobby/lobby-summary.ts` (`participantsAccordionValueFor`)
