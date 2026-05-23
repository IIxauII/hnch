# Screenshot OUT_DIR normalization

**Status:** Draft
**Date:** 2026-05-20
**Source:** https://github.com/IIxauII/hnch/issues/280

## Problem

`docs/screenshots/sha-<sha>/` on `main` has inconsistent layout. Three specs already write to per-feature subfolders (`agenda/`, `kbd/`, `vote-dots/`) while twelve write flat at the sha root. One spec (`room-history.spec.ts`) writes to a separate unprefixed dir `docs/screenshots/local-room-history/` outside the sha namespace entirely. Root cause: every spec under `packages/e2e/tests/_screenshots/*.spec.ts` hardcodes its own `OUT_DIR` with no shared convention — each migration since the harness landed has chosen a different shape. Contributors reading `docs/screenshots/latest/` cannot tell which scenes belong to which feature without grepping spec files, and the sticky PR comment shows scenes as a flat embed list with no feature grouping.

## Users

Project contributors and reviewers (developers, design-aware reviewers, AI agents reading `docs/screenshots/latest/` as visual baseline). Not end-user-facing.

## Proposed behavior

After this ships:

- Every published screenshot lives under `docs/screenshots/<sha>/<feature>/<name>.png`. No flat PNGs at the sha root, no unprefixed sibling dirs.
- Feature subfolder name is derived from the Playwright tag taxonomy in `packages/e2e/README.md → Tag catalog` (e.g. `viewer/`, `host/`, `password/`, `reveal/`, `skip/`, `history/`, `connection/`, `session-end/`, `home/`, `onboarding/`, `theming/`, `layout/`, `participants/`, `scale/`, `agenda/`). The three already-nested specs (`agenda/`, `kbd/`, `vote-dots/`) are renamed to tag-aligned slugs if needed.
- The `room-history.spec.ts` unprefixed dir `docs/screenshots/local-room-history/` is removed; its scenes move under the appropriate feature subfolder for the current sha.
- The sticky PR comment groups screenshot embeds by feature subfolder (one section per feature) instead of one flat list.
- `CONTRIBUTING.md → Screenshots` documents the convention so future specs follow it without prompting.

## Success criteria

- On any `main` commit after the change, `find docs/screenshots/sha-<sha> -maxdepth 1 -type f` returns empty — every PNG lives under a feature subfolder.
- `docs/screenshots/local-room-history/` no longer exists; its scenes live under the appropriate feature subfolder for the current sha.
- Every spec file in `packages/e2e/tests/_screenshots/*.spec.ts` resolves its output path through a single shared helper (no hardcoded `OUT_DIR` strings).
- The sticky PR screenshot comment shows scenes grouped by feature heading rather than a single flat embed list.
- A new contributor opening `docs/screenshots/latest/<feature>/` sees only that feature's scenes.

## Scope

**In:**
- Shared helper resolving `OUT_DIR` for all screenshot specs from a feature slug.
- Migration of all 16 specs under `packages/e2e/tests/_screenshots/` to the helper in a single PR (12 flat + 3 already-nested + 1 unprefixed).
- Removal of legacy `docs/screenshots/local-room-history/` unprefixed dir; its scenes move under a tag-aligned feature subfolder.
- Optional: rename the three pre-existing nested slugs (`kbd/` → `keyboard-shortcuts/`, `vote-dots/` → `vote-dots-196/` or align with tag, `agenda/` stays) to match the chosen tag taxonomy.
- Update to `scripts/screenshot-publish.mjs` PR-comment generator to group embeds by feature subfolder.
- Update to `CONTRIBUTING.md` Screenshots section + `CLAUDE.md` references to `docs/screenshots/latest/` consumers.

**Out (explicit anti-goals):**
- No new ADR — this is pure tooling/layout, not a structural decision.
- No change to which scenes are captured or their tags (coverage stays the same; only layout moves).
- No change to the `screenshots` orphan branch publishing mechanism, just the directory shape.
- No retroactive reshuffling of historical `sha-*` dirs on the screenshots branch — only new captures from this PR forward follow the new layout.

## Open questions

- Should there be a lint/test that fails CI when a new screenshot spec is added without going through the helper? (defer to /plan)
- Does the main-branch refresh workflow (`screenshots-main.yml`) need any adjustment beyond consuming the new layout via the unchanged `docs/screenshots/latest` symlink? (defer to /plan)
- What is the right slug for specs that span multiple tags (e.g. `participants` vs `viewer` for `participants.spec.ts`)? Probably the primary tag, but enumerate during migration.

## ADR impact

None — pure tooling/layout change. No ADR currently pins the flat directory shape (verified: no ADR in `adr/` constrains `docs/screenshots/` layout). `CLAUDE.md` mentions `docs/screenshots/latest/` as the canonical visual reference; that contract is preserved (only nested one level deeper).

## References

- Issue: https://github.com/IIxauII/hnch/issues/280
- Related spec: `docs/specs/e2e-screenshot-coverage-expansion.md`
- Publisher: `scripts/screenshot-publish.mjs`
- Tag catalog: `packages/e2e/README.md → Tag catalog`
- Affected specs: `packages/e2e/tests/_screenshots/*.spec.ts` (15 files)
