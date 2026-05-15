/**
 * Resolves the title value from the raw form input.
 * Trims whitespace; returns null when the result is empty (descriptor is optional).
 */
export function buildRoundStartTitle(rawValue: string): string | null {
  const raw = rawValue.trim();
  return raw === '' ? null : raw;
}

/**
 * Resolves the ticketId value from the raw form input.
 * Trims whitespace; returns null when the result is empty (ticketId is optional).
 * Empty/whitespace-only input must produce null so the caller can omit the field
 * entirely from the Yjs round record (per ADR-0013, ticketId is `string | undefined`).
 */
export function buildRoundStartTicketId(rawValue: string): string | null {
  const raw = rawValue.trim();
  return raw === '' ? null : raw;
}
