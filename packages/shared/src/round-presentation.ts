/**
 * Round presentation — the single module that owns how a **Round** is turned
 * into display text.
 *
 * Every surface (mobile client, CLI, Markdown export) binds strings from here
 * rather than deriving them, so a round reads identically wherever it is shown
 * and a display fix lands in one place. Before this module the rules were
 * scattered: elapsed formatting had three implementations, the "does this round
 * have a knowable duration" guard was spelled four times, the abstain-stripping
 * rule that must precede statistics was spelled three times, and
 * `formatRoundLabel` named two unrelated ideas in two packages (issue #509).
 *
 * The module answers four questions:
 *
 *  - What is this round called?            → `formatRoundLabel`
 *  - Where does it sit in its chain?       → `formatRoundPosition`
 *  - What are its statistics, and how do
 *    they read?                            → `roundStatsFor` / `formatRoundStats`
 *  - How long did it take, if that is
 *    knowable at all?                      → `formatRoundElapsed`
 *
 * `formatElapsed(ms)` in `format-time` is deliberately *not* absorbed: it is a
 * duration primitive, not round presentation, and it remains the single clamp
 * point. Live tickers call it directly because a ticking display has no
 * terminal timestamp to hand a Round-shaped function.
 */

import { isAbstainVote } from './abstain.js';
import type { Round, Scale } from './doc.js';
import { formatElapsed } from './format-time.js';
import { resolveRoundLineage } from './lineage.js';

// ---------------------------------------------------------------------------
// Label and chain position
// ---------------------------------------------------------------------------

/**
 * Build a single human-readable label for a round combining its optional
 * `ticketId` and `title`. Used in lobby results headings and round-history
 * rows so display is consistent across web client and CLI.
 *
 * Returns:
 *   - `"PROJ-42 · Auth migration"` when both fields are set
 *   - `"PROJ-42"` when only `ticketId` is set
 *   - `"Auth migration"` when only `title` is set
 *   - `null` when neither is set (caller decides the placeholder)
 *
 * Ticket IDs are rendered as plain text. Hyperlinking to trackers is
 * intentionally out of scope for v1 (issue #109; ADR-0013 export follow-up
 * handles markdown autolinking separately via `round-export.ts`).
 */
export function formatRoundLabel(round: {
  readonly title?: string;
  readonly ticketId?: string;
}): string | null {
  const title = round.title?.trim() ?? '';
  const ticketId = round.ticketId?.trim() ?? '';
  if (ticketId !== '' && title !== '') return `${ticketId} · ${title}`;
  if (ticketId !== '') return ticketId;
  if (title !== '') return title;
  return null;
}

/**
 * Where a round sits in its re-vote chain, as one string:
 * `"Round 3"` for a chain root or standalone round, `"Round 2/3 [re-vote]"`
 * for a re-vote (issue #111 AC#7).
 *
 * A distinct name from `formatRoundLabel` because it is a distinct idea —
 * position, not identity. The two used to share the name across packages.
 *
 * The ordinal is derived from the round's position in `allRounds` (1-based),
 * matching what every call site already computed for itself. A round that is
 * not in `allRounds` has no position and falls back to `Round 0`; callers
 * always pass the array the round came from.
 */
export function formatRoundPosition(round: Round, allRounds: readonly Round[]): string {
  const lineage = resolveRoundLineage(round.id, allRounds);
  if (lineage !== null) return `Round ${lineage.depth}/${lineage.total} [re-vote]`;
  return `Round ${allRounds.findIndex((r) => r.id === round.id) + 1}`;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export type SpreadLabel = 'unanimous' | 'close' | 'spread';

/**
 * Stats for a revealed round. null when votes is empty.
 */
export type RoundStats =
  | { kind: 'numeric'; mean: number; median: number; mode: string; spread: SpreadLabel }
  | { kind: 'categorical'; mode: string; spread: SpreadLabel }
  | null;

// Spread thresholds:
//   numeric    — card-order step distance: 0 → unanimous, ≤1 → close, >1 → spread
//   categorical — distinct value count:    1 → unanimous,  2 → close, ≥3 → spread
function categoricalSpread(values: string[]): SpreadLabel {
  const distinct = new Set(values).size;
  return distinct === 1 ? 'unanimous' : distinct === 2 ? 'close' : 'spread';
}

/**
 * Build stable card-order lookup tables for known and unknown cards.
 * Known cards: ordered by scale.cards position.
 * Unknown cards: sorted alphabetically among themselves, placed after all known cards.
 */
function buildCardOrder(values: string[], scaleCards: string[]): (card: string) => number {
  const knownIndex = new Map<string, number>();
  scaleCards.forEach((c, i) => knownIndex.set(c, i));

  const unknownSorted = [...new Set(values.filter((v) => !knownIndex.has(v)))].toSorted();
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
  const ordered = [...freq.keys()].toSorted((a, b) => cardOrder(a) - cardOrder(b));
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

/**
 * Raw statistics primitive: plain votes plus a scale in, `RoundStats` out.
 *
 * Does **not** strip abstain votes — that is the caller's job (ADR-0041 §2),
 * and in production the caller is `roundStatsFor`, once, on everyone's behalf.
 * Kept on the package barrel so scale behaviour stays testable without
 * constructing a whole Round.
 */
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
      return { kind: 'categorical', mode, spread: categoricalSpread(values) };
    }

    const mean = numericValues.reduce((s, n) => s + n, 0) / numericValues.length;

    const sorted = [...numericValues].toSorted((a, b) => a - b);
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
  return { kind: 'categorical', mode, spread: categoricalSpread(values) };
}

/**
 * Statistics for a round: strips abstain votes, then calls the primitive.
 *
 * This sits *above* `computeRoundStats` rather than in front of it, so
 * ADR-0041's caller contract is untouched — the module simply becomes the
 * caller. Returns `null` for a round with no votes and for a round where
 * everyone abstained: an absence of estimates, not an estimate.
 */
export function roundStatsFor(round: Pick<Round, 'votes' | 'scale'>): RoundStats {
  const votes = Object.fromEntries(
    Object.entries(round.votes).filter(([, v]) => !isAbstainVote(v)),
  );
  return computeRoundStats(votes, round.scale);
}

/**
 * Display form of `RoundStats` — the same discriminant, every field a string
 * ready to bind. `null` in, `null` out, so callers branch once.
 *
 * `spread` is the *word* (`Unanimous` / `Close` / `Spread`). Spread *colour*
 * deliberately stays with the surface: Ionic colour names are not
 * presentation-neutral.
 */
export type RoundStatsDisplay =
  | { kind: 'numeric'; mean: string; median: string; mode: string; spread: string }
  | { kind: 'categorical'; mode: string; spread: string }
  | null;

function formatSpread(spread: SpreadLabel): string {
  return spread === 'unanimous' ? 'Unanimous' : spread === 'close' ? 'Close' : 'Spread';
}

/**
 * Render `RoundStats` as display strings. Mean and median both carry one
 * decimal place so the numbers on a surface read as one set.
 */
export function formatRoundStats(stats: RoundStats): RoundStatsDisplay {
  if (stats === null) return null;
  const spread = formatSpread(stats.spread);
  if (stats.kind === 'numeric') {
    return {
      kind: 'numeric',
      mean: stats.mean.toFixed(1),
      median: stats.median.toFixed(1),
      mode: stats.mode,
      spread,
    };
  }
  return { kind: 'categorical', mode: stats.mode, spread };
}

// ---------------------------------------------------------------------------
// Elapsed
// ---------------------------------------------------------------------------

/**
 * How long a round took, as `M:SS`, or `null` when it has no knowable
 * duration — pending and voting rounds (no terminal timestamp yet), skipped
 * and discarded rounds (no estimate was reached), and rounds whose timer never
 * started.
 *
 * The guard used to be spelled at four call sites; it is spelled here now.
 * Clamping is `formatElapsed`'s job and only its job, so a host clock running
 * ahead of a peer's reads `0:00` rather than a negative duration.
 */
export function formatRoundElapsed(
  round: Pick<Round, 'status' | 'terminalAt' | 'timerStartedAt'>,
): string | null {
  if (
    round.status !== 'revealed' ||
    round.terminalAt === undefined ||
    round.timerStartedAt === undefined
  ) {
    return null;
  }
  return formatElapsed(round.terminalAt - round.timerStartedAt);
}
