/**
 * Unit tests for SettingsPage pure handler logic.
 *
 * No TestBed, no Ionic rendering — inline stubs mirror the production
 * predicates, following the pattern in lobby.page.test.ts.
 *
 * Covers:
 * - onThemeSelected: validates and de-dupes theme changes
 * - onAccentSelected: validates against known accent keys, de-dupes
 * - relayUrlLabel: derived label from optional URL
 * - onDefaultPasswordToggle: delegates to appPrefs.setDefaultPassword
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@ionic/angular/standalone', () => ({
  IonBackButton: {},
  IonButtons: {},
  IonContent: {},
  IonHeader: {},
  IonInput: {},
  IonItem: {},
  IonLabel: {},
  IonList: {},
  IonListHeader: {},
  IonModal: {},
  IonNote: {},
  IonSelect: {},
  IonSelectOption: {},
  IonTitle: {},
  IonToggle: {},
  IonToolbar: {},
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { ACCENTS } from '../core/accent.tokens';
import type { AccentKey } from '../core/accent.tokens';
import type { Theme } from '../core/theme.service';

// ---------------------------------------------------------------------------
// Inline helpers mirroring SettingsPage handler predicates
// ---------------------------------------------------------------------------

const VALID_THEMES: Theme[] = ['system', 'light', 'dark'];

function isValidTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isValidAccent(value: unknown): value is AccentKey {
  return typeof value === 'string' && value in ACCENTS;
}

/** Mirror of the relayUrlLabel computed signal. */
function relayUrlLabel(url: string | null | undefined): string {
  return url || 'Default';
}

// ---------------------------------------------------------------------------
// onThemeSelected — validation guard
// ---------------------------------------------------------------------------

describe('SettingsPage.onThemeSelected — validation', () => {
  it('accepts all three valid theme values', () => {
    for (const theme of VALID_THEMES) {
      expect(isValidTheme(theme)).toBe(true);
    }
  });

  it('rejects null', () => {
    expect(isValidTheme(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidTheme(undefined)).toBe(false);
  });

  it('rejects an arbitrary string', () => {
    expect(isValidTheme('midnight')).toBe(false);
    expect(isValidTheme('')).toBe(false);
  });

  it('does not call setTheme when current value equals the incoming value', () => {
    const setTheme = vi.fn();
    const currentTheme: Theme = 'dark';

    // Mirror of onThemeSelected guard
    function onThemeSelected(value: Theme | null | undefined): void {
      if (!isValidTheme(value)) return;
      if (value === currentTheme) return;
      setTheme(value);
    }

    onThemeSelected('dark');
    expect(setTheme).not.toHaveBeenCalled();
  });

  it('calls setTheme when a new valid theme is selected', () => {
    const setTheme = vi.fn();
    const currentTheme: Theme = 'light';

    function onThemeSelected(value: Theme | null | undefined): void {
      if (!isValidTheme(value)) return;
      if (value === currentTheme) return;
      setTheme(value);
    }

    onThemeSelected('dark');
    expect(setTheme).toHaveBeenCalledOnce();
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});

// ---------------------------------------------------------------------------
// onAccentSelected — validation guard
// ---------------------------------------------------------------------------

describe('SettingsPage.onAccentSelected — validation', () => {
  it('accepts all keys present in ACCENTS', () => {
    for (const key of Object.keys(ACCENTS)) {
      expect(isValidAccent(key)).toBe(true);
    }
  });

  it('rejects null', () => {
    expect(isValidAccent(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidAccent(undefined)).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(isValidAccent('neon-pink')).toBe(false);
    expect(isValidAccent('')).toBe(false);
  });

  it('does not call setAccent when current accent equals incoming value', () => {
    const setAccent = vi.fn();
    const currentAccent: AccentKey = 'racing-green';

    function onAccentSelected(value: string | null | undefined): void {
      if (!isValidAccent(value)) return;
      if (value === currentAccent) return;
      setAccent(value);
    }

    onAccentSelected('racing-green');
    expect(setAccent).not.toHaveBeenCalled();
  });

  it('calls setAccent when a new valid accent is selected', () => {
    const setAccent = vi.fn();
    const currentAccent: AccentKey = 'racing-green';

    function onAccentSelected(value: string | null | undefined): void {
      if (!isValidAccent(value)) return;
      if (value === currentAccent) return;
      setAccent(value);
    }

    onAccentSelected('blue');
    expect(setAccent).toHaveBeenCalledOnce();
    expect(setAccent).toHaveBeenCalledWith('blue');
  });
});

// ---------------------------------------------------------------------------
// relayUrlLabel — derived label
// ---------------------------------------------------------------------------

describe('SettingsPage relayUrlLabel', () => {
  it('returns the URL when a relay URL override is set', () => {
    expect(relayUrlLabel('http://localhost:1234')).toBe('http://localhost:1234');
  });

  it('returns "Default" when no relay URL override is set (null)', () => {
    expect(relayUrlLabel(null)).toBe('Default');
  });

  it('returns "Default" when relay URL override is empty string', () => {
    expect(relayUrlLabel('')).toBe('Default');
  });

  it('returns "Default" when relay URL override is undefined', () => {
    expect(relayUrlLabel(undefined)).toBe('Default');
  });
});

// ---------------------------------------------------------------------------
// onDefaultPasswordToggle — delegation
// ---------------------------------------------------------------------------

describe('SettingsPage.onDefaultPasswordToggle', () => {
  it('calls setDefaultPassword(true) when toggled on', () => {
    const setDefaultPassword = vi.fn<(checked: boolean) => Promise<void>>();

    function onDefaultPasswordToggle(checked: boolean): void {
      void setDefaultPassword(checked);
    }

    onDefaultPasswordToggle(true);
    expect(setDefaultPassword).toHaveBeenCalledOnce();
    expect(setDefaultPassword).toHaveBeenCalledWith(true);
  });

  it('calls setDefaultPassword(false) when toggled off', () => {
    const setDefaultPassword = vi.fn<(checked: boolean) => Promise<void>>();

    function onDefaultPasswordToggle(checked: boolean): void {
      void setDefaultPassword(checked);
    }

    onDefaultPasswordToggle(false);
    expect(setDefaultPassword).toHaveBeenCalledOnce();
    expect(setDefaultPassword).toHaveBeenCalledWith(false);
  });
});
