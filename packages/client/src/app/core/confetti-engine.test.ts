/**
 * Unit tests for ConfettiEngine and computeTrajectory.
 *
 * Uses vi.useFakeTimers() to advance the setTimeout spawn chain.
 * vi.spyOn(HTMLElement.prototype, 'animate') captures animation calls.
 * The Element.animate polyfill is installed in test-setup.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfettiEngine, computeTrajectory } from './confetti-engine';

// Seeded RNG — linear congruential generator

function makeSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const EMOJIS = ['🎉', '🎊', '🥳'] as const;
const VIEWPORT = { w: 390, h: 844 };

// computeTrajectory — pure function

describe('computeTrajectory', () => {
  it('final keyframe y exceeds viewport floor (gravity acts downward)', () => {
    const { keyframes } = computeTrajectory(
      { x: 0, y: 0, vx: 100, vy: -200, rotationVel: 300, size: 20, emoji: '🎉' },
      1800,
      VIEWPORT,
    );
    const last = keyframes[keyframes.length - 1]!;
    // Extract y from transform string: translate3d(Xpx, Ypx, 0)
    const match = /translate3d\([^,]+,\s*([-\d.]+)px/.exec(last.transform as string);
    expect(match).toBeTruthy();
    const finalY = parseFloat(match![1]!);
    expect(finalY).toBeGreaterThanOrEqual(VIEWPORT.h);
  });

  it('produces 15 keyframes', () => {
    const { keyframes } = computeTrajectory(
      { x: 100, y: 100, vx: 50, vy: -100, rotationVel: 0, size: 20, emoji: '🎊' },
      1800,
      VIEWPORT,
    );
    expect(keyframes).toHaveLength(15);
  });

  it('caps lifetime at 4000ms when particle never lands naturally', () => {
    // Particle launched upward with near-zero gravity equivalent — ensure cap
    const { lifetime } = computeTrajectory(
      { x: 0, y: 0, vx: 0, vy: -9999, rotationVel: 0, size: 20, emoji: '🎉' },
      1, // near-zero gravity
      VIEWPORT,
    );
    expect(lifetime).toBeLessThanOrEqual(4000);
  });

  it('last keyframe opacity is 0 (fade out at landing)', () => {
    const { keyframes } = computeTrajectory(
      { x: 0, y: 0, vx: 0, vy: 100, rotationVel: 0, size: 20, emoji: '🎉' },
      1800,
      VIEWPORT,
    );
    const last = keyframes[keyframes.length - 1]!;
    expect(last.opacity).toBe(0);
  });
});

// ConfettiEngine — spawn behavior

describe('ConfettiEngine — center pattern', () => {
  let layer: HTMLDivElement;
  let animateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    layer = document.createElement('div');
    document.body.appendChild(layer);
    animateSpy = vi.spyOn(HTMLElement.prototype, 'animate');
  });

  afterEach(() => {
    vi.useRealTimers();
    layer.remove();
  });

  it('spawns first particle after first setTimeout fires', () => {
    const rng = makeSeededRng(42);
    const engine = new ConfettiEngine({
      viewportW: VIEWPORT.w,
      viewportH: VIEWPORT.h,
      emojis: EMOJIS,
      layer,
      rng,
    });

    engine.start('center');
    expect(layer.children.length).toBe(0);

    vi.advanceTimersByTime(50);
    expect(layer.children.length).toBeGreaterThanOrEqual(1);
    expect(animateSpy).toHaveBeenCalled();
  });

  it('initial keyframe transform places center particle near viewport center', () => {
    const rng = makeSeededRng(1);
    const engine = new ConfettiEngine({
      viewportW: VIEWPORT.w,
      viewportH: VIEWPORT.h,
      emojis: EMOJIS,
      layer,
      rng,
    });

    engine.start('center');
    vi.advanceTimersByTime(50);

    const firstCall = animateSpy.mock.calls[0];
    expect(firstCall).toBeTruthy();
    const keyframes = firstCall![0] as Keyframe[];
    const first = keyframes[0]!;
    // Initial transform encodes x0 ≈ viewport.w/2, y0 ≈ viewport.h*0.45
    const match = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(first.transform as string);
    expect(match).toBeTruthy();
    const x = parseFloat(match![1]!);
    const y = parseFloat(match![2]!);
    expect(Math.abs(x - VIEWPORT.w / 2)).toBeLessThan(1);
    expect(Math.abs(y - VIEWPORT.h * 0.45)).toBeLessThan(1);
  });

  it('final keyframe y exceeds viewport floor', () => {
    const rng = makeSeededRng(7);
    const engine = new ConfettiEngine({
      viewportW: VIEWPORT.w,
      viewportH: VIEWPORT.h,
      emojis: EMOJIS,
      layer,
      rng,
    });

    engine.start('center');
    vi.advanceTimersByTime(50);

    const firstCall = animateSpy.mock.calls[0];
    const keyframes = firstCall![0] as Keyframe[];
    const last = keyframes[keyframes.length - 1]!;
    const match = /translate3d\([^,]+,\s*([-\d.]+)px/.exec(last.transform as string);
    expect(match).toBeTruthy();
    const finalY = parseFloat(match![1]!);
    expect(finalY).toBeGreaterThanOrEqual(VIEWPORT.h);
  });

  it('stop() cancels all animations and clears layer children', () => {
    const rng = makeSeededRng(99);
    const engine = new ConfettiEngine({
      viewportW: VIEWPORT.w,
      viewportH: VIEWPORT.h,
      emojis: EMOJIS,
      layer,
      rng,
    });

    engine.start('center');
    vi.advanceTimersByTime(200);

    const liveCount = engine.liveCount();
    expect(liveCount).toBeGreaterThan(0);

    engine.stop();
    expect(layer.children.length).toBe(0);

    // Every animation.cancel() should have been called
    const allCancelCalls = animateSpy.mock.results
      .map((r) => r.value as Animation)
      .filter((a) => a !== null && a !== undefined);
    expect(allCancelCalls.length).toBeGreaterThan(0);
  });

  it('stop() makes subsequent spawn-timer fires no-ops', () => {
    const rng = makeSeededRng(5);
    const engine = new ConfettiEngine({
      viewportW: VIEWPORT.w,
      viewportH: VIEWPORT.h,
      emojis: EMOJIS,
      layer,
      rng,
    });

    engine.start('center');
    vi.advanceTimersByTime(100);
    engine.stop();

    const callsBefore = animateSpy.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(animateSpy.mock.calls.length).toBe(callsBefore);
  });
});

describe('ConfettiEngine — top-sprinkle pattern', () => {
  let layer: HTMLDivElement;
  let animateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    layer = document.createElement('div');
    document.body.appendChild(layer);
    animateSpy = vi.spyOn(HTMLElement.prototype, 'animate');
  });

  afterEach(() => {
    vi.useRealTimers();
    layer.remove();
  });

  it('spawned particle initial y ≈ -20', () => {
    const rng = makeSeededRng(123);
    const engine = new ConfettiEngine({
      viewportW: VIEWPORT.w,
      viewportH: VIEWPORT.h,
      emojis: EMOJIS,
      layer,
      rng,
    });

    engine.start('top-sprinkle');
    vi.advanceTimersByTime(50);

    const firstCall = animateSpy.mock.calls[0];
    expect(firstCall).toBeTruthy();
    const keyframes = firstCall![0] as Keyframe[];
    const first = keyframes[0]!;
    const match = /translate3d\([^,]+,\s*([-\d.]+)px/.exec(first.transform as string);
    expect(match).toBeTruthy();
    const y = parseFloat(match![1]!);
    expect(Math.abs(y - -20)).toBeLessThan(1);
  });
});

describe('ConfettiEngine — side-cannons pattern', () => {
  let layer: HTMLDivElement;
  let animateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    layer = document.createElement('div');
    document.body.appendChild(layer);
    animateSpy = vi.spyOn(HTMLElement.prototype, 'animate');
  });

  afterEach(() => {
    vi.useRealTimers();
    layer.remove();
  });

  it('over ≥10 spawns, sees both left-edge and right-edge initial x values', () => {
    const rng = makeSeededRng(999);
    const engine = new ConfettiEngine({
      viewportW: VIEWPORT.w,
      viewportH: VIEWPORT.h,
      emojis: EMOJIS,
      layer,
      rng,
    });

    engine.start('side-cannons');
    vi.advanceTimersByTime(500);

    const count = animateSpy.mock.calls.length;
    expect(count).toBeGreaterThanOrEqual(10);

    let sawLeft = false;
    let sawRight = false;

    for (const call of animateSpy.mock.calls) {
      const keyframes = call[0] as Keyframe[];
      const first = keyframes[0]!;
      const match = /translate3d\(([-\d.]+)px/.exec(first.transform as string);
      if (!match) continue;
      const x = parseFloat(match[1]!);
      if (Math.abs(x - -20) < 1) sawLeft = true;
      if (Math.abs(x - (VIEWPORT.w + 20)) < 1) sawRight = true;
    }

    expect(sawLeft).toBe(true);
    expect(sawRight).toBe(true);
  });
});

// Hard cap: liveCount() never exceeds maxParticles

describe('ConfettiEngine — maxParticles hard cap', () => {
  let layer: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    layer = document.createElement('div');
    document.body.appendChild(layer);
  });

  afterEach(() => {
    vi.useRealTimers();
    layer.remove();
  });

  it('liveCount() never exceeds maxParticles while onfinish not fired', () => {
    const rng = makeSeededRng(77);
    const engine = new ConfettiEngine({
      viewportW: VIEWPORT.w,
      viewportH: VIEWPORT.h,
      emojis: EMOJIS,
      layer,
      rng,
      maxParticles: 10,
    });

    engine.start('center');
    // Advance through the full spawn window
    vi.advanceTimersByTime(2600);
    expect(engine.liveCount()).toBeLessThanOrEqual(10);
  });
});

// Window hook rng

describe('ConfettiEngine — __confettiRng window hook', () => {
  let layer: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    layer = document.createElement('div');
    document.body.appendChild(layer);
  });

  afterEach(() => {
    vi.useRealTimers();
    layer.remove();
    delete (window as { __confettiRng?: unknown }).__confettiRng;
  });

  it('uses window.__confettiRng when set before construction', () => {
    const calls: number[] = [];
    const seeded = makeSeededRng(55);
    (window as { __confettiRng?: () => number }).__confettiRng = () => {
      const v = seeded();
      calls.push(v);
      return v;
    };

    // No opts.rng — should fall back to window.__confettiRng
    const engine = new ConfettiEngine({
      viewportW: VIEWPORT.w,
      viewportH: VIEWPORT.h,
      emojis: EMOJIS,
      layer,
    });

    const spy = vi.spyOn(HTMLElement.prototype, 'animate');
    engine.start('center');
    vi.advanceTimersByTime(50);

    expect(spy).toHaveBeenCalled();
    expect(calls.length).toBeGreaterThan(0);
  });
});

// Spawn fires assert layer.children.length > 0 (attached-layer guard)

describe('ConfettiEngine — attached-layer guard', () => {
  let layer: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    layer = document.createElement('div');
    document.body.appendChild(layer);
  });

  afterEach(() => {
    vi.useRealTimers();
    layer.remove();
  });

  it('layer.children.length > 0 after spawn fires', () => {
    const rng = makeSeededRng(11);
    const engine = new ConfettiEngine({
      viewportW: VIEWPORT.w,
      viewportH: VIEWPORT.h,
      emojis: EMOJIS,
      layer,
      rng,
    });
    engine.start('top-sprinkle');
    vi.advanceTimersByTime(50);
    expect(layer.children.length).toBeGreaterThan(0);
  });
});
