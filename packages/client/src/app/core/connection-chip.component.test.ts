/**
 * Unit tests for ConnectionChipComponent (plan §3.9).
 *
 * Uses two strategies (following patterns established in other client tests):
 *
 * 1. Source-file structural checks — fast assertions on the template's
 *    accessibility and colour attributes without requiring a full renderer.
 *
 * 2. Logic harness — a lightweight class that replicates the component's
 *    signal + effect + debounce logic in isolation, using vi fake timers
 *    for deterministic control of the 5-second debounce. Avoids zone.js
 *    entanglement that makes fakeAsync / vi.useFakeTimers interact poorly
 *    with TestBed in this Vitest + jsdom setup.
 *
 * The harness approach is the same pattern used by host-election.service.test.ts,
 * which also had to step outside TestBed to test timer-driven logic.
 */

import { computed, signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Ionic/Capacitor imports that the component pulls in transitively
vi.mock('@ionic/angular/standalone', () => ({ IonChip: {}, IonIcon: {}, IonLabel: {} }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('ionicons', () => ({ addIcons: () => {} }));
vi.mock('ionicons/icons', () => ({ cloudOfflineOutline: '', syncOutline: '' }));

import { DISCONNECTED_WARNING_DELAY_MS } from './connection-chip.component';

// ---------------------------------------------------------------------------
// Part 1 — Source-file structural checks
// ---------------------------------------------------------------------------

describe('ConnectionChipComponent structure', () => {
  const src = readFileSync('./src/app/core/connection-chip.component.ts', 'utf-8');

  it('exports DISCONNECTED_WARNING_DELAY_MS = 5000', () => {
    expect(DISCONNECTED_WARNING_DELAY_MS).toBe(5_000);
  });

  it('uses ChangeDetectionStrategy.OnPush', () => {
    expect(src).toContain('ChangeDetectionStrategy.OnPush');
  });

  it('chip has aria-live="polite" for screen-reader announcements', () => {
    expect(src).toContain('aria-live="polite"');
  });

  it('disconnected state uses warning color', () => {
    expect(src).toContain("color: 'warning'");
  });

  it('connecting state uses medium color', () => {
    expect(src).toContain("color: 'medium'");
  });

  it('clears the debounce timer in DestroyRef.onDestroy', () => {
    expect(src).toContain('onDestroy');
    expect(src).toContain('clearTimeout');
  });
});

// ---------------------------------------------------------------------------
// Part 2 — Logic harness (mirrors the component's display + debounce logic)
// ---------------------------------------------------------------------------

type SyncStatus = 'connected' | 'offline' | 'connecting' | 'disconnected';
type ChipState = { label: string; color: string; icon: string } | null;

/**
 * Minimal harness that replicates ConnectionChipComponent's display computed
 * signal and its debounce effect. Tests the decision logic and timer
 * management without requiring Angular's rendering pipeline.
 */
class ChipHarness {
  private readonly _syncStatus = signal<SyncStatus>('connected');
  private readonly _disconnectedLongEnough = signal(false);

  readonly display = computed<ChipState>(() => {
    const status = this._syncStatus();
    switch (status) {
      case 'connected':
      case 'offline':
        return null;
      case 'connecting':
        return { label: 'Connecting…', color: 'medium', icon: 'sync-outline' };
      case 'disconnected':
        if (!this._disconnectedLongEnough()) return null;
        return { label: 'Reconnecting…', color: 'warning', icon: 'cloud-offline-outline' };
    }
  });

  timerId: ReturnType<typeof setTimeout> | null = null;

  setStatus(status: SyncStatus): void {
    this._syncStatus.set(status);
    // Replicate the effect logic
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (status === 'disconnected') {
      this.timerId = setTimeout(() => {
        this._disconnectedLongEnough.set(true);
        this.timerId = null;
      }, DISCONNECTED_WARNING_DELAY_MS);
    } else {
      this._disconnectedLongEnough.set(false);
    }
  }

  destroy(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}

describe('ConnectionChipComponent display() logic', () => {
  let harness: ChipHarness;

  beforeEach(() => {
    vi.useFakeTimers();
    harness = new ChipHarness();
    harness.setStatus('connected');
  });

  afterEach(() => {
    harness.destroy();
    vi.useRealTimers();
  });

  it('returns null when status is "connected"', () => {
    harness.setStatus('connected');
    expect(harness.display()).toBeNull();
  });

  it('returns null when status is "offline"', () => {
    harness.setStatus('offline');
    expect(harness.display()).toBeNull();
  });

  it('returns Connecting chip when status is "connecting"', () => {
    harness.setStatus('connecting');
    const chip = harness.display();
    expect(chip).not.toBeNull();
    expect(chip!.label).toBe('Connecting…');
    expect(chip!.color).toBe('medium');
    expect(chip!.icon).toBe('sync-outline');
  });

  it('returns null for "disconnected" before the 5 s debounce elapses', () => {
    harness.setStatus('disconnected');
    vi.advanceTimersByTime(DISCONNECTED_WARNING_DELAY_MS - 1);
    expect(harness.display()).toBeNull();
  });

  it('returns Reconnecting chip after the 5 s debounce elapses', () => {
    harness.setStatus('disconnected');
    vi.advanceTimersByTime(DISCONNECTED_WARNING_DELAY_MS);
    const chip = harness.display();
    expect(chip).not.toBeNull();
    expect(chip!.label).toBe('Reconnecting…');
    expect(chip!.color).toBe('warning');
    expect(chip!.icon).toBe('cloud-offline-outline');
  });

  it('cancels the pending debounce when status transitions back to connected', () => {
    harness.setStatus('disconnected');
    vi.advanceTimersByTime(DISCONNECTED_WARNING_DELAY_MS / 2); // halfway
    harness.setStatus('connected'); // reconnect: should cancel timer
    vi.advanceTimersByTime(DISCONNECTED_WARNING_DELAY_MS); // past deadline
    expect(harness.display()).toBeNull();
  });

  it('rapid blip (disconnected → connected) does not flip the warning chip', () => {
    harness.setStatus('disconnected');
    vi.advanceTimersByTime(100); // brief blip, well under 5 s
    harness.setStatus('connected'); // reconnect before debounce fires
    vi.advanceTimersByTime(DISCONNECTED_WARNING_DELAY_MS * 2);
    expect(harness.display()).toBeNull();
  });
});

describe('ConnectionChipComponent debounce timer cleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the pending timer when destroy() is called', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const harness = new ChipHarness();
    harness.setStatus('disconnected'); // arms a timer

    harness.destroy(); // must cancel the pending timer

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
    vi.advanceTimersByTime(DISCONNECTED_WARNING_DELAY_MS * 2); // drain remaining
  });
});
