/**
 * Client-side scale customization types and resolution utilities (ADR-0019).
 *
 * Customization is resolved here, before any Yjs write. The wire format
 * (Scale: { id, cards }) is unchanged — peers and the relay see only the
 * flattened result.
 */

import { BUILTIN_SCALES, type Scale } from './doc.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-device preset overrides: maps a builtin scale ID to the set of card
 * indices that the user has disabled. An absent entry means "use all cards".
 *
 * Example: disabling card at index 7 ("21") from Fibonacci:
 *   { fibonacci: [7] }
 */
export type PresetOverrides = Record<string, number[]>;

/**
 * A fully user-defined scale stored on-device. ID must be prefixed `custom-`
 * to avoid collisions with builtin IDs.
 */
export interface CustomScale {
  /** Unique identifier, always prefixed `custom-`. */
  id: string;
  /** Human-readable label shown in pickers. */
  label: string;
  /** Card faces in display order. */
  cards: string[];
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a scale ID to a flat `{ id, cards }` ready to write into the Yjs
 * doc. Resolution order:
 *
 * 1. If `id` starts with `custom-`, find it in `customs` and return as Scale.
 * 2. If `id` matches a builtin, apply `overrides` (filter out disabled indices).
 * 3. Otherwise return `undefined` (caller should fall back to a default).
 */
export function resolveScale(
  id: string,
  overrides?: PresetOverrides,
  customs?: CustomScale[],
): Scale | undefined {
  if (id.startsWith('custom-')) {
    const custom = (customs ?? []).find((c) => c.id === id);
    if (custom) return { id: custom.id, cards: custom.cards };
    return undefined;
  }

  const builtin = BUILTIN_SCALES[id];
  if (builtin) {
    const disabled = (overrides ?? {})[id] ?? [];
    if (disabled.length === 0) return builtin;
    const cards = builtin.cards.filter((_, i) => !disabled.includes(i));
    if (cards.length === 0) return undefined;
    return { id, cards };
  }

  return undefined;
}

/**
 * Builds the full ordered list of available scales for pickers, combining
 * builtin presets (with overrides applied) and custom scales.
 *
 * Builtin presets with all cards disabled are excluded. Builtins come first
 * (in declaration order), then custom scales.
 */
export function buildAvailableScales(
  overrides?: PresetOverrides,
  customs?: CustomScale[],
): Scale[] {
  const builtins = Object.keys(BUILTIN_SCALES)
    .map((id) => resolveScale(id, overrides, customs))
    .filter((s): s is Scale => s !== undefined);

  const customScales: Scale[] = (customs ?? []).map((c) => ({ id: c.id, cards: c.cards }));

  return [...builtins, ...customScales];
}
