import type { IonInput, IonTextarea } from '@ionic/angular/standalone';

/**
 * How long a sheet is given to finish opening before the field is focused
 * regardless. Well past the longest opening animation (the iOS sheet, about
 * half a second), which has been running for a moment when the wait starts.
 */
export const PRESENT_TIMEOUT_MS = 800;

export interface FocusFieldOptions {
  /**
   * The overlay the field is in has been open for a while: there is no
   * opening to wait for, and nothing will say that it is over. Without this
   * the wait runs its full length, and the focus arrives late enough to land
   * on top of what the user has done in the meantime.
   */
  readonly overlayIsOpen?: boolean;
}

/**
 * Put the cursor in an Ionic field.
 *
 * Not `setFocus()`: it does nothing on a field that has not rendered its
 * native input yet — and a field that is focused because it has just
 * appeared (revealed by an `@if`, or in a sheet that is opening) has not.
 * `getInputElement()` waits for it.
 *
 * A field inside an overlay waits for the overlay to finish opening. Focus
 * brings up the keyboard on a phone, and a keyboard sliding in under a sheet
 * that is still sliding up moves the sheet twice. If the overlay is closed
 * again before it has opened, or the user has put the cursor in another of
 * its fields by then, the field is left alone.
 *
 * Best effort, and silent about it: a field that cannot be focused is still
 * a field, one tap away.
 */
export async function focusField(
  field: IonInput | IonTextarea | undefined,
  opts: FocusFieldOptions = {},
): Promise<void> {
  if (field === undefined) return;
  try {
    const input = await field.getInputElement();
    const overlay = input.closest('ion-modal, ion-popover');
    if (overlay !== null) {
      if (opts.overlayIsOpen !== true && !(await presented(overlay))) return;
      if (typingElsewhereIn(overlay, input)) return;
    }
    // Gone again in the meantime.
    if (!input.isConnected) return;
    input.focus();
  } catch {
    // See above.
  }
}

/**
 * Resolves with `true` when `overlay` has finished its opening animation —
 * or after a moment, for an overlay that already had (nothing will be
 * announced). Resolves with `false` when it is being closed instead.
 */
function presented(overlay: Element): Promise<boolean> {
  return new Promise((resolve) => {
    const settle = (opened: boolean): void => {
      overlay.removeEventListener('didPresent', onOpened);
      overlay.removeEventListener('willDismiss', onClosing);
      overlay.removeEventListener('didDismiss', onClosing);
      clearTimeout(timer);
      resolve(opened);
    };
    const onOpened = (): void => settle(true);
    const onClosing = (): void => settle(false);
    const timer = setTimeout(onOpened, PRESENT_TIMEOUT_MS);
    overlay.addEventListener('didPresent', onOpened);
    overlay.addEventListener('willDismiss', onClosing);
    overlay.addEventListener('didDismiss', onClosing);
  });
}

/**
 * True when the cursor is already in another field of `overlay`. Focus on
 * anything else in there — the overlay itself, which takes it on opening, or
 * a button — is not somebody typing.
 */
function typingElsewhereIn(overlay: Element, input: Element): boolean {
  const active = document.activeElement;
  if (active === null || active === input || !overlay.contains(active)) return false;
  return active.matches('input, textarea, select, [contenteditable]');
}
