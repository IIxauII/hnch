import type { IonModal } from '@ionic/angular/standalone'

export interface PresentSheetOpts {
  modal: IonModal
}

const SHEET_BREAKPOINTS_MOBILE: number[] = [0, 0.6, 0.95]
const SHEET_INITIAL_BREAKPOINT_MOBILE = 0.6

/**
 * Returns the half-sheet breakpoints for mobile, or `undefined` for
 * desktop (≥1024px). When `undefined` is passed to <ion-modal>, Ionic
 * renders the default centered card dialog. ADR-0038.
 *
 * Note: evaluated at component-construction time. Modals re-presented
 * after a window resize won't switch modes mid-flight, but since modals
 * are short-lived sheets, the user will close and reopen anyway —
 * acceptable for v1.
 */
export function getSheetBreakpoints(): number[] | undefined {
  if (typeof window === 'undefined') return SHEET_BREAKPOINTS_MOBILE
  return window.matchMedia('(min-width: 1024px)').matches
    ? undefined
    : SHEET_BREAKPOINTS_MOBILE
}

/**
 * Companion to `getSheetBreakpoints()`. Returns `undefined` at desktop.
 */
export function getSheetInitialBreakpoint(): number | undefined {
  if (typeof window === 'undefined') return SHEET_INITIAL_BREAKPOINT_MOBILE
  return window.matchMedia('(min-width: 1024px)').matches
    ? undefined
    : SHEET_INITIAL_BREAKPOINT_MOBILE
}

const SHEET_BREAKPOINTS_TALL: number[] = [0, 0.6, 1]
const SHEET_INITIAL_BREAKPOINT_TALL = 1

/**
 * Tall variant of `getSheetBreakpoints()` for sheets that prefer full-
 * height on mobile (e.g. multi-row editors). Returns `[0, 0.6, 1]` on
 * mobile, `undefined` at desktop (≥1024px) so Ionic renders a centered
 * card dialog. Same resize trade-off as `getSheetBreakpoints`. ADR-0038.
 */
export function getTallSheetBreakpoints(): number[] | undefined {
  if (typeof window === 'undefined') return SHEET_BREAKPOINTS_TALL
  return window.matchMedia('(min-width: 1024px)').matches
    ? undefined
    : SHEET_BREAKPOINTS_TALL
}

/**
 * Companion to `getTallSheetBreakpoints()`. Returns `1` (full-height) on
 * mobile, `undefined` at desktop. ADR-0038.
 */
export function getTallSheetInitialBreakpoint(): number | undefined {
  if (typeof window === 'undefined') return SHEET_INITIAL_BREAKPOINT_TALL
  return window.matchMedia('(min-width: 1024px)').matches
    ? undefined
    : SHEET_INITIAL_BREAKPOINT_TALL
}

/**
 * Presents an IonModal half-sheet and restores focus to the invoking element
 * on dismiss. Captures `document.activeElement` synchronously before
 * presenting, so keyboard/touch focus returns correctly (bug 1.4, ADR-0010).
 *
 * Returns the overlay's didDismiss result so call sites that inspect
 * `{ data, role }` can continue to do so.
 */
export async function presentSheet(opts: PresentSheetOpts): Promise<{ data?: unknown; role?: string }> {
  const previousFocus = document.activeElement as HTMLElement | null

  await opts.modal.present()

  const result = await opts.modal.onDidDismiss()

  if (previousFocus && document.contains(previousFocus)) {
    previousFocus.focus()
  }

  return result
}
