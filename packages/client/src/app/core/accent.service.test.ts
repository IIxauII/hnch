/**
 * AccentService unit tests.
 *
 * Uses jsdom for DOM access (classList, style). Mocks Capacitor Preferences
 * and MutationObserver to test CSS var writing, dark-mode override flipping,
 * and persistence in isolation.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Capacitor Preferences
// ---------------------------------------------------------------------------

const mockPreferences = {
  get: vi.fn<(opts: { key: string }) => Promise<{ value: string | null }>>(),
  set: vi.fn<(opts: { key: string; value: string }) => Promise<void>>(),
};

vi.mock('@capacitor/preferences', () => ({
  Preferences: mockPreferences,
}));

// ---------------------------------------------------------------------------
// MutationObserver mock
// ---------------------------------------------------------------------------

type MutationCb = MutationCallback;

let capturedMutationCallback: MutationCb | null = null;

class MockMutationObserver {
  constructor(cb: MutationCb) {
    capturedMutationCallback = cb;
  }
  observe = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('MutationObserver', MockMutationObserver);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DARK_CLASS = 'ion-palette-dark';

function triggerClassMutation(): void {
  if (capturedMutationCallback) {
    capturedMutationCallback([], new MockMutationObserver(() => {}) as unknown as MutationObserver);
  }
}

function getCssVar(name: string): string | null {
  return document.documentElement.style.getPropertyValue(name) || null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccentService', () => {
  beforeEach(() => {
    document.documentElement.classList.remove(DARK_CLASS);
    document.documentElement.style.cssText = '';
    mockPreferences.get.mockReset();
    mockPreferences.set.mockReset();
    capturedMutationCallback = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createService() {
    const mod = await import('./accent.service');
    return new mod.AccentService();
  }

  // -------------------------------------------------------------------------
  // Defaults
  // -------------------------------------------------------------------------

  it('defaults to racing-green when storage is empty', async () => {
    mockPreferences.get.mockResolvedValue({ value: null });
    const svc = await createService();
    await svc.loadFromStorage();

    expect(svc.accent()).toBe('racing-green');
    expect(getCssVar('--ion-color-primary')).toBe('#0B3D2E');
  });

  it('defaults to racing-green when stored value is invalid', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'totally-fake' });
    const svc = await createService();
    await svc.loadFromStorage();

    expect(svc.accent()).toBe('racing-green');
  });

  // -------------------------------------------------------------------------
  // setAccent — CSS vars + persistence
  // -------------------------------------------------------------------------

  it('setAccent writes Preferences and updates --ion-color-primary', async () => {
    mockPreferences.get.mockResolvedValue({ value: null });
    mockPreferences.set.mockResolvedValue(undefined);
    const svc = await createService();
    await svc.loadFromStorage();

    await svc.setAccent('blue');

    expect(mockPreferences.set).toHaveBeenCalledWith({
      key: 'hnch.accent',
      value: 'blue',
    });
    expect(getCssVar('--ion-color-primary')).toBe('#0A84FF');
    expect(svc.accent()).toBe('blue');
  });

  it('setAccent writes all six Ionic primary vars', async () => {
    mockPreferences.get.mockResolvedValue({ value: null });
    mockPreferences.set.mockResolvedValue(undefined);
    const svc = await createService();
    await svc.loadFromStorage();

    await svc.setAccent('blue');

    expect(getCssVar('--ion-color-primary-rgb')).toBe('10,132,255');
    expect(getCssVar('--ion-color-primary-contrast')).toBe('#fff');
    expect(getCssVar('--ion-color-primary-contrast-rgb')).toBe('255,255,255');
    // shade + tint are non-empty (exact values not critical here)
    expect(getCssVar('--ion-color-primary-shade')).toBeTruthy();
    expect(getCssVar('--ion-color-primary-tint')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Dark-mode override — graphite
  // -------------------------------------------------------------------------

  it('flips graphite base to #F2F2F7 when dark class is present', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'graphite' });
    const svc = await createService();

    document.documentElement.classList.add(DARK_CLASS);
    await svc.loadFromStorage();

    expect(getCssVar('--ion-color-primary')).toBe('#F2F2F7');
  });

  it('MutationObserver flip: graphite light → dark class added → base flips', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'graphite' });
    const svc = await createService();
    await svc.loadFromStorage();

    // Initially light
    expect(getCssVar('--ion-color-primary')).toBe('#1C1C1E');

    // Add dark class then trigger observer
    document.documentElement.classList.add(DARK_CLASS);
    triggerClassMutation();

    expect(getCssVar('--ion-color-primary')).toBe('#F2F2F7');
  });

  // -------------------------------------------------------------------------
  // Dark-mode override — racing-green
  // -------------------------------------------------------------------------

  it('flips racing-green base to #1F6B4F when dark class is present', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'racing-green' });
    const svc = await createService();

    document.documentElement.classList.add(DARK_CLASS);
    await svc.loadFromStorage();

    expect(getCssVar('--ion-color-primary')).toBe('#1F6B4F');
  });

  it('MutationObserver flip: racing-green dark → light class removed → base restores', async () => {
    document.documentElement.classList.add(DARK_CLASS);
    mockPreferences.get.mockResolvedValue({ value: 'racing-green' });
    const svc = await createService();
    await svc.loadFromStorage();

    // Dark override active
    expect(getCssVar('--ion-color-primary')).toBe('#1F6B4F');

    // Remove dark class then trigger observer
    document.documentElement.classList.remove(DARK_CLASS);
    triggerClassMutation();

    expect(getCssVar('--ion-color-primary')).toBe('#0B3D2E');
  });

  // -------------------------------------------------------------------------
  // hexToRgbTuple helper
  // -------------------------------------------------------------------------

  it('hexToRgbTuple parses #0A84FF → 10,132,255', async () => {
    const { hexToRgbTuple } = await import('./accent.service');
    expect(hexToRgbTuple('#0A84FF')).toBe('10,132,255');
  });

  it('hexToRgbTuple parses lowercase hex', async () => {
    const { hexToRgbTuple } = await import('./accent.service');
    expect(hexToRgbTuple('#0a84ff')).toBe('10,132,255');
  });

  it('hexToRgbTuple parses 3-char shorthand', async () => {
    const { hexToRgbTuple } = await import('./accent.service');
    // #fff → 255,255,255
    expect(hexToRgbTuple('#fff')).toBe('255,255,255');
  });

  // -------------------------------------------------------------------------
  // shade / tint helpers
  // -------------------------------------------------------------------------

  it('shade darkens by percentage', async () => {
    const { shade } = await import('./accent.service');
    // #ffffff at 0% = #ffffff
    expect(shade('#ffffff', 0)).toBe('#ffffff');
    // Full black at 100%
    expect(shade('#ffffff', 100)).toBe('#000000');
  });

  it('tint lightens toward white', async () => {
    const { tint } = await import('./accent.service');
    expect(tint('#000000', 100)).toBe('#ffffff');
    expect(tint('#000000', 0)).toBe('#000000');
  });

  // -------------------------------------------------------------------------
  // Persistence round-trip
  // -------------------------------------------------------------------------

  it('reads persisted value from Preferences on loadFromStorage', async () => {
    mockPreferences.get.mockResolvedValue({ value: 'teal' });
    const svc = await createService();
    await svc.loadFromStorage();

    expect(mockPreferences.get).toHaveBeenCalledWith({ key: 'hnch.accent' });
    expect(svc.accent()).toBe('teal');
    expect(getCssVar('--ion-color-primary')).toBe('#40C8E0');
  });
});
