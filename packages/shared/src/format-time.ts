/**
 * Format a millisecond duration as `M:SS`.
 * Matches the semantics of the duplicated formatElapsed helpers in
 * vote-results.component.ts, estimating.page.ts, and round-history.component.ts.
 */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
