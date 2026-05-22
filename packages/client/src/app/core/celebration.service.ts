import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { isAbstainVote, isConsensus, terminalState } from '@hnch/shared';
import type { Round } from '@hnch/shared';

import { HapticService } from './haptic.service';

interface ConfettiPiece {
  readonly id: number;
  readonly emoji: string;
  readonly angle: number;
  readonly distance: number;
  readonly rotate: number;
  readonly duration: number;
  readonly delay: number;
}

const CONFETTI_EMOJIS = ['🎉', '🎊', '🥳', '🪩', '✨', '🎈', '🌟'] as const;

/**
 * CelebrationService — owns the consensus-overlay lifecycle for LobbyPage.
 *
 * Provided at LobbyPage level (not root) so it is destroyed with the page.
 * LobbyPage wires the current round via `setRound()`.
 *
 * Bug fix: celebration effect arms on the **false→true transition** of
 * `consensus()` tracked via `previousConsensus`, so it fires on the live
 * reveal without requiring a page reload (root cause: old effect in
 * VoteResultsComponent captured `consensus` as closure constant before
 * `revealedAt` was set, then guarded on `hapticFiredForRound` so it never
 * re-fired on the actual transition).
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

  readonly confettiPieces = signal<readonly ConfettiPiece[]>([]);

  /**
   * True when consensus: all votes identical (≥2 voters), round revealed
   * (not skipped per ADR-0040), not all-abstain (ADR-0041 §2).
   */
  readonly consensus = computed(() => {
    const r = this._round();
    if (!r) return false;
    const values = Object.values(r.votes);
    if (values.length >= 2 && values.every(isAbstainVote)) return false;
    return isConsensus(r) && terminalState(r) !== 'skipped';
  });

  private overlayDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private revealCelebrationTimer: ReturnType<typeof setTimeout> | null = null;
  private revealHapticBumpTimer: ReturnType<typeof setTimeout> | null = null;
  private confettiInterval: ReturnType<typeof setInterval> | null = null;
  private confettiPieceCounter = 0;
  private readonly confettiEvictionTimers = new Map<number, ReturnType<typeof setTimeout>>();

  /** Tracks `consensus()` value from previous effect run for edge detection. */
  private previousConsensus = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearAllTimers();
      this.stopConfetti();
    });

    // Round-change reset: cancel in-flight celebration when round identity changes.
    effect(() => {
      const r = this._round();
      // Track round identity (id) + null. Side-effect: reset on any round change.
      void (r?.id ?? null);
      this.showOverlay.set(false);
      this.clearAllTimers();
      this.stopConfetti();
      this.previousConsensus = false;
    });

    // Celebration effect: arm on false→true transition of consensus().
    // Also handles true→false (skip-after-reveal per ADR-0040 AC-17).
    effect(() => {
      const nowConsensus = this.consensus();
      const prev = this.previousConsensus;

      if (nowConsensus && !prev) {
        // false → true: schedule celebration
        this.previousConsensus = true;
        const r = this._round();
        if (!r?.revealedAt) return;

        // Compute stagger delay from vote groups count (same formula as VoteResults stagger).
        const votes = Object.entries(r.votes);
        const nonAbstainCards = new Set(
          votes.filter(([, v]) => !isAbstainVote(v)).map(([, v]) => v),
        );
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
            this.showOverlay.set(false);
            this.overlayDismissTimer = null;
            this.stopConfetti();
          }, 3000);
        }, delay);
      } else if (!nowConsensus && prev) {
        // true → false: cancel pending celebration (AC-17: skip-after-reveal)
        this.previousConsensus = false;
        this.clearAllTimers();
        this.stopConfetti();
        this.showOverlay.set(false);
      }
    });
  }

  /** LobbyPage wires the current revealed round here. Pass null to clear. */
  setRound(round: Round | null): void {
    this._round.set(round);
  }

  dismissOverlay(): void {
    this.showOverlay.set(false);
    if (this.overlayDismissTimer !== null) {
      clearTimeout(this.overlayDismissTimer);
      this.overlayDismissTimer = null;
    }
    this.stopConfetti();
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
    this.confettiPieces.set([]);
    this.confettiPieceCounter = 0;

    const spawnBatch = (count: number): ConfettiPiece[] => {
      const pieces: ConfettiPiece[] = [];
      for (let i = 0; i < count; i++) {
        pieces.push(this.makeConfettiPiece());
      }
      return pieces;
    };

    const schedulePieceEviction = (piece: ConfettiPiece): void => {
      const t = setTimeout(
        () => {
          this.confettiEvictionTimers.delete(piece.id);
          this.confettiPieces.update((prev) => prev.filter((p) => p.id !== piece.id));
        },
        piece.duration + piece.delay + 50,
      );
      this.confettiEvictionTimers.set(piece.id, t);
    };

    const addPieces = (pieces: ConfettiPiece[]): void => {
      this.confettiPieces.update((prev) => [...prev, ...pieces]);
      for (const piece of pieces) {
        schedulePieceEviction(piece);
      }
    };

    addPieces(spawnBatch(10));

    this.confettiInterval = setInterval(() => {
      addPieces(spawnBatch(10));
    }, 1000);
  }

  stopConfetti(): void {
    if (this.confettiInterval !== null) {
      clearInterval(this.confettiInterval);
      this.confettiInterval = null;
    }
    for (const t of this.confettiEvictionTimers.values()) {
      clearTimeout(t);
    }
    this.confettiEvictionTimers.clear();
    this.confettiPieces.set([]);
  }

  private makeConfettiPiece(): ConfettiPiece {
    const emoji = CONFETTI_EMOJIS[Math.floor(Math.random() * CONFETTI_EMOJIS.length)]!;
    return {
      id: ++this.confettiPieceCounter,
      emoji,
      angle: Math.random() * 360,
      distance: 60 + Math.random() * 120,
      rotate: Math.random() * 360,
      duration: 700 + Math.random() * 600,
      delay: Math.random() * 200,
    };
  }
}
