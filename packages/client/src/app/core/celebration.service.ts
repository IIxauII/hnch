import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { isAbstainVote, isConsensus } from '@hnch/shared';
import type { Round } from '@hnch/shared';

import { HapticService } from './haptic.service';
import { ConfettiEngine } from './confetti-engine';
import type { ConfettiPattern } from './confetti-engine';

const CONFETTI_EMOJIS = ['🎉', '🎊', '🥳', '🪩', '✨', '🎈', '🌟'] as const;

/**
 * CelebrationService — owns the consensus-overlay lifecycle for LobbyPage.
 *
 * Provided at LobbyPage level (not root) so it is destroyed with the page.
 * LobbyPage wires the current round via `setRound()`.
 * LobbyPage wires the confetti-layer DOM node via `attachLayer()` /
 * `detachLayer()` — the engine is created lazily when both a pattern
 * and a layer are present.
 *
 * Bug fix: celebration effect arms on the **false→true transition** of
 * `consensus()` tracked via `previousConsensus`, so it fires on the live
 * reveal without requiring a page reload.
 */
@Injectable()
export class CelebrationService {
  private readonly haptic = inject(HapticService);
  private readonly destroyRef = inject(DestroyRef);

  /** Current round — set by LobbyPage via setRound(). */
  private readonly _round = signal<Round | null>(null);

  /** Checked once at service construction; mid-flight OS toggle out of scope. */
  readonly reducedMotion = signal(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  /** Controls overlay visibility — resets per round. */
  readonly showOverlay = signal(false);

  /**
   * True when consensus: all votes identical (≥2 voters), round revealed
   * (not skipped per ADR-0040), not all-abstain (ADR-0041 §2).
   */
  readonly consensus = computed(() => {
    const r = this._round();
    if (!r) return false;
    const values = Object.values(r.votes);
    if (values.length >= 2 && values.every(isAbstainVote)) return false;
    return isConsensus(r) && r.status !== 'skipped';
  });

  private overlayDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private revealCelebrationTimer: ReturnType<typeof setTimeout> | null = null;
  private revealHapticBumpTimer: ReturnType<typeof setTimeout> | null = null;

  /** Tracks `consensus()` value from previous effect run for edge detection. */
  private previousConsensus = false;

  /**
   * Tracks last `_round()` id seen by the reset effect. Guards against the
   * projection-tick reference-thrash race (#310): doc.service rewrites
   * `projection` on every observeDeep callback, so `rounds()` re-emits
   * new-reference-same-id rounds on awareness/heartbeat ticks. Without this
   * guard, the reset effect wipes any in-flight celebration on every tick.
   */
  private lastRoundId: string | null = null;

  /** WAAPI engine — non-null only while a celebration is in flight. */
  private engine: ConfettiEngine | null = null;

  /** DOM element owned by LobbyPage — attached/detached via attachLayer(). */
  private layerEl: HTMLElement | null = null;

  /** Queued pattern when startConfetti() fires before attachLayer(). */
  private pendingPattern: ConfettiPattern | null = null;

  /** Injected rng for pattern selection (narrow seam — mirrors engine seam). */
  private readonly rng: () => number =
    typeof window !== 'undefined'
      ? () => ((window as { __confettiRng?: () => number }).__confettiRng ?? Math.random)()
      : Math.random;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearAllTimers();
      this.stopConfetti();
    });

    // Round-change reset: cancel in-flight celebration when round identity changes.
    // Identity guard (#310): early-return when the new round's id matches the
    // last seen id. Projection ticks (awareness, heartbeats) re-emit the same
    // round id with a fresh object reference; without this guard, the reset
    // body fires on every tick and wipes any in-flight celebration.
    effect(() => {
      const r = this._round();
      const nextId = r?.id ?? null;
      if (nextId !== null && nextId === this.lastRoundId) return;
      this.lastRoundId = nextId;
      this.stopConfetti();
      this.showOverlay.set(false);
      this.clearAllTimers();
      this.previousConsensus = false;
    });

    // Celebration effect: arm on false→true transition of consensus().
    // Also handles true→false (skip-after-reveal, ADR-0040).
    // Track round id explicitly so the effect re-runs across rounds when
    // consensus() stays true (round N unanimous → round N+1 unanimous);
    // otherwise Angular skips the re-run on equal signal values and the
    // celebration never schedules for round N+1.
    effect(() => {
      void (this._round()?.id ?? null);
      const nowConsensus = this.consensus();
      const prev = this.previousConsensus;

      if (nowConsensus && !prev) {
        this.previousConsensus = true;
        this.scheduleCelebration();
      } else if (!nowConsensus && prev) {
        // true → false: cancel pending celebration (skip-after-reveal)
        this.previousConsensus = false;
        this.clearAllTimers();
        this.stopConfetti();
        this.showOverlay.set(false);
      }
    });
  }

  private scheduleCelebration(): void {
    const r = this._round();
    if (r?.status !== 'revealed') return;

    // Compute stagger delay from vote groups count (same formula as VoteResults stagger).
    const votes = Object.entries(r.votes);
    const nonAbstainCards = new Set(votes.filter(([, v]) => !isAbstainVote(v)).map(([, v]) => v));
    const hasAbstained = votes.some(([, v]) => isAbstainVote(v));
    const totalGroups = nonAbstainCards.size + (hasAbstained ? 1 : 0);
    const delay = Math.max(0, totalGroups - 1) * 80 + 200;

    this.revealCelebrationTimer = setTimeout(() => {
      this.revealCelebrationTimer = null;
      this.haptic.notificationSuccess();
      this.showOverlay.set(true);
      this.startConfetti();
      this.revealHapticBumpTimer = setTimeout(() => {
        this.revealHapticBumpTimer = null;
        this.haptic.impactMedium();
      }, 120);
      this.overlayDismissTimer = setTimeout(() => {
        this.engine?.stop();
        this.engine = null;
        this.pendingPattern = null;
        this.showOverlay.set(false);
        this.overlayDismissTimer = null;
      }, 3000);
    }, delay);
  }

  /** LobbyPage wires the current revealed round here. Pass null to clear. */
  setRound(round: Round | null): void {
    this._round.set(round);
  }

  /**
   * Called by LobbyPage afterRenderEffect when confettiLayer viewChild changes.
   * - el non-null: store layer; if pendingPattern set, instantiate engine + start.
   * - el null: teardown engine, clear layer ref.
   */
  attachLayer(el: HTMLElement | null): void {
    if (el !== null) {
      this.layerEl = el;
      if (this.pendingPattern !== null) {
        const pattern = this.pendingPattern;
        this.pendingPattern = null;
        this.engine = new ConfettiEngine({
          viewportW: el.offsetWidth || window.innerWidth,
          viewportH: el.offsetHeight || window.innerHeight,
          emojis: CONFETTI_EMOJIS,
          layer: el,
        });
        this.engine.start(pattern);
      }
    } else {
      this.engine?.stop();
      this.engine = null;
      this.layerEl = null;
    }
  }

  /** Alias for attachLayer(null). Also called from LobbyPage ngOnDestroy. */
  detachLayer(): void {
    this.attachLayer(null);
  }

  dismissOverlay(): void {
    this.engine?.stop();
    this.engine = null;
    this.pendingPattern = null;
    this.showOverlay.set(false);
    if (this.overlayDismissTimer !== null) {
      clearTimeout(this.overlayDismissTimer);
      this.overlayDismissTimer = null;
    }
  }

  private clearAllTimers(): void {
    if (this.overlayDismissTimer !== null) {
      clearTimeout(this.overlayDismissTimer);
      this.overlayDismissTimer = null;
    }
    if (this.revealCelebrationTimer !== null) {
      clearTimeout(this.revealCelebrationTimer);
      this.revealCelebrationTimer = null;
    }
    if (this.revealHapticBumpTimer !== null) {
      clearTimeout(this.revealHapticBumpTimer);
      this.revealHapticBumpTimer = null;
    }
  }

  private startConfetti(): void {
    if (this.reducedMotion()) return;

    const patternIndex = Math.floor(this.rng() * 3);
    const patterns: ConfettiPattern[] = ['center', 'top-sprinkle', 'side-cannons'];
    const pattern = patterns[patternIndex]!;

    if (this.layerEl !== null) {
      const el = this.layerEl;
      this.engine = new ConfettiEngine({
        viewportW: el.offsetWidth || window.innerWidth,
        viewportH: el.offsetHeight || window.innerHeight,
        emojis: CONFETTI_EMOJIS,
        layer: el,
      });
      this.engine.start(pattern);
    } else {
      this.pendingPattern = pattern;
    }
  }

  stopConfetti(): void {
    this.engine?.stop();
    this.engine = null;
    this.pendingPattern = null;
  }
}
