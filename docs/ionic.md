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
- Breakpoints: `[0, 0.6, 0.95]`, initial breakpoint `0.6` (`SurfaceService.sheetBreakpoints()` / `initialSheetBreakpoint()`)
- `cssClass="modal-centered"` so the same modal is a centered dialog on desktop; add `modal-compact` for a form of one or two fields
- `(didDismiss)` resets the signal to `false`
- Child component inside `<ng-template>`, uses `host: { class: 'ion-page' }`
- Child communicates via `input()` / `output()` — no direct service calls for dismissal

A sheet whose content is a list that does not fit half a screen — the scale picker, the scale editors — opens at full height instead (`sheetBreakpointsFull()` / `initialSheetBreakpointFull()`). Content below the fold of a half-sheet cannot be scrolled to until the sheet is dragged up, and nothing on screen says so.

Full-screen modals (e.g., QR display) omit `[breakpoints]` and `[initialBreakpoint]`.

### Form sheet action placement

Form sheets (any sheet with a Cancel or primary-action button) place those actions in the `ion-header` `ion-toolbar` — **not** in an `ion-footer`:

- Cancel: `<ion-buttons slot="start">` — fill, no color override.
- Primary action: `<ion-buttons slot="end">` with `strong="true"` and `color="primary"`.
- `ion-title` centred between them.
- A sheet with nothing to cancel has one button: Done, which is its primary action — on the right, `strong`, `color="primary"`.
- A sheet that saves as it is edited (the custom-scale editor) has one button as well, and it stays where it is, on the right: Cancel until something has been saved, Done — `strong`, `color="primary"` — from then on. A button that changes sides is a button that is missed, and in `md` the title moves with one that leaves the start of the toolbar.

The weight is what tells the two apart: a toolbar button is regular, a `strong` one semibold.

**Rationale:** at the `0.6` initial breakpoint on a real phone, the `ion-footer` is pinned to the bottom of the full-height modal wrapper — which is translated ~40% below the visible sheet edge. An on-screen keyboard pushes it further. The footer is unreachable regardless of whether the sheet is dragged or a field is focused. The header is always visible at the top of the exposed sheet area and stays above the keyboard.

A shared `SheetHeader` abstraction is explicitly deferred — the toolbar is hand-rolled inline in each sheet for now.

### Focus

A sheet that exists to be typed into puts the cursor in its first field when it opens. Use `focusField(field)` (`app/utils/focus-field.ts`) from `afterNextRender`, not `field.setFocus()`: `setFocus()` does nothing on a field that has not rendered its native input yet, which a field that has just been created has not — and it fails without a word. `focusField` waits for the input, and for the sheet to finish opening; it leaves the field alone when the sheet is closed again before that, or when the cursor is in another of its fields by then.

A form that mostly goes out as it is (the round forms) takes the cursor on the desktop surface only — `SurfaceService.mode() === 'desktop'` — so that it does not open under a keyboard on a phone. See [ux.md](ux.md#forms-open-ready-to-type).

An Enter handler that submits asks `isComposingKey(event)` (`app/utils/composing-key.ts`) first: the Enter that picks a candidate in an input method is part of typing.

## Standalone component imports

All Ionic components must be imported individually in the component's `imports` array (e.g., `IonButton`, `IonContent`, `IonHeader`). There is no barrel import.

## Icons

Use `addIcons()` from `ionicons` in the component constructor to register icons by kebab-case name. Reference them in templates via `name="icon-name"`.

## Safe areas

Use `ion-header` / `ion-footer` for safe area handling — do not use raw `env(safe-area-inset-*)` CSS.

## Global styles

Three global stylesheets, in this order (`angular.json`):

1. `src/global.scss` — Ionic's own CSS.
2. `src/theme/variables.scss` — tokens (below).
3. `src/theme/components.scss` — what makes Ionic's components look like hnch. Loaded last, so it wins over Ionic's sheets by order. `!important` appears only where Ionic's own sheet uses it: the `--ion-color-*` pair of a component that carries a `color`. Two partials:
   - `_ionic-overrides.scss` — one look for buttons, toolbars, chips, inputs, lists, alerts, action sheets, toasts and desktop modals across `ios` and `md` mode. Buttons are sentence case with a 12px radius in both modes (toolbar buttons keep Ionic's compact one, a `shape="round"` button stays round); hover, focus and press on a clear or outline button are a light wash of the label's own color (the buttons of a header keep what Ionic gives a toolbar button: dimmed while pressed on iOS, a ripple on Android); a disabled solid button is neutral, not a dimmed accent. Inset lists have no margin or padding of their own — what sits around a list spaces it. Toolbars are flat with a hairline.
   - `_surfaces.scss` — the app's own building blocks: `.hnch-card` (+ `__header`, `__title`, `__title-note`, `__body`), `.section-label`, `.card-label`, `.visually-hidden`, the ticket chip and its `.ticket-link`, `.icon-tile`, `.empty-state`, and the `ion-footer.cta-bar` > `.cta-inner` CTA bar.

Reach for these before writing component SCSS; component styles keep to layout.

**Overriding an Ionic component.** Most are shadowed: a rule on the host from outside outranks the `:host` rules inside, whatever their specificity. `ion-input`, `ion-textarea` and `ion-list` are not, among others (`ion-label`, `ion-buttons`, `ion-alert`, `ion-action-sheet`) — they are scoped or plain, and what Ionic sets on them are ordinary rules with a class or two in them. A bare tag selector loses to those without any sign of it; select with the mode class (`ion-input.md, ion-input.ios`) or the classes Ionic's own rule has (`ion-list.list-inset.list-md`). When an override seems to do nothing, read the computed value.

Mixins for component SCSS live in `theme/_a11y.scss`:

- `focus-ring` — the `:focus-visible` outline.
- `hover-only` — hover styles for a mouse, none that stick on touch.
- `touch-target` — a 44px hit area for a control that is drawn smaller, without moving anything: an invisible `::after` behind the control reaches out from its centre, on devices that have a touch screen. Applied app-wide to `ion-button`, `ion-back-button` and `ion-toggle`; include it on a native `<button>` or link you style yourself. Put the include last in its rule, after the plain declarations. It cannot reach a control inside another component's shadow tree: the eye of `ion-input-password-toggle` stays the 36–40px Ionic draws it.

**A control stays inside its row.** `ion-item` clips its content. A button pulled outwards with a negative margin is cut off by that clip, and anything that scrolls it into view (`scrollIntoView()`, a test runner's click) drags the row's content sideways with it. To line an icon up with the edge of a row, zero the padding on that side (`--padding-end: 0`) and let the 44px target reach inwards. `packages/e2e/tests/controls-not-clipped.spec.ts` guards this.

Pages wrap their content in `<div class="page-container">` and opt into a width cap with the `page-container($max)` mixin (`theme/_page-container.scss`), which also lines the CTA bar up with the column.

## Theming tokens

Single source of truth: `packages/client/src/theme/variables.scss`. Three layers:

1. **Ionic substrate** — `--ion-background-color`, `--ion-text-color` (+ `-rgb`), `--ion-color-{primary,success,warning,danger,medium}-*`. Drives stepped-color derivation and native component bg/text.
2. **hnch semantic tokens** — what components consume.
3. **Ionic component wiring** — `ion-card` / `ion-item` / `ion-list` / `ion-modal` / `ion-popover` / `ion-action-sheet` `--background` declarations in `variables.scss`. Component SCSS should not redeclare these unless overriding for an intentional effect (transparent toolbars, accent-tinted active rows).

### Color on text

A color that works as a fill does not necessarily work as text. Two sets of tokens keep the two uses apart. Every text token holds WCAG AA (4.5:1) where text is put: on the page, a card and an overlay (`--hnch-bg`, `--hnch-elev-1`, `--hnch-elev-2`), and on a chip tinted with the color of the same name over the page or a card. They are tuned to 4.6:1, a little over the minimum — the browser composites a tint and rounds each channel its own way. `--hnch-elev-3` is a pressed state, not a surface for text.

| For | Fill | Text / icon / focus ring |
|---|---|---|
| Accent | `--hnch-accent` (+ `--hnch-accent-ink` on top of it) | `--hnch-accent-text` (+ `-rgb`) |
| Success | `--ion-color-success` | `--hnch-success-text` |
| Warning | `--ion-color-warning` | `--hnch-warning-text` |
| Danger | `--ion-color-danger` | `--hnch-danger-text` |
| Secondary text | — | `--hnch-muted` (`--hnch-muted-2` is for hairlines and glyphs only) |

`--hnch-accent-text` is written at runtime by `AccentService`, next to the accent itself: it is the chosen accent, lightened or darkened just far enough to reach 4.5:1 on each of those surfaces and on its own 16% tint. Racing Green as-is is 2.2:1 on a dark card; blue that holds on the page does not hold on a chip tinted with blue. `accent.service.test.ts` checks every accent in both themes, and that the surfaces it checks against are the ones in `variables.scss`; `theme/status-chip-contrast.test.ts` checks the three status labels on their chips.

An accent chip is tinted with 16% of its label's color; a status chip with its status *fill* — 16% of it, 18% for warning — under the darker label of the same name. Do not deepen a tint for hover or press — that moves the background toward the label; draw a ring instead (the role switch does).

What the browser draws itself follows the app's theme, not the OS's: `color-scheme` is set with the theme in `variables.scss`, and `ThemeService` writes the `theme-color` of the browser chrome.

### Surface elevation

Direction-aware: dark mode steps lighter than bg toward `#FFF`; light mode steps lighter than bg toward `#FFF`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--hnch-bg` | `#F2F2F7` | `#1C1C1E` | page background |
| `--hnch-elev-1` | `#FFFFFF` | `#2C2C2E` | cards, items, lobby panels |
| `--hnch-elev-2` | `#FAFAFB` | `#3A3A3C` | popovers, action sheets |
| `--hnch-elev-3` | `#F5F5F7` | `#48484A` | active/pressed |

### Shadows

Light mode uses real shadows for elevation; dark mode keeps shadows subtle and relies on `--hnch-elev-N` lift for depth.

| Token | Light | Dark |
|---|---|---|
| `--hnch-shadow-1` | `0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.06)` | `0 1px 2px rgba(0,0,0,0.4)` |
| `--hnch-shadow-2` | `0 4px 12px rgba(0,0,0,0.08)` | `0 4px 12px rgba(0,0,0,0.5)` |
| `--hnch-shadow-3` | `0 12px 32px rgba(0,0,0,0.16)` | `0 12px 32px rgba(0,0,0,0.6)` |

Pair `--hnch-elev-N` with `--hnch-shadow-N` of matching tier.
