/**
 * Tests for CelebrationService — the new owner of consensus overlay state
 * (moved from VoteResultsComponent per T1/T2 refactor).
 *
 * Covers AC-11, AC-12, AC-13 (consensus() guards), AC-14 (viewer path),
 * and the round-swap cancel behavior previously in vote-results.component.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { Round } from '@hnch/shared';
import { ABSTAIN_SENTINEL } from '@hnch/shared';
import { HapticService } from './haptic.service';
import { CelebrationService } from './celebration.service';

// ---------------------------------------------------------------------------
// Ionic stubs (needed transitively by some shared imports in test env)
// ---------------------------------------------------------------------------
vi.mock('@ionic/angular/standalone', async () => {
  const { Component: Comp, Input } = await import('@angular/core');
  const stub = (selector: string) =>
    Comp({ selector, template: '<ng-content/>', standalone: true })(class {});
  @Comp({ selector: 'ion-chip', template: '<ng-content/>', standalone: true })
  class IonChip {
    @Input() color: string | undefined;
  }
  return {
    IonChip,
    IonItemGroup: stub('ion-item-group'),
    IonLabel: stub('ion-label'),
  };
});
vi.mock('ionicons', () => ({ addIcons: vi.fn() }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCALE = { id: 'fibonacci', cards: ['1', '2', '3', '5', '8'] };

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: 'round-1',
    scale: SCALE,
    createdBy: 'host',
    createdAt: 1000,
    votes: {},
    revealedAt: 2000,
    timerStartedAt: 1000,
    ...overrides,
  };
}

const hapticStub = {
  notificationSuccess: vi.fn(),
  impactMedium: vi.fn(),
  impactLight: vi.fn(),
  impactHeavy: vi.fn(),
};

function mountService(): CelebrationService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [CelebrationService, { provide: HapticService, useValue: hapticStub }],
  });
  return TestBed.inject(CelebrationService);
}

// ---------------------------------------------------------------------------
// consensus() computed guards
// ---------------------------------------------------------------------------

describe('CelebrationService — consensus()', () => {
  it('false when round is null', () => {
    const svc = mountService();
    expect(svc.consensus()).toBe(false);
  });

  it('false when round is skipped (skippedAt < revealedAt — ADR-0040)', () => {
    const svc = mountService();
    svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 2000, skippedAt: 1000 }));
    TestBed.flushEffects();
    expect(svc.consensus()).toBe(false);
  });

  it('true when revealedAt < skippedAt — reveal wins (ADR-0040)', () => {
    const svc = mountService();
    svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 1000, skippedAt: 2000 }));
    TestBed.flushEffects();
    expect(svc.consensus()).toBe(true);
  });

  it('false when only skippedAt is set', () => {
    const svc = mountService();
    svc.setRound(
      makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: undefined, skippedAt: 1000 }),
    );
    TestBed.flushEffects();
    expect(svc.consensus()).toBe(false);
  });

  it('false when all votes are abstain (ADR-0041 §2)', () => {
    const svc = mountService();
    svc.setRound(
      makeRound({ votes: { p1: ABSTAIN_SENTINEL, p2: ABSTAIN_SENTINEL }, revealedAt: 2000 }),
    );
    TestBed.flushEffects();
    expect(svc.consensus()).toBe(false);
  });

  it('true on unanimous revealed round (AC-14: viewer path same result)', () => {
    const svc = mountService();
    svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 2000 }));
    TestBed.flushEffects();
    expect(svc.consensus()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Overlay + confetti DOM state (AC-11)
// ---------------------------------------------------------------------------

describe('CelebrationService — overlay state (AC-11)', () => {
  it('showOverlay starts false', () => {
    const svc = mountService();
    expect(svc.showOverlay()).toBe(false);
  });

  it('confettiPieces starts empty', () => {
    const svc = mountService();
    expect(svc.confettiPieces()).toHaveLength(0);
  });

  it('celebration fires after stagger delay on consensus round (AC-11)', () => {
    vi.useFakeTimers();
    try {
      hapticStub.notificationSuccess.mockClear();
      hapticStub.impactMedium.mockClear();

      const svc = mountService();
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 2000 }));
      TestBed.flushEffects();

      // Before delay: overlay not shown
      expect(svc.showOverlay()).toBe(false);

      // Advance past 1-group stagger delay (1 × 80 + 200 = 280ms)
      vi.advanceTimersByTime(300);

      expect(svc.showOverlay()).toBe(true);
      expect(hapticStub.notificationSuccess).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('confetti pieces spawn after overlay shows', () => {
    vi.useFakeTimers();
    try {
      const svc = mountService();
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 2000 }));
      TestBed.flushEffects();

      vi.advanceTimersByTime(300);
      expect(svc.confettiPieces().length).toBeGreaterThanOrEqual(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it('auto-dismiss after 3s clears overlay + confetti (AC-11)', () => {
    vi.useFakeTimers();
    try {
      const svc = mountService();
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 2000 }));
      TestBed.flushEffects();

      vi.advanceTimersByTime(300);
      expect(svc.showOverlay()).toBe(true);

      vi.advanceTimersByTime(3000);
      expect(svc.showOverlay()).toBe(false);
      expect(svc.confettiPieces()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('dismissOverlay() clears overlay + confetti immediately', () => {
    vi.useFakeTimers();
    try {
      const svc = mountService();
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 2000 }));
      TestBed.flushEffects();
      vi.advanceTimersByTime(300);
      expect(svc.showOverlay()).toBe(true);

      svc.dismissOverlay();
      expect(svc.showOverlay()).toBe(false);
      expect(svc.confettiPieces()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// AC-12: round swap before celebration timer fires cancels overlay
// ---------------------------------------------------------------------------

describe('CelebrationService — AC-12: round-swap cancel', () => {
  it('round swap before celebration timer fires cancels overlay + confetti + haptic bump', () => {
    vi.useFakeTimers();
    try {
      hapticStub.notificationSuccess.mockClear();
      hapticStub.impactMedium.mockClear();

      const svc = mountService();

      // Round A: unanimous consensus
      const roundA = makeRound({ id: 'round-a', votes: { p1: '5', p2: '5' }, revealedAt: 2000 });
      svc.setRound(roundA);
      TestBed.flushEffects();

      // Advance only partway
      vi.advanceTimersByTime(50);
      expect(svc.showOverlay()).toBe(false);

      // Swap to round B (non-consensus) before timer fires
      const roundB = makeRound({
        id: 'round-b',
        votes: { p1: '3', p2: '5' },
        revealedAt: 3000,
      });
      svc.setRound(roundB);
      TestBed.flushEffects();

      // Advance well past original delay (280ms)
      vi.advanceTimersByTime(400);

      // Overlay must never appear
      expect(svc.showOverlay()).toBe(false);
      expect(svc.confettiPieces()).toHaveLength(0);
      // Stale consensus haptic bump (impactMedium) must NOT have fired
      expect(hapticStub.impactMedium).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Confetti spawn lifecycle
// ---------------------------------------------------------------------------

describe('CelebrationService — confetti lifecycle', () => {
  it('initial batch + interval batches; stopConfetti clears all', () => {
    vi.useFakeTimers();
    try {
      const svc = mountService();
      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 2000 }));
      TestBed.flushEffects();

      vi.advanceTimersByTime(300);
      expect(svc.showOverlay()).toBe(true);
      expect(svc.confettiPieces().length).toBeGreaterThanOrEqual(10);

      // Advance 1s — second batch from setInterval
      vi.advanceTimersByTime(1000);
      const peak = svc.confettiPieces().length;
      expect(peak).toBeGreaterThan(10);

      // Dismiss → all cleared
      svc.dismissOverlay();
      expect(svc.showOverlay()).toBe(false);
      expect(svc.confettiPieces()).toHaveLength(0);

      // No resurrection after orphan timers
      vi.advanceTimersByTime(5000);
      expect(svc.confettiPieces()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// AC-15: Live transition false→true (no remount, effect re-arms)
// ---------------------------------------------------------------------------

describe('CelebrationService — AC-15: live false→true transition', () => {
  it('setRound to non-revealed, then to same id+revealed arms overlay without remount', () => {
    vi.useFakeTimers();
    try {
      const svc = mountService();

      // Step 1: set round to non-consensus state (votes differ → consensus() = false)
      const roundNonConsensus = {
        id: 'round-x',
        scale: SCALE,
        createdBy: 'host',
        createdAt: 1000,
        votes: { p1: '3', p2: '5' }, // Different votes → isConsensus() = false
        timerStartedAt: 1000,
      } as Round;
      svc.setRound(roundNonConsensus);
      TestBed.flushEffects();

      expect(svc.consensus()).toBe(false);
      expect(svc.showOverlay()).toBe(false);

      // Advance timers to verify no spurious overlay (none expected)
      vi.advanceTimersByTime(400);
      expect(svc.showOverlay()).toBe(false);

      // Step 2: update same round to consensus+revealed state (live mutation)
      const roundRevealed = makeRound({
        id: 'round-x',
        votes: { p1: '5', p2: '5' }, // Same votes now → isConsensus() = true
        revealedAt: 2000,
      });
      svc.setRound(roundRevealed);
      TestBed.flushEffects();

      expect(svc.consensus()).toBe(true);

      // Service not remounted; effect detects false→true transition and arms timer
      vi.advanceTimersByTime(300);

      // Overlay should appear after stagger delay
      expect(svc.showOverlay()).toBe(true);
      expect(svc.confettiPieces().length).toBeGreaterThanOrEqual(10);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// AC-17: Skip-race — true→false transition cancels overlay + clears timers
// ---------------------------------------------------------------------------

describe('CelebrationService — AC-17: skip-race cancel', () => {
  it('consensus true→false (skip-after-reveal) cancels pending timers + overlay', () => {
    vi.useFakeTimers();
    try {
      const svc = mountService();

      // Start with consensus round
      const roundConsensus = makeRound({
        id: 'round-y',
        votes: { p1: '5', p2: '5' },
        revealedAt: 2000,
      });
      svc.setRound(roundConsensus);
      TestBed.flushEffects();

      // Advance partway into stagger delay
      vi.advanceTimersByTime(100);
      expect(svc.showOverlay()).toBe(false);

      // Inject skip (simulate ADR-0040 skip-after-reveal CRDT merge)
      const roundSkipped = makeRound({
        id: 'round-y',
        votes: { p1: '5', p2: '5' },
        revealedAt: 2000,
        skippedAt: 1000, // Earlier timestamp → skip wins per ADR-0040
      });
      svc.setRound(roundSkipped);
      TestBed.flushEffects();

      // consensus() now false (skip winner); effect should fire on false transition
      expect(svc.consensus()).toBe(false);

      // Advance well past original delay window
      vi.advanceTimersByTime(400);

      // Overlay must never have appeared
      expect(svc.showOverlay()).toBe(false);
      expect(svc.confettiPieces()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// AC-18: Reduced-motion — no confetti
// ---------------------------------------------------------------------------

describe('CelebrationService — AC-18: reduced-motion', () => {
  it('prefers-reduced-motion: no confetti spawned, showOverlay true after stagger', () => {
    vi.useFakeTimers();
    try {
      // Stub matchMedia before service instantiation
      const matchMediaMock = vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      window.matchMedia = matchMediaMock as any;

      const svc = mountService();
      expect(svc.reducedMotion()).toBe(true);

      svc.setRound(makeRound({ votes: { p1: '5', p2: '5' }, revealedAt: 2000 }));
      TestBed.flushEffects();

      vi.advanceTimersByTime(300);

      // Overlay should appear
      expect(svc.showOverlay()).toBe(true);

      // But confetti must be empty (reduced-motion prevents startConfetti)
      expect(svc.confettiPieces()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
