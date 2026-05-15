/**
 * Pure helpers backing the two-step round-start prompt flow in App.tsx
 * (issue #109). Extracted so the title/ticketId trimming logic and the
 * resulting `session.newRound(...)` argument shape are unit-testable
 * without spinning up the full Ink App component.
 */

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
 * Resolve the final `(title, ticketId)` pair for `session.newRound(...)`
 * from the two raw prompt inputs (title accumulated from step 1, ticketId
 * from step 2). Whitespace-only input collapses to `undefined`.
 */
export function buildNewRoundArgs(
  pendingTitle: string | undefined,
  rawTicketId: string,
): [string | undefined, string | undefined] {
  return [pendingTitle, normalizeRoundPromptValue(rawTicketId)];
}
