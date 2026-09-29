import type { IonInput, IonTextarea } from '@ionic/angular/standalone';

/** How long a sheet is given to finish opening before the field is focused regardless. */
const PRESENT_TIMEOUT_MS = 600;

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
 * that is still sliding up moves the sheet twice.
 *
 * Best effort, and silent about it: a field that cannot be focused is still
 * a field, one tap away.
 */
export async function focusField(field: IonInput | IonTextarea | undefined): Promise<void> {
  if (field === undefined) return;
  try {
    const input = await field.getInputElement();
    const overlay = input.closest('ion-modal, ion-popover');
    if (overlay !== null) await presented(overlay);
    // Gone again in the meantime.
    if (!input.isConnected) return;
    input.focus();
  } catch {
    // See above.
  }
}

/**
 * Resolves when `overlay` has finished its opening animation — or after a
 * moment, for an overlay that already had (nothing will be announced).
 */
function presented(overlay: Element): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      overlay.removeEventListener('didPresent', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, PRESENT_TIMEOUT_MS);
    overlay.addEventListener('didPresent', done);
  });
}
