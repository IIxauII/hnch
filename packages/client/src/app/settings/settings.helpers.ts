import type { AccentKey } from '../core/accent.tokens';
import { ACCENTS } from '../core/accent.tokens';
import type { Theme } from '../core/theme.service';

/** Returns true when value is one of the three supported theme strings. */
export function isValidTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Returns true when value is a key present in the ACCENTS token map. */
export function isValidAccent(value: unknown): value is AccentKey {
  return typeof value === 'string' && value in ACCENTS;
}

/** Display label for the relay URL setting — falls back to "Default" when unset. */
export function relayUrlDisplayLabel(url: string | null | undefined): string {
  return url || 'Default';
}
