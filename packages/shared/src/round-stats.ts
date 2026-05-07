import type { Scale } from './doc.js';

export type SpreadLabel = 'unanimous' | 'close' | 'spread';

/**
 * Stats for a revealed round. null when votes is empty.
 */
export type RoundStats =
  | { kind: 'numeric'; mean: number; median: number; mode: string; spread: SpreadLabel }
  | { kind: 'categorical'; mode: string }
  | null;

/**
 * Build stable card-order lookup tables for known and unknown cards.
 * Known cards: ordered by scale.cards position.
 * Unknown cards: sorted alphabetically among themselves, placed after all known cards.
 */
function buildCardOrder(values: string[], scaleCards: string[]): (card: string) => number {
  const knownIndex = new Map<string, number>();
  scaleCards.forEach((c, i) => knownIndex.set(c, i));

  const unknownSorted = [...new Set(values.filter((v) => !knownIndex.has(v)))].sort();
  const unknownIndex = new Map<string, number>();
  unknownSorted.forEach((c, i) => unknownIndex.set(c, scaleCards.length + i));

  return (card: string): number =>
    knownIndex.get(card) ?? unknownIndex.get(card) ?? Number.MAX_SAFE_INTEGER;
}

function computeMode(values: string[], cardOrder: (card: string) => number): string {
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);

  let best: string | null = null;
  let bestCount = 0;
  // Iterate in stable card order so first-in-scale wins ties
  const ordered = [...freq.keys()].sort((a, b) => cardOrder(a) - cardOrder(b));
  for (const card of ordered) {
    const count = freq.get(card)!;
    if (count > bestCount) {
      bestCount = count;
      best = card;
    }
  }
  // `ordered` is non-empty because values is non-empty (caller guarantees)
  return best!;
}

export function computeRoundStats(votes: Record<string, string>, scale: Scale): RoundStats {
  const values = Object.values(votes);
  if (values.length === 0) return null;

  const cardOrder = buildCardOrder(values, scale.cards);

  const isNumeric = scale.cards.every((c) => Number.isFinite(parseFloat(c)));

  if (isNumeric) {
    // Filter votes to finite-parseable numbers. Off-scale strings (e.g. 'foo')
    // would produce NaN and poison mean/median, so they are excluded here.
    // If no votes survive the filter, degrade to categorical.
    const numericValues = values.map(parseFloat).filter(Number.isFinite);
    if (numericValues.length === 0) {
      // All votes were non-numeric strings on a numeric scale — degrade gracefully.
      const mode = computeMode(values, cardOrder);
      return { kind: 'categorical', mode };
    }

    const mean = numericValues.reduce((s, n) => s + n, 0) / numericValues.length;

    const sorted = [...numericValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;

    const mode = computeMode(values, cardOrder);

    let spread: SpreadLabel;
    if (new Set(values).size === 1) {
      spread = 'unanimous';
    } else {
      // Use cardOrder for index lookup so off-scale votes don't return -1.
      const indices = values.map((v) => cardOrder(v));
      const min = Math.min(...indices);
      const max = Math.max(...indices);
      // Step distance ≤1 in card order means neighbours → 'close'
      spread = max - min <= 1 ? 'close' : 'spread';
    }

    return { kind: 'numeric', mean, median, mode, spread };
  }

  // Categorical path
  const mode = computeMode(values, cardOrder);
  return { kind: 'categorical', mode };
}
