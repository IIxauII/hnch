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
