/**
 * True if `s` parses as an absolute http/https URL.
 * Used by client renderers to decide between linkified and plain ticketId display.
 */
export function isLikelyUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
