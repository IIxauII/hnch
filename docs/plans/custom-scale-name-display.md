# Custom scale name display fix

## Bug

User-defined `CustomScale.label` ignored on display. Three rendering sites show derived ID instead of stored name:

| Site | File:Line | Current output for `{id:'custom-7f3a', label:'My Team'}` |
|------|-----------|----------------------------------------------------------|
| Mobile lobby subtitle | `packages/client/src/app/lobby/lobby.page.ts:649` (uses **local** `formatScaleId` at L1131) | `Custom-7f3a` (only first char capitalised) |
| Mobile session-settings row | `packages/client/src/app/session-settings/session-settings.sheet.ts:207` | `7f3a` (shared `formatScaleId` strips `custom-` prefix) |
| Mobile settings page (default scale) | `packages/client/src/app/settings/settings.page.ts:282` | `7f3a` |
| Mobile scale-editor sheet title | `packages/client/src/app/session-settings/scale-editor.sheet.ts:100` | `7f3a` |
| Mobile scale-picker rows | `packages/client/src/app/session-settings/scale-picker.sheet.ts:294` (template `formatId`) | `7f3a` |
| CLI ConfigSettings detail | `packages/cli/src/ui/components/ConfigSettings.tsx:73` | `7f3a` |
| CLI ScalePicker rows + delete confirm | `packages/cli/src/ui/components/ScalePicker.tsx:156,189` | `7f3a` |
| CLI LobbySettings detail | `packages/cli/src/ui/components/LobbySettings.tsx:88` | `7f3a` |

Root cause: `formatScaleId(id)` (`packages/shared/src/doc.ts:280`) is pure — no access to `CustomScale[]`, so cannot read `label`. All call sites pass only the ID.

## Fix shape

Add a new shared helper `getScaleLabel(id, customs?)` in `packages/shared/src/scales.ts`:

```ts
export function getScaleLabel(id: string, customs?: CustomScale[]): string {
  if (id.startsWith('custom-')) {
    const c = (customs ?? []).find((c) => c.id === id);
    if (c && c.label.trim().length > 0) return c.label;
  }
  return formatScaleId(id);
}
```

Rules:
- Custom + non-empty label → return label.
- Custom + missing/empty label or not in list → fall back to `formatScaleId` (current behaviour: title-cased UUID). Preserves existing ID-only rendering for stale references.
- Builtin → unchanged path.

Keep `formatScaleId` exported — still useful for builtin-only contexts and as fallback.

## Plan

ONE worktree, ONE multi-scope PR, FIVE atomic commits. Multi-scope PR per CLAUDE.md rule (every modified package in scope list). Splitting into separate PRs would mean shared lands first with no consumer — risk of unused export — and doubles review surface. All five commits sit on one branch in `../hnch-custom-scale-name`.

### Worktree

```
git fetch origin
pnpm worktree:add custom-scale-name
cd ../hnch-custom-scale-name
```

PR title: `fix(shared,client,cli,e2e): show custom scale name instead of id`

### Commit 1 — `fix(shared): add getScaleLabel helper resolving CustomScale name`

- `packages/shared/src/scales.ts`: add `getScaleLabel`. Re-export from barrel if `index.ts` lists individual exports.
- `packages/shared/src/scales.test.ts` (or `doc.test.ts` if grouped): add cases:
  - custom id + matching label → returns label
  - custom id + matching empty/whitespace label → falls back to formatScaleId
  - custom id + no match in customs → falls back to formatScaleId
  - custom id + customs undefined → falls back
  - builtin id → formatScaleId result (unchanged)
- No consumer changes yet — pure addition, safe.

### Commit 2 — `fix(client): use getScaleLabel for custom scale display`

- `lobby.page.ts`: import `getScaleLabel` from `@hnch/shared`, drop local `formatScaleId` (L1131-1134), pass `scalePrefs.customScales()` (or equivalent signal) to helper at L649.
- `session-settings.sheet.ts:204-208`: read customs from injected `ScalePreferenceService`, call `getScaleLabel(id, customs())`.
- `settings.page.ts:280-283`: same swap.
- `scale-editor.sheet.ts:100`: same swap (note: editor is for builtin presets per current usage — still pass customs for correctness if used).
- `scale-picker.sheet.ts:294`: replace template `formatId` reference with a method or computed that resolves via customs.
- Update unit tests:
  - `session-settings.sheet.test.ts` — add case: custom scale with label renders label, not id.
  - `scale-picker.sheet.test.ts` — same.
  - `lobby.page.test.ts` — subtitle assertion for custom scale.
  - `settings.page.test.ts` — default scale label assertion for custom.

### Commit 3 — `fix(cli): use getScaleLabel for custom scale display`

- `ConfigSettings.tsx:73` — pass `localCustomScales`.
- `ScalePicker.tsx:156,189` — pass `displayScales`-source customs (or the `customScales` prop already in component).
- `LobbySettings.tsx:88` — pass customs from config.
- Vitest specs: `ConfigSettings.test.tsx`, `ScalePicker.test.tsx`, `LobbySettings.test.tsx` — add render cases asserting custom label appears, fallback when label empty.

### Commit 4 — `test(e2e): cover custom scale name in session settings + lobby`

No e2e currently exercises custom scales (`grep -l "custom" packages/e2e/tests/*.spec.ts` → empty). New spec `packages/e2e/tests/custom-scale-display.spec.ts`:

1. Host opens app settings → scale picker → create custom scale `name='Team Bananas'`, cards `['1','2','3']`.
2. Host creates session, opens session-settings sheet → asserts the scale row shows `Team Bananas` (not `<uuid>`).
3. Host returns to lobby → asserts subtitle contains `Team Bananas`.
4. Negative: edit custom scale, blank the name, reopen session-settings → asserts fallback rendering (raw id form) — proves graceful degradation.

Fixture:
- Extend `app.fixture.ts` `SCALE_DISPLAY_LABELS` with a helper that round-trips a custom label, OR add a dedicated `createCustomScale(name, cards)` participant action that drives the picker UI.

### Commit 5 — `chore: regenerate shared dist if checked in`

Only if `packages/shared/dist/*.d.ts` is committed (it appears in grep output). Otherwise drop.

## Verification before push

```
pnpm -F @hnch/shared test
pnpm -F @hnch/client test
pnpm -F @hnch/cli test
pnpm -F @hnch/e2e test:e2e -g "custom scale"
pnpm -w typecheck && pnpm -w lint
git diff --name-only main...HEAD | cut -d/ -f1-2 | sort -u   # confirm scope list matches
```

## Out of scope

- ADR: pure bug fix. No structural change. ADR-0019 already mandates label storage; this just consumes it. No new ADR needed.
- Renaming `formatScaleId` — keep stable to avoid churn; new helper is additive.
- Schema change: none.
