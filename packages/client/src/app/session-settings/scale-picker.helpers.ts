/**
 * Pure helpers for ScalePickerSheetComponent — extracted so they can be
 * unit-tested directly without mounting the Angular / Ionic stack.
 */

import { BUILTIN_SCALES } from '@hnch/shared';

/**
 * Joins a card array with ' · ' for display in scale picker rows.
 * Exported so callers can preview arbitrary card sets without a Scale object.
 */
export function previewCards(cards: string[]): string {
  return cards.join(' · ');
}

/**
 * Returns the preview string for a builtin scale, respecting disabled-card
 * overrides.  Unknown IDs return an empty string.
 *
 * @param id       Builtin scale ID (e.g. 'fibonacci').
 * @param overrides Map of scale ID → disabled card indices (device-local prefs).
 */
export function previewBuiltinCards(id: string, overrides: Record<string, number[]>): string {
  const builtin = BUILTIN_SCALES[id];
  if (!builtin) return '';
  const disabled = overrides[id] ?? [];
  const cards =
    disabled.length === 0 ? builtin.cards : builtin.cards.filter((_, i) => !disabled.includes(i));
  return previewCards(cards);
}
