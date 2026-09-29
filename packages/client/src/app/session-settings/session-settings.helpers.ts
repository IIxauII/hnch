/**
 * Pure helpers used by SessionSettingsSheetComponent — extracted so the copy
 * can be unit-tested without mounting the Ionic component graph.
 */

/** One line under the settings list saying who can get in. */
export function accessHint(mode: 'open' | 'password'): string {
  return mode === 'password'
    ? 'Anyone joining needs this password as well as the code.'
    : 'No password: anyone with the code can join.';
}

/**
 * Placeholder for the password field. The relay only holds a hash, so a
 * protected session whose password was set elsewhere (or before a reload)
 * shows an empty field — the placeholder says it is set all the same.
 */
export function passwordPlaceholder(mode: 'open' | 'password'): string {
  return mode === 'password' ? 'Set. Type a new one to change it' : 'None';
}
