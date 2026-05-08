# ionic.md — Ionic conventions for hnch

Ionic-specific conventions and patterns for the client package. Consult alongside `angular.md` (Angular/TypeScript conventions) when writing or reviewing client code.

## Platform mode

Ionic's `mode` is intentionally left unset — it auto-detects per platform (iOS on iPhone, Material on Android/PWA). Do not hardcode `mode: 'ios'` or `mode: 'md'`.

## Dark mode / theming

### How it works

Dark mode is controlled via the `.ion-palette-dark` class on `<html>`, not via CSS media queries. This allows a three-way theme picker (System / Light / Dark) in the Settings screen.

- **CSS import:** `@ionic/angular/css/palettes/dark.class.css` in `global.scss` (not `dark.system.css`)
- **Class target:** `document.documentElement.classList` (the `<html>` element)
- **Manager:** `ThemeService` in `packages/client/src/app/core/theme.service.ts`

### Available palette files (reference)

| File | Behavior |
|------|----------|
| `@ionic/angular/css/palettes/dark.always.css` | Always dark, no toggle |
| `@ionic/angular/css/palettes/dark.system.css` | Follows `prefers-color-scheme` media query automatically |
| `@ionic/angular/css/palettes/dark.class.css` | Activates only when `.ion-palette-dark` is on `<html>` |

We use `dark.class.css` so `ThemeService` has full control.

### Three-mode toggle

| User setting | Behavior |
|---|---|
| **System** (default) | Listen to `matchMedia('(prefers-color-scheme: dark)')` and toggle `.ion-palette-dark` accordingly |
| **Light** | Never add `.ion-palette-dark` |
| **Dark** | Always add `.ion-palette-dark` |

The preference is stored in `@capacitor/preferences` under key `hnch.theme` and applied at boot before first paint via `provideAppInitializer` to avoid flash-of-wrong-theme.

### CSS custom property overrides

If overriding dark palette CSS custom properties, use `:root.ios` or `:root.md` for specificity — not bare `.ios` or `.md` selectors, which are added per-component and would take priority over global variables. Not needed in v1 (we use Ionic's default palette untouched).

## Half-sheet modals

All half-sheet modals follow this pattern:

- Parent owns an `ion-modal` with `[isOpen]` bound to a `signal<boolean>`
- Breakpoints: `[0, 0.6, 0.95]`, initial breakpoint `0.6`
- `(didDismiss)` resets the signal to `false`
- Child component inside `<ng-template>`, uses `host: { class: 'ion-page' }`
- Child communicates via `input()` / `output()` — no direct service calls for dismissal

Full-screen modals (e.g., QR display) omit `[breakpoints]` and `[initialBreakpoint]`.

## Standalone component imports

All Ionic components must be imported individually in the component's `imports` array (e.g., `IonButton`, `IonContent`, `IonHeader`). There is no barrel import.

## Icons

Use `addIcons()` from `ionicons` in the component constructor to register icons by kebab-case name. Reference them in templates via `name="icon-name"`.

## Safe areas

Use `ion-header` / `ion-footer` for safe area handling — do not use raw `env(safe-area-inset-*)` CSS.
