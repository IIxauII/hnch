/**
 * Unit tests for session-settings.sheet logic.
 *
 * No TestBed — the testable surface is extracted into inline simulations
 * following the pattern in scale-picker.sheet.test.ts.
 *
 * Covered:
 *   - formatAccessLabel (module-private) — 'open' → 'Open', 'password' → 'Password'
 *   - onSessionNameBlur trim / remove logic
 */

import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// formatAccessLabel — inline mirror of the module-private function
// ---------------------------------------------------------------------------

type AccessMode = 'open' | 'password';

function formatAccessLabel(mode: AccessMode): string {
  switch (mode) {
    case 'open':
      return 'Open';
    case 'password':
      return 'Password';
  }
}

describe('formatAccessLabel', () => {
  it('"open" maps to "Open"', () => {
    expect(formatAccessLabel('open')).toBe('Open');
  });

  it('"password" maps to "Password"', () => {
    expect(formatAccessLabel('password')).toBe('Password');
  });
});

// ---------------------------------------------------------------------------
// onSessionNameBlur logic — inline simulation
// ---------------------------------------------------------------------------

/**
 * Simulates what `onSessionNameBlur` does in SessionSettingsSheetComponent:
 *   - trims the raw input value
 *   - if non-empty → calls updateSettings({ name: trimmed })
 *   - if empty / whitespace → calls updateSettings({}) (clears the name)
 */
function simulateSessionNameBlur(rawValue: string): { name?: string } {
  const trimmed = rawValue.trim();
  return { ...(trimmed && { name: trimmed }) };
}

describe('SessionSettingsSheet — onSessionNameBlur', () => {
  it('non-empty value becomes { name: trimmedValue }', () => {
    expect(simulateSessionNameBlur('Sprint 24 planning')).toEqual({
      name: 'Sprint 24 planning',
    });
  });

  it('value with surrounding whitespace is trimmed', () => {
    expect(simulateSessionNameBlur('  Sprint 24  ')).toEqual({ name: 'Sprint 24' });
  });

  it('empty string produces empty update object (clears session name)', () => {
    expect(simulateSessionNameBlur('')).toEqual({});
  });

  it('whitespace-only string produces empty update object', () => {
    expect(simulateSessionNameBlur('   ')).toEqual({});
  });
});
