# ionic.md — Ionic conventions for hnch

Ionic-specific conventions and patterns for the client package. Consult alongside `angular.md` (Angular/TypeScript conventions) when writing or reviewing client code.

## Platform mode

Ionic's `mode` is intentionally left unset — it auto-detects per platform (iOS on iPhone, Material on Android/PWA). Do not hardcode `mode: 'ios'` or `mode: 'md'`.

## Dark mode

Toggle dark mode by adding/removing the `.ion-palette-dark` class on `<html>`. Do not use the media-query palette (`dark.system.css`) — class-based control is required so the app can offer an explicit System / Light / Dark setting that overrides the OS preference.

When overriding dark-palette CSS custom properties, scope to `:root.ios` or `:root.md` — bare `.ios` / `.md` selectors are added per-component and would outrank global variables.

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
