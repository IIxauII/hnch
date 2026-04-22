# Plan: Settings Screen + Theme Picker (Phase 6a)

## Context

The Settings page is a placeholder ("Settings Page" text + back button). This phase builds it out per ux.md §5.7: display name editing, theme picker (System/Light/Dark), and about info. The theme picker requires a new `ThemeService` that manages dark mode via class toggling, replacing the current CSS-media-query-only approach.

---

## Steps

### 1. Create ThemeService

**New file:** `packages/client/src/app/core/theme.service.ts`

- `@Injectable({ providedIn: 'root' })`
- Preference key: `hnch.theme`, values: `'system' | 'light' | 'dark'`, default `'system'`
- `readonly theme: Signal<'system' | 'light' | 'dark'>` — synchronous after boot
- `async ensureLoaded(): Promise<void>` — reads pref, applies class, sets up media query listener
- `async setTheme(value): Promise<void>` — persists, updates signal, reapplies
- `private applyTheme(value)`:
  - `'dark'` → add `.ion-palette-dark` to `<html>`
  - `'light'` → remove it
  - `'system'` → toggle based on `matchMedia('(prefers-color-scheme: dark)')`, attach `change` listener for live toggling
- Detach the media query listener when switching away from `'system'`

### 2. Switch dark mode CSS from auto to class-based

**File:** `packages/client/src/global.scss` (line 32)

Change:
```
@import "@ionic/angular/css/palettes/dark.system.css";
```
To:
```
@import "@ionic/angular/css/palettes/dark.class.css";
```

This makes dark mode controlled by `.ion-palette-dark` on `<html>` instead of the CSS media query, giving ThemeService full control.

### 3. Wire ThemeService into boot + app shell

**`packages/client/src/main.ts`** — add app initializer:
```ts
provideAppInitializer(() => inject(ThemeService).ensureLoaded()),
```
Ensures theme class is applied before first paint (no flash).

**`packages/client/src/app/app.component.ts`** — inject to keep alive:
```ts
private readonly _theme = inject(ThemeService)
```

### 4. Create Theme Picker Sheet

**New file:** `packages/client/src/app/settings/theme-picker.sheet.ts`

- Follow the scale-picker/timer-picker pattern: radio group, commits on selection, Done button
- Input: `currentTheme = input.required<'system' | 'light' | 'dark'>()`
- Outputs: `selected = output<'system' | 'light' | 'dark'>()`, `closeRequested = output<void>()`
- Three `ion-radio` items: System, Light, Dark
- Emits `selected` on `ionChange`, no separate Save button

### 5. Create Display Name Editor Sheet

**New file:** `packages/client/src/app/settings/display-name-editor.sheet.ts`

- Input: `currentName = input.required<string>()`
- Outputs: `saved = output<string>()`, `closeRequested = output<void>()`
- `ion-input` pre-filled with current name, `FormControl` + `ReactiveFormsModule`
- Done button disabled when empty/whitespace
- On Done: trim, emit `saved`, emit `closeRequested`

### 6. Rewrite Settings Page

**File:** `packages/client/src/app/settings/settings.page.ts` (replace placeholder)

Inject: `DisplayNameService`, `ThemeService`, `DocService`, `ParticipantIdService`

**Template** — three `ion-list` sections:

**Profile:**
- "Display name" `ion-item button` → `ion-note slot="end"` shows current name → opens editor sheet

**Appearance:**
- "Theme" `ion-item button` → `ion-note slot="end"` shows "System"/"Light"/"Dark" → opens picker sheet

**About:**
- "Version" `ion-item` → `ion-note slot="end"` shows version string (add `appVersion` to environment configs)
- "Open source licenses" `ion-item` → placeholder (no action yet)
- "Privacy" `ion-item` → placeholder (no action yet)

**Two `ion-modal` half-sheets** (same pattern as lobby):
- `[breakpoints]="[0, 0.6, 0.95]"`, `[initialBreakpoint]="0.6"`
- Visibility driven by `nameEditorOpen` / `themePickerOpen` signals

**On name saved:**
1. `DisplayNameService.setDisplayName(newName)`
2. If mid-session: read the existing participant entry from `DocService.participants()` to get `joinedAt`, then call `DocService.upsertParticipant(id, { displayName: newName, joinedAt: existing.joinedAt })` so peers see the update without clobbering the join timestamp.

**On theme selected:**
1. `ThemeService.setTheme(value)`

### 7. Add `appVersion` to environment configs

**`environment.ts`** + **`environment.prod.ts`** — add `appVersion: '0.1.0'`

### 8. Unit tests for ThemeService

**New file:** `packages/client/src/app/core/theme.service.test.ts`

ThemeService has real logic worth testing — class toggling, media query listener lifecycle, mode switching:

- **Test 1:** `applyTheme('dark')` adds `.ion-palette-dark` to `document.documentElement`
- **Test 2:** `applyTheme('light')` removes `.ion-palette-dark`
- **Test 3:** `applyTheme('system')` adds class when `matchMedia` matches dark, removes when it doesn't
- **Test 4:** Switching from `'system'` to `'dark'` detaches the media query listener
- **Test 5:** `setTheme()` persists the value to Preferences
- **Test 6:** `ensureLoaded()` reads from Preferences and applies the correct class

Mock `@capacitor/preferences` (get/set) and `window.matchMedia` for deterministic tests.

### 9. E2E tests

**New file:** `packages/e2e/tests/settings.theme.spec.ts`

- **Test 1:** Navigate to settings → change theme to Dark → page goes dark (check `ion-palette-dark` class on `<html>`) → change to Light → class removed → change to System → follows system preference
- **Test 2:** Change display name in settings → navigate back to home → re-enter settings → name persists
- **Test 3:** Settings page shows version string

---

## Known v1 limitation

Brief flash-of-light-theme on cold start when user has dark preference. The `provideAppInitializer` blocks Angular rendering, but the pre-Angular HTML/CSS load is always light. Acceptable for v1; can optimize later with an inline `<script>` in `index.html`.

---

## Files modified / created

| File | Change |
|------|--------|
| `packages/client/src/app/core/theme.service.ts` | **New** — theme management |
| `packages/client/src/app/core/theme.service.test.ts` | **New** — unit tests |
| `packages/client/src/global.scss` | `dark.system.css` → `dark.class.css` |
| `packages/client/src/main.ts` | Add ThemeService app initializer |
| `packages/client/src/app/app.component.ts` | Inject ThemeService |
| `packages/client/src/app/settings/theme-picker.sheet.ts` | **New** — radio picker half-sheet |
| `packages/client/src/app/settings/display-name-editor.sheet.ts` | **New** — name editor half-sheet |
| `packages/client/src/app/settings/settings.page.ts` | Rewrite placeholder → full screen |
| `packages/client/src/environments/environment.ts` | Add `appVersion` |
| `packages/client/src/environments/environment.prod.ts` | Add `appVersion` |
| `packages/e2e/tests/settings.theme.spec.ts` | **New** — theme + name e2e tests |

## Verification

1. `pnpm --filter @hnch/client build` — compiles
2. ThemeService unit tests pass
3. `pnpm --filter @hnch/e2e test` — full suite green
4. Manual: set Dark → reload → stays dark. Set System → toggle OS dark mode → app follows. Set Light → always light.
5. Manual: edit display name mid-session → peers see new name in lobby
