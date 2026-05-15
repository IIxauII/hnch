/**
 * Unit tests for ConnectionChipComponent.
 *
 * Two strategies:
 *  1. Source-file structural checks — fast assertions on the template's
 *     accessibility and colour attributes.
 *  2. computeChipDisplay() pure-function tests — import the real exported
 *     function and assert each switch branch directly. No simulation.
 *
 * Debounce integration (timer arms, cancels, fires) is covered by the
 * e2e session-disconnect flow; it requires driving the Angular effect()
 * with a live WebSocket, which is out of scope for unit tests.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// Mock Ionic/Capacitor imports that the component pulls in transitively
vi.mock('@ionic/angular/standalone', () => ({ IonChip: {}, IonIcon: {}, IonLabel: {} }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('ionicons', () => ({ addIcons: () => {} }));
vi.mock('ionicons/icons', () => ({ cloudOfflineOutline: '', syncOutline: '' }));

// Exercises: connection-chip.component:computeChipDisplay, ChipState, DISCONNECTED_WARNING_DELAY_MS
import { DISCONNECTED_WARNING_DELAY_MS, computeChipDisplay } from './connection-chip.component';

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
// Part 2 — computeChipDisplay pure-function tests
// ---------------------------------------------------------------------------

describe('computeChipDisplay', () => {
  it('returns null when status is "connected"', () => {
    expect(computeChipDisplay('connected', false)).toBeNull();
    expect(computeChipDisplay('connected', true)).toBeNull();
  });

  it('returns null when status is "offline"', () => {
    expect(computeChipDisplay('offline', false)).toBeNull();
    expect(computeChipDisplay('offline', true)).toBeNull();
  });

  it('returns Connecting chip when status is "connecting"', () => {
    const chip = computeChipDisplay('connecting', false);
    expect(chip).not.toBeNull();
    expect(chip!.label).toBe('Connecting…');
    expect(chip!.color).toBe('medium');
    expect(chip!.icon).toBe('sync-outline');
    expect(chip!.ariaLabel).toContain('Connecting');
  });

  it('connecting chip is independent of disconnectedLongEnough flag', () => {
    const a = computeChipDisplay('connecting', false);
    const b = computeChipDisplay('connecting', true);
    expect(a).toEqual(b);
  });

  it('returns null for "disconnected" when debounce has not yet elapsed', () => {
    expect(computeChipDisplay('disconnected', false)).toBeNull();
  });

  it('returns Reconnecting chip for "disconnected" after debounce elapses', () => {
    const chip = computeChipDisplay('disconnected', true);
    expect(chip).not.toBeNull();
    expect(chip!.label).toBe('Reconnecting…');
    expect(chip!.color).toBe('warning');
    expect(chip!.icon).toBe('cloud-offline-outline');
    expect(chip!.ariaLabel).toContain('Disconnected');
  });
});
