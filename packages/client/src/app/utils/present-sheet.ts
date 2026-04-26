import type { IonModal } from '@ionic/angular/standalone'

export interface PresentSheetOpts {
  modal: IonModal
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
