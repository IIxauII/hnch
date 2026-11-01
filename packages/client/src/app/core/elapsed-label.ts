import { formatElapsed, formatRoundElapsed, type Round } from '@hnch/shared';

/**
 * Elapsed-time labels: the Estimating stopwatch, and a finished round's
 * duration in results and history.
 *
 * `(window as any).__captureElapsedMs`, when set, replaces the clock's
 * duration in every label, so a screenshot shows the same time every time
 * (#762). Playwright sets it in screenshot specs; production never touches it.
 */
function pinnedElapsedMs(): number | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window as { __captureElapsedMs?: number }).__captureElapsedMs;
}

/** The live stopwatch of a round that started at `startedAt`, read at `now`. */
export function liveElapsedLabel(startedAt: number, now: number): string {
  return formatElapsed(pinnedElapsedMs() ?? now - startedAt);
}

/** A finished round's duration, or null when it has none (see `formatRoundElapsed`). */
export function roundElapsedLabel(
  round: Pick<Round, 'status' | 'terminalAt' | 'timerStartedAt'>,
): string | null {
  const label = formatRoundElapsed(round);
  const pinned = pinnedElapsedMs();
  return label === null || pinned === undefined ? label : formatElapsed(pinned);
}
