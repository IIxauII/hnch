# Plan: Auto-save custom scale editor

## Summary

Remove Save button from `CustomScaleEditorSheetComponent`. All changes auto-persist. Create mode defers first persist until valid (name + 2 cards), then transitions internally to edit mode.

## Decisions

1. **Create lifecycle**: once `canSave()` first goes true → `addCustomScale()` → hold minted id → subsequent changes use `updateCustomScale()`
2. **Header button**: "Cancel" before first auto-save (create), "Done" after auto-save / edit mode
3. **No footer**: remove footer entirely, no status indicator, no Save button. Inline hints above cards already cover validation feedback.
4. **Debounce**: 250ms on name input; card add/remove/reorder persist immediately

## Tasks

### T1: Add auto-save logic to `CustomScaleEditorSheetComponent`

**File:** `packages/client/src/app/session-settings/custom-scale-editor.sheet.ts`

- Add `persistedId` signal (string | null) — null in create mode until first save
- On init (edit mode), set `persistedId` to `existingScale().id`
- Add `autoSave()` method:
  - If `!canSave()` → skip
  - If `persistedId() === null` → call `addCustomScale()`, set `persistedId`, emit `created`
  - Else → call `updateCustomScale()`, emit `updated`
- Wire `autoSave()` to card mutations (add/remove/reorder) — call immediately
- Wire `autoSave()` to name input — debounced 250ms via `setTimeout`/clear pattern
- Remove `onSave()` method

### T2: Update template — remove footer, update header button

**File:** same

- Remove `<ion-footer>` block entirely
- Remove `IonFooter` from imports
- Header start button: `{{ persistedId() ? 'Done' : 'Cancel' }}`
- On click: if `persistedId()` is null → `closeRequested.emit()` (discard). If set → `closeRequested.emit()` (already saved).
  - Actually same handler either way — just emit close. Parent doesn't need to distinguish.

### T3: Remove `canSave` guard from template

**File:** same

- `canSave` computed stays (used internally by `autoSave`) but no longer bound to any button's `[disabled]`

### T4: Update parent consumers — remove `created`/`updated` output handling if needed

**Files:**
- `packages/client/src/app/session-settings/scale-picker.sheet.ts`
- `packages/client/src/app/settings/scale-management.sheet.ts`

- `created` and `updated` outputs still emit (parents use them to auto-select new scale in picker). Keep outputs, keep parent handlers. No change needed here unless outputs change signature.
- Actually: `created`/`updated` currently trigger `closeCustomEditor()` in both parents. With auto-save, these fire _before_ user closes. Parents should NOT auto-close on `created`/`updated` anymore — user stays in editor.
- Change: parents listen only to `closeRequested` for dismissal. Remove `(created)` and `(updated)` bindings that call close.
- Keep `(created)` in scale-picker to auto-select the new scale — but don't close.

### T5: Verify build + test in browser

- `pnpm build` passes
- Open scale picker → create custom scale → verify auto-save fires after 2nd card + name
- Edit existing → change name → verify debounced persist
- Add/remove/reorder cards → verify immediate persist
- Cancel before threshold → verify nothing persisted
- Reopen edited scale → verify changes survived
