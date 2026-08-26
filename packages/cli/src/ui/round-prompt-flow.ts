/**
 * Pure helpers backing the two-step round-start prompt flow in App.tsx
 * (issue #109). Extracted so the title/ticketId trimming logic and the
 * resulting `session.commands.startRound(...)` argument shape are
 * unit-testable without spinning up the full Ink App component.
 *
 * Extended in issue #153 (agenda pre-fill): if a next pending agenda item is
 * provided, `buildNewRoundPreFill` returns pre-populated prompt values so the
 * user's prompts open with the item's data already filled in. On confirm,
 * `buildNewRoundArgs` also returns the `agendaItemId` so the caller can pass
 * it to `session.commands.startRound(...)` and the agenda item gets consumed.
 */

import type { AgendaItem } from '@hnch/shared';

/**
 * Trim and collapse blank input to `undefined` so the caller can omit
 * the field from the Yjs round record entirely (per ADR-0013, both
 * `title` and `ticketId` are `string | undefined`).
 */
export function normalizeRoundPromptValue(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Pre-fill values for the round-start two-step prompt from the next pending
 * agenda item. Returns empty strings when no item is pending (prompts open blank).
 */
export function buildRoundPreFill(nextPending: AgendaItem | null): {
  title: string;
  ticketId: string;
  agendaItemId: string | undefined;
} {
  if (!nextPending) {
    return { title: '', ticketId: '', agendaItemId: undefined };
  }
  return {
    title: nextPending.title ?? '',
    ticketId: nextPending.ticketId ?? '',
    agendaItemId: nextPending.id,
  };
}

/**
 * Resolve the final `(title, ticketId, agendaItemId)` triple for
 * `session.commands.startRound(...)` from the two raw prompt inputs.
 * Whitespace-only input collapses to `undefined`.
 */
export function buildNewRoundArgs(
  pendingTitle: string | undefined,
  rawTicketId: string,
  agendaItemId?: string,
): [string | undefined, string | undefined, string | undefined] {
  return [pendingTitle, normalizeRoundPromptValue(rawTicketId), agendaItemId];
}
