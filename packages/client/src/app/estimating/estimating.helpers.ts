/**
 * Pure helpers used by EstimatingPage — extracted so they can be unit-tested
 * directly without spinning up the page's component graph.
 */

/**
 * Parse a raw `ticketId` field into an http(s) URL string suitable for an
 * `<a href>`, or `null` when the value is absent or not a URL. Trims
 * whitespace, requires `http:` or `https:` protocol.
 */
export function parseTicketIdHref(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.host === '') return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Toolbar title: the round's number in the session. `"Estimating"` for the
 * moment between arriving on the page and the round showing up.
 */
export function buildEstimatingTitle(roundIndex: number | null): string {
  return roundIndex === null ? 'Estimating' : `Round ${roundIndex}`;
}

/**
 * What a cancelled round says on its way out. The host did it; everyone else
 * had it done to them.
 */
export function buildCancelledRoundToast(byMe: boolean): string {
  return byMe ? 'Round cancelled' : 'The host cancelled the round';
}
