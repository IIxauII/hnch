/**
 * ConfettiEngine — framework-agnostic gravity-based emoji burst engine.
 *
 * Owns spawn scheduling, WAAPI trajectory animations, eviction, and teardown.
 * No Angular deps. Tested standalone via confetti-engine.test.ts.
 *
 * Default rng: `(window as any).__confettiRng ?? Math.random`
 * `(window as any).__confettiFreezeMs`, when set, draws the burst as it stands that many ms in,
 * held still, so a screenshot shows the same frame every time (#762).
 * Playwright sets both window hooks in screenshot specs; production never touches them.
 */

export type ConfettiPattern = 'center' | 'top-sprinkle' | 'side-cannons';

export interface ConfettiEngineOpts {
  viewportW: number;
  viewportH: number;
  emojis: readonly string[];
  /** Engine creates and owns child nodes under this element. */
  layer: HTMLElement;
  /** Default: `(window as any).__confettiRng ?? Math.random`. Injecting overrides both. */
  rng?: () => number;
  /** Default: 1800 px/s² */
  gravity?: number;
  /** Hard cap on simultaneous live animations. Default: 150. */
  maxParticles?: number;
}

interface InitialState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotationVel: number;
  size: number;
  emoji: string;
}

interface TrajectoryResult {
  keyframes: Keyframe[];
  lifetime: number;
}

/** Pure function — exported for unit testing. */
export function computeTrajectory(
  state: InitialState,
  gravity: number,
  viewport: { w: number; h: number },
): TrajectoryResult {
  const { x: x0, y: y0, vx, vy, rotationVel } = state;
  const g = gravity; // px/s²
  const floorY = viewport.h + 40;

  // Solve y0 + vy*t + 0.5*g*t² = floorY  →  0.5*g*t² + vy*t + (y0 - floorY) = 0
  // Quadratic: a=0.5*g, b=vy, c=y0-floorY
  const a = 0.5 * g;
  const b = vy;
  const c = y0 - floorY;
  const disc = b * b - 4 * a * c;
  let landingMs: number;

  if (disc >= 0 && a !== 0) {
    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-b + sqrtDisc) / (2 * a);
    const t2 = (-b - sqrtDisc) / (2 * a);
    // Largest positive root → the actual landing time
    const candidates = [t1, t2].filter((t) => t > 0);
    if (candidates.length > 0) {
      landingMs = Math.min(Math.max(...candidates) * 1000, 4000);
    } else {
      landingMs = 4000;
    }
  } else {
    landingMs = 4000;
  }

  const WAYPOINTS = 15;
  const keyframes: Keyframe[] = [];

  for (let i = 0; i < WAYPOINTS; i++) {
    const t = (i / (WAYPOINTS - 1)) * (landingMs / 1000); // seconds
    const x = x0 + vx * t;
    const y = y0 + vy * t + 0.5 * g * t * t;
    const rot = rotationVel * t;
    const tMs = t * 1000;
    // Fade in last 200ms
    const fadeStart = landingMs - 200;
    const opacity = tMs >= fadeStart ? 1 - (tMs - fadeStart) / 200 : 1;

    keyframes.push({
      transform: `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg)`,
      opacity: Math.max(0, opacity),
    });
  }

  return { keyframes, lifetime: landingMs };
}

function spawnOne(
  pattern: ConfettiPattern,
  viewport: { w: number; h: number },
  rng: () => number,
  emojis: readonly string[],
): InitialState {
  const emoji = emojis[Math.floor(rng() * emojis.length)]!;
  const rotationVel = (rng() - 0.5) * 1500;
  const size = 16 + Math.floor(rng() * 16); // 16–32px

  switch (pattern) {
    case 'center': {
      const angle = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 1.9;
      const r = rng();
      const speed = 400 + r * r * 900;
      return {
        x: viewport.w / 2,
        y: viewport.h * 0.45,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotationVel,
        size,
        emoji,
      };
    }
    case 'top-sprinkle': {
      return {
        x: rng() * viewport.w,
        y: -20,
        vx: (rng() - 0.5) * 140,
        vy: 80 + rng() * 220,
        rotationVel,
        size,
        emoji,
      };
    }
    case 'side-cannons': {
      const leftSide = rng() < 0.5;
      const r = rng();
      const speed = 350 + r * r * 700;
      if (leftSide) {
        const angle = -0.7 + rng() * 0.6; // ≈ -40° to -5° from +x axis
        return {
          x: -20,
          y: viewport.h * (0.33 + rng() * 0.67),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rotationVel,
          size,
          emoji,
        };
      } else {
        const angle = Math.PI + 0.7 - rng() * 0.6; // mirror
        return {
          x: viewport.w + 20,
          y: viewport.h * (0.33 + rng() * 0.67),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rotationVel,
          size,
          emoji,
        };
      }
    }
  }
}

const SPAWN_WINDOW_MS = 2500;
const PEAK_RATE = 110; // particles/s at t=0
const K = 1.0;

function spawnRate(t: number): number {
  if (t >= SPAWN_WINDOW_MS) return 0;
  const tNorm = t / SPAWN_WINDOW_MS;
  return PEAK_RATE * Math.pow(1 - tNorm, K);
}

export class ConfettiEngine {
  private readonly opts: Required<ConfettiEngineOpts>;
  private readonly rng: () => number;
  private readonly gravity: number;
  private readonly maxParticles: number;

  private animations: Animation[] = [];
  private spawnTimer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private pattern: ConfettiPattern = 'center';
  private layerRef: HTMLElement | null;

  constructor(opts: ConfettiEngineOpts) {
    const defaultRng: () => number =
      typeof window !== 'undefined'
        ? () => ((window as { __confettiRng?: () => number }).__confettiRng ?? Math.random)()
        : Math.random;

    this.rng = opts.rng ?? defaultRng;
    this.gravity = opts.gravity ?? 1800;
    this.maxParticles = opts.maxParticles ?? 150;
    this.layerRef = opts.layer;
    this.opts = {
      ...opts,
      rng: this.rng,
      gravity: this.gravity,
      maxParticles: this.maxParticles,
    };
  }

  start(pattern: ConfettiPattern): void {
    this.pattern = pattern;
    this.startedAt = performance.now();
    const freezeMs =
      typeof window !== 'undefined'
        ? (window as { __confettiFreezeMs?: number }).__confettiFreezeMs
        : undefined;
    if (freezeMs === undefined) this.scheduleNext(0);
    else this.drawFrozen(freezeMs);
  }

  /**
   * Spawns, at once, every particle the timer chain would have spawned by `freezeMs`, each held at
   * its age then. `playbackRate` 0 rather than `pause()`: Playwright's `animations: 'disabled'`
   * leaves a zero-rate animation alone but fast-forwards a paused one to its end.
   */
  private drawFrozen(freezeMs: number): void {
    const layer = this.layerRef;
    if (!layer) return;
    let t = 0;
    while (t <= freezeMs && t < SPAWN_WINDOW_MS && this.animations.length < this.maxParticles) {
      const anim = this.spawnParticle(layer, t);
      anim.currentTime = freezeMs - t;
      anim.playbackRate = 0;
      const r = spawnRate(t);
      if (r <= 0) return;
      t += Math.min(1000 / r, SPAWN_WINDOW_MS - t + 10);
    }
  }

  private scheduleNext(delay: number): void {
    this.spawnTimer = setTimeout(() => {
      this.spawnTimer = null;
      this.tick();
    }, delay);
  }

  private tick(): void {
    const layer = this.layerRef;
    if (!layer) return;

    const t = performance.now() - this.startedAt;
    if (t >= SPAWN_WINDOW_MS) return; // spawn window closed

    if (this.animations.length < this.maxParticles) {
      this.spawnParticle(layer, t);
    }

    const r = spawnRate(t);
    if (r <= 0) return;
    const rawDelay = 1000 / r;
    const nextDelay = Math.min(rawDelay, SPAWN_WINDOW_MS - t + 10);
    this.scheduleNext(nextDelay);
  }

  private spawnParticle(layer: HTMLElement, _t: number): Animation {
    const { viewportW: w, viewportH: h, emojis } = this.opts;
    const state = spawnOne(this.pattern, { w, h }, this.rng, emojis);
    const { keyframes, lifetime } = computeTrajectory(state, this.gravity, { w, h });

    const el = document.createElement('span');
    el.textContent = state.emoji;
    el.style.cssText = [
      'position: absolute',
      'top: 0',
      'left: 0',
      'line-height: 1',
      `font-size: ${state.size}px`,
      'will-change: transform, opacity',
      'pointer-events: none',
    ].join('; ');
    layer.appendChild(el);

    const anim = el.animate(keyframes, {
      duration: lifetime,
      easing: 'linear',
      fill: 'forwards',
    });

    this.animations.push(anim);

    anim.onfinish = () => {
      el.remove();
      const idx = this.animations.indexOf(anim);
      if (idx !== -1) this.animations.splice(idx, 1);
    };
    return anim;
  }

  stop(): void {
    // 1. Clear spawn timer — no more spawns
    if (this.spawnTimer !== null) {
      clearTimeout(this.spawnTimer);
      this.spawnTimer = null;
    }

    // 2. Remove all child nodes FIRST (before cancel to avoid snap-back flash)
    const layer = this.layerRef;
    if (layer) {
      while (layer.firstChild) {
        layer.removeChild(layer.firstChild);
      }
    }

    // 3. Cancel all tracked animations (nodes already detached — no repaint)
    for (const anim of this.animations) {
      anim.cancel();
    }
    this.animations = [];

    // 4. Null layer ref — subsequent stray calls no-op
    this.layerRef = null;
  }

  liveCount(): number {
    return this.animations.length;
  }
}
