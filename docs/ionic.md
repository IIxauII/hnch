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

### Form sheet action placement

Form sheets (any sheet with a Cancel or primary-action button) place those actions in the `ion-header` `ion-toolbar` — **not** in an `ion-footer`:

- Cancel: `<ion-buttons slot="start">` — fill, no color override.
- Primary action: `<ion-buttons slot="end">` with `strong="true"` and `color="primary"`.
- `ion-title` centred between them.

**Rationale:** at the `0.6` initial breakpoint on a real phone, the `ion-footer` is pinned to the bottom of the full-height modal wrapper — which is translated ~40% below the visible sheet edge. An on-screen keyboard pushes it further. The footer is unreachable regardless of whether the sheet is dragged or a field is focused. The header is always visible at the top of the exposed sheet area and stays above the keyboard.

The custom-scale editor already follows this pattern and serves as canonical prior art. A shared `SheetHeader` abstraction is explicitly deferred — the toolbar is hand-rolled inline in each sheet for now.

## Standalone component imports

All Ionic components must be imported individually in the component's `imports` array (e.g., `IonButton`, `IonContent`, `IonHeader`). There is no barrel import.

## Icons

Use `addIcons()` from `ionicons` in the component constructor to register icons by kebab-case name. Reference them in templates via `name="icon-name"`.

## Safe areas

Use `ion-header` / `ion-footer` for safe area handling — do not use raw `env(safe-area-inset-*)` CSS.

## Theming tokens

Single source of truth: `packages/client/src/theme/variables.scss`. Three layers:

1. **Ionic substrate** — `--ion-background-color`, `--ion-text-color` (+ `-rgb`), `--ion-color-{primary,success,warning,danger,medium}-*`. Drives stepped-color derivation and native component bg/text.
2. **hnch semantic tokens** — what components consume.
3. **Ionic component wiring** — `ion-card` / `ion-item` / `ion-list` / `ion-modal` / `ion-popover` / `ion-action-sheet` `--background` declarations in `variables.scss`. Component SCSS should not redeclare these unless overriding for an intentional effect (transparent toolbars, accent-tinted active rows).

### Surface elevation

Direction-aware: dark mode steps lighter than bg toward `#FFF`; light mode steps lighter than bg toward `#FFF`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--hnch-bg` | `#F2F2F7` | `#1C1C1E` | page background |
| `--hnch-elev-1` | `#FFFFFF` | `#2C2C2E` | cards, items, lobby panels |
| `--hnch-elev-2` | `#FAFAFB` | `#3A3A3C` | popovers, action sheets |
| `--hnch-elev-3` | `#F5F5F7` | `#48484A` | active/pressed, nested modal |

### Shadows

Light mode uses real shadows for elevation; dark mode keeps shadows subtle and relies on `--hnch-elev-N` lift for depth.

| Token | Light | Dark |
|---|---|---|
| `--hnch-shadow-1` | `0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.06)` | `0 1px 2px rgba(0,0,0,0.4)` |
| `--hnch-shadow-2` | `0 4px 12px rgba(0,0,0,0.08)` | `0 4px 12px rgba(0,0,0,0.5)` |
| `--hnch-shadow-3` | `0 12px 32px rgba(0,0,0,0.16)` | `0 12px 32px rgba(0,0,0,0.6)` |

Pair `--hnch-elev-N` with `--hnch-shadow-N` of matching tier.
