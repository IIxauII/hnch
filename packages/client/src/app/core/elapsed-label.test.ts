import { afterEach, describe, expect, it } from 'vitest';
import type { Round } from '@hnch/shared';
import { liveElapsedLabel, roundElapsedLabel } from './elapsed-label';

type Timed = Pick<Round, 'status' | 'terminalAt' | 'timerStartedAt'>;
const revealed: Timed = { status: 'revealed', timerStartedAt: 1_000, terminalAt: 75_000 };

describe('elapsed labels', () => {
  afterEach(() => {
    delete (window as { __captureElapsedMs?: unknown }).__captureElapsedMs;
  });

  it('reads the clock when nothing is pinned', () => {
    expect(liveElapsedLabel(1_000, 63_500)).toBe('1:02');
    expect(roundElapsedLabel(revealed)).toBe('1:14');
  });

  it('shows the pinned duration under screenshot capture', () => {
    (window as { __captureElapsedMs?: number }).__captureElapsedMs = 42_000;
    expect(liveElapsedLabel(1_000, 63_500)).toBe('0:42');
    expect(roundElapsedLabel(revealed)).toBe('0:42');
  });

  it('keeps a round with no knowable duration unlabelled, pinned or not', () => {
    const open: Timed = { status: 'voting', timerStartedAt: 1_000 };
    expect(roundElapsedLabel(open)).toBeNull();
    (window as { __captureElapsedMs?: number }).__captureElapsedMs = 42_000;
    expect(roundElapsedLabel(open)).toBeNull();
  });
});
