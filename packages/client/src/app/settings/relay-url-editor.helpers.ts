/**
 * Pure helpers used by RelayUrlEditorSheetComponent — extracted so they
 * can be unit-tested directly without spinning up the Angular forms /
 * Ionic stack.
 */

export type RelayUrlValidationResult = { invalidUrl: true } | null;

/**
 * Empty / whitespace-only is valid (signals "use default relay").
 * A non-empty value must start with `http://` or `https://`.
 */
export function validateRelayUrl(rawValue: string): RelayUrlValidationResult {
  const val = rawValue.trim();
  if (!val) return null;
  if (!/^https?:\/\//.test(val)) return { invalidUrl: true };
  return null;
}
