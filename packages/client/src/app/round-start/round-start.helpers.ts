/**
 * Resolves the title value from the raw form input.
 * Trims whitespace; returns null when the result is empty (descriptor is optional).
 */
export function buildRoundStartTitle(rawValue: string): string | null {
  const raw = rawValue.trim();
  return raw === '' ? null : raw;
}
