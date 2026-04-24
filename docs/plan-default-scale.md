# Plan: Default Scale Preference

## Summary

Add a device-local "default scale" preference so new sessions start with the user's preferred scale instead of always Fibonacci. Unify the scale picker UX across lobby and settings — one component for both picking and managing scales.

## Decisions

1. **Storage:** Store `defaultScaleId` (string) in `ScalePreferenceService` via Capacitor Preferences key `hnch.defaultScaleId`. Resolve ID against `availableScales` at read time; fall back to Fibonacci if ID not found (e.g. deleted custom scale).
2. **Component separation:** Extract scale concerns out of `SessionSettingsSheetComponent` so scale and access/password are separate components.
3. **Output over business logic:** The scale component emits a `scaleSelected` output. Parents handle persistence (lobby → doc, settings → preference service).
4. **Unified scale component:** Merge `ScalePickerSheetComponent` and `ScaleManagementSheetComponent` into one component that handles both default selection (radio) and editing/creating scales. Used identically in lobby and settings.
5. **Settings row:** Rename "Manage Scales" to "Default Scale" with current scale name shown as detail text.

## Tasks

### T1: Add `defaultScaleId` to `ScalePreferenceService`

**File(s):** `packages/client/src/app/core/scale-preference.service.ts`

- New Capacitor Preferences key `hnch.defaultScaleId` (string, defaults to `'fibonacci'`)
- Load in `ensureLoaded()` alongside existing keys
- New signal `defaultScaleId` exposing the stored value
- New computed `defaultScale` that resolves ID against `availableScales`, falls back to Fibonacci if ID not found
- New method `setDefaultScaleId(id: string)` → persists to Preferences + updates signal
- Success: service exposes reactive `defaultScale: Signal<Scale>` that survives app restart

### T2: Unify scale picker and scale management into one component

**File(s):** `packages/client/src/app/session-settings/scale-picker.sheet.ts`, `packages/client/src/app/settings/scale-management.sheet.ts`

- Merge capabilities of `ScalePickerSheetComponent` (radio selection + inline edit) and `ScaleManagementSheetComponent` (preset toggles + custom CRUD) into one unified component
- Component takes optional input for currently selected scale ID (for radio pre-selection)
- Emits `scaleSelected` output when user picks a scale
- Retains all editing capabilities: preset card toggles, custom scale create/edit/delete
- Remove `ScaleManagementSheetComponent` once unified component replaces all usages
- Success: one component handles both picking default + managing scales

### T3: Extract scale concerns from `SessionSettingsSheetComponent`

**File(s):** `packages/client/src/app/session-settings/session-settings.sheet.ts`

- Remove direct scale-picking logic and `docService.updateSettings()` call from this component
- Use the unified scale component (T2) for the scale row
- Wire `scaleSelected` output to write to doc via parent/inline handler
- Access/password row remains in `SessionSettingsSheetComponent`
- Success: `SessionSettingsSheetComponent` no longer contains scale business logic

### T4: Wire unified scale component into Settings page

**File(s):** `packages/client/src/app/settings/settings.page.ts`

- Replace "Manage Scales" row with "Default Scale" row showing current default scale name as detail text
- Tap opens unified scale component (T2) as a sheet
- Wire `scaleSelected` output → `ScalePreferenceService.setDefaultScaleId()`
- Remove import/usage of old `ScaleManagementSheetComponent`
- Success: Settings shows "Default Scale" with current preference, picker works identically to lobby

### T5: Use default scale preference when creating sessions

**File(s):** `packages/client/src/app/home/home.page.ts`

- Replace hardcoded `FIBONACCI_SCALE` with `ScalePreferenceService.defaultScale()` in both create and resume paths
- Inject `ScalePreferenceService` into the home page
- Success: new sessions start with user's preferred scale

### T6: Verify build + test in browser

- `pnpm build` passes
- Open Settings → "Default Scale" row shows "Fibonacci" by default
- Tap → unified picker opens, select "T-Shirt" → row updates to "T-Shirt"
- Create new session → lobby subtitle shows "Round 1 - T-Shirt"
- In lobby, tap subtitle → same picker opens, change scale → doc updates
- Kill app, reopen → Settings still shows "T-Shirt" as default
- Delete a custom scale that was set as default → default falls back to Fibonacci
