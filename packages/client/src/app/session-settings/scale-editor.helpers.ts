/**
 * Pure helpers for ScaleEditorSheetComponent — extracted so they can be
 * unit-tested directly without mounting the Angular / Ionic stack.
 */

import { BUILTIN_SCALES } from '@hnch/shared';

export interface CardRow {
  /** Zero-based position in the builtin card array. */
  index: number;
  /** Display face (e.g. "5", "M"). */
  face: string;
  /** True when the card is currently active (not in disabled list). */
  enabled: boolean;
  /** True when this is the last enabled card — prevents creating an empty scale. */
  disableToggle: boolean;
}

/**
 * Builds the toggle-row view-model for a builtin scale given the
 * currently-disabled card indices.
 *
 * Returns an empty array for unknown scale IDs so callers need no guard.
 */
export function computeCardRows(scaleId: string, disabledIndices: number[]): CardRow[] {
  const builtin = BUILTIN_SCALES[scaleId];
  if (!builtin) return [];

  const enabledCount = builtin.cards.length - disabledIndices.length;

  return builtin.cards.map((face, index) => {
    const enabled = !disabledIndices.includes(index);
    return {
      index,
      face,
      enabled,
      disableToggle: enabled && enabledCount === 1,
    };
  });
}
