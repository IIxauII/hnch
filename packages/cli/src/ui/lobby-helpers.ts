/**
 * Pure helpers used by Lobby.tsx — extracted so they can be unit-tested
 * directly without rendering the Ink tree.
 */

import { resolveRoundLineage, terminalState } from '@hnch/shared';
import type { Round } from '@hnch/shared';

/**
 * Format the `Round …` label, surfacing re-vote chain position when
 * the round is a re-vote (issue #111 AC#7). Falls back to a plain
 * `Round N` for chain roots / standalone rounds.
 */
export function formatRoundLabel(
  round: Round,
  roundNum: number,
  allRounds: readonly Round[],
): string {
  const lineage = resolveRoundLineage(round.id, allRounds);
  if (lineage === null) return `Round ${roundNum}`;
  return `Round ${lineage.depth}/${lineage.total} [re-vote]`;
}

/**
 * Compose the bold header text shown above ResultsSection in the Lobby —
 * `<label><title?><ticket?> — Results` or `… — Skipped`. Extracted as a
 * pure helper so the JSX in Lobby.tsx is a single binding and the
 * composition is unit-testable.
 */
export function buildResultsHeader(
  round: Round,
  roundNum: number,
  allRounds: readonly Round[],
): string {
  const label = formatRoundLabel(round, roundNum, allRounds);
  const title = round.title ? ` — ${round.title}` : '';
  const ticket = round.ticketId ? ` [${round.ticketId}]` : '';
  const suffix = terminalState(round) === 'skipped' ? ' — Skipped' : ' — Results';
  return `${label}${title}${ticket}${suffix}`;
}

export function computeStats(votes: Record<string, string>): {
  average: string;
  median: string;
  agreement: string;
} {
  const values = Object.values(votes)
    .map((v) => parseFloat(v))
    .filter((n) => !isNaN(n))
    .toSorted((a, b) => a - b);

  if (values.length === 0) {
    return { average: '-', median: '-', agreement: '-' };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const mid = Math.floor(values.length / 2);
  const med = values.length % 2 === 0 ? (values[mid - 1]! + values[mid]!) / 2 : values[mid]!;

  // Agreement = % of voters who picked the most common value
  const allVotes = Object.values(votes);
  const counts = new Map<string, number>();
  for (const v of allVotes) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  const agr = allVotes.length > 0 ? Math.round((maxCount / allVotes.length) * 100) : 0;

  return {
    average: avg.toFixed(1),
    median: med.toFixed(1),
    agreement: `${agr}%`,
  };
}

export function formatElapsed(startMs: number, endMs: number): string {
  const secs = Math.floor((endMs - startMs) / 1000);
  const min = Math.floor(secs / 60);
  const sec = secs % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function compactRoundSummary(
  round: Round,
  roundNum: number,
  allRounds: readonly Round[] = [],
): string {
  const label = formatRoundLabel(round, roundNum, allRounds);

  if (terminalState(round) === 'skipped') {
    const title = round.title ? ` ${round.title}` : '';
    const ticket = round.ticketId ? ` [${round.ticketId}]` : '';
    return `${label}:${title}${ticket} — Skipped`;
  }

  // Build "card×count, ..." tally
  const counts = new Map<string, number>();
  for (const v of Object.values(round.votes)) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const tally = [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([card, count]) => `${card}×${count}`)
    .join(', ');

  const title = round.title ? ` ${round.title}` : '';
  const ticket = round.ticketId ? ` [${round.ticketId}]` : '';
  const elapsed =
    round.timerStartedAt !== undefined && round.revealedAt !== undefined
      ? ` — ${formatElapsed(round.timerStartedAt, round.revealedAt)}`
      : '';

  return `${label}:${title}${ticket} — ${tally || '(no votes)'}${elapsed}`;
}
