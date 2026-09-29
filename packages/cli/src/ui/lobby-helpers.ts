/**
 * Pure helpers used by Lobby.tsx — extracted so they can be unit-tested
 * directly without rendering the Ink tree.
 */

import {
  formatRoundElapsed,
  formatRoundPosition,
  isAbstainVote,
  roundsToMarkdown,
} from '@hnch/shared';
import type { DocProjection, Round } from '@hnch/shared';

/**
 * Build the Markdown export payload for the current session. Mirrors mobile
 * (ExportService.copyRoundsAsMarkdown in lobby.page.ts): passes the raw
 * participants list — including those who have left — so departed names still
 * resolve in historical rounds per ADR-0036.
 */
export function buildExportMarkdown(projection: DocProjection): string {
  const participants = Object.fromEntries(projection.participants.map((p) => [p.id, p]));
  // Every round, not just the finished ones: the export numbers a round by
  // its place in the list it is given, and picks out the revealed itself.
  return roundsToMarkdown({ rounds: projection.rounds, participants });
}

/**
 * Copy the current session's Markdown export to the clipboard, dispatching a
 * success/failure notice via the provided callback. Extracted from App.tsx so
 * the success and failure paths can be unit-tested without rendering Ink.
 */
export async function exportResultsToClipboard(
  projection: DocProjection,
  clipboardWrite: (text: string) => Promise<void>,
  showNotice: (message: string) => void,
): Promise<void> {
  const md = buildExportMarkdown(projection);
  try {
    await clipboardWrite(md);
    showNotice('Results copied to clipboard');
  } catch {
    showNotice('Clipboard write failed');
  }
}

/**
 * Compose the bold header text shown above ResultsSection in the Lobby —
 * `<position><title?><ticket?> — Results` or `… — Skipped`. CLI-local: it
 * encodes a terminal header register and has no second consumer. The chain
 * position itself comes from shared (`formatRoundPosition`).
 */
export function buildResultsHeader(round: Round, allRounds: readonly Round[]): string {
  const position = formatRoundPosition(round, allRounds);
  const title = round.title ? ` — ${round.title}` : '';
  const ticket = round.ticketId ? ` [${round.ticketId}]` : '';
  const suffix = round.status === 'skipped' ? ' — Skipped' : ' — Results';
  return `${position}${title}${ticket}${suffix}`;
}

/**
 * One-line history row for the Lobby — CLI-local by design: it encodes a
 * terminal row register (`card×count` tally, inline abstain count) with no
 * second consumer. Chain position and elapsed come from shared.
 */
export function compactRoundSummary(round: Round, allRounds: readonly Round[]): string {
  const label = formatRoundPosition(round, allRounds);

  if (round.status === 'skipped') {
    const title = round.title ? ` ${round.title}` : '';
    const ticket = round.ticketId ? ` [${round.ticketId}]` : '';
    return `${label}:${title}${ticket} — Skipped`;
  }

  // Build "card×count, ..." tally — abstain entries excluded
  const counts = new Map<string, number>();
  for (const v of Object.values(round.votes)) {
    if (isAbstainVote(v)) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const tally = [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([card, count]) => `${card}×${count}`)
    .join(', ');

  const abstainCount = Object.values(round.votes).filter(isAbstainVote).length;
  const abstainSuffix = abstainCount > 0 ? ` (${abstainCount} abstained)` : '';

  const title = round.title ? ` ${round.title}` : '';
  const ticket = round.ticketId ? ` [${round.ticketId}]` : '';
  const elapsedLabel = formatRoundElapsed(round);
  const elapsed = elapsedLabel !== null ? ` — ${elapsedLabel}` : '';

  return `${label}:${title}${ticket} — ${tally || '(no votes)'}${abstainSuffix}${elapsed}`;
}
